import { v4 as uuidv4 } from 'uuid';
import { getRoom, saveRoom, deleteRoom } from './store.js';
import { buildDeck, dealCards, getValidCards, shuffle } from './gameLogic.js';

// ─── GENERATE ROOM CODE ───────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────
export async function createRoom(playerName, socketId) {
  const code = generateCode();
  const playerId = uuidv4();

  const room = {
    code,
    hostId: playerId,
    status: 'lobby', // 'lobby' | 'playing' | 'finished'
    players: [
      { id: playerId, name: playerName, socketId, hand: [], connected: true }
    ],
    deck: [],
    discard: [],
    currentColor: null,
    currentPlayerIndex: 0,
    direction: 1,
    pendingDraw: 0,
    winner: null,
    lastAction: null,
    createdAt: Date.now(),
  };

  await saveRoom(room);
  return { room, playerId };
}

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────
export async function joinRoom(code, playerName, socketId) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'lobby') return { error: 'Game already started' };
  if (room.players.length >= 4) return { error: 'Room is full (max 4 players)' };

  const nameTaken = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
  if (nameTaken) return { error: 'Name already taken in this room' };

  const playerId = uuidv4();
  room.players.push({
    id: playerId, name: playerName, socketId, hand: [], connected: true
  });

  await saveRoom(room);
  return { room, playerId };
}

// ─── REJOIN (reconnect) ───────────────────────────────────────────────────────
export async function rejoinRoom(code, playerId, socketId) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: 'Player not found in room' };

  player.socketId = socketId;
  player.connected = true;
  await saveRoom(room);
  return { room, playerId };
}

// ─── START GAME ───────────────────────────────────────────────────────────────
export async function startGame(code, requesterId) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.hostId !== requesterId) return { error: 'Only the host can start' };
  if (room.players.length < 2) return { error: 'Need at least 2 players' };
  if (room.status !== 'lobby') return { error: 'Game already started' };

  const deck = buildDeck();
  const { hands, startCard, deck: remaining } = dealCards(deck, room.players.length);

  room.players.forEach((p, i) => { p.hand = hands[i]; });
  room.deck = remaining;
  room.discard = [startCard];
  room.currentColor = startCard.color;
  room.currentPlayerIndex = 0;
  room.direction = 1;
  room.status = 'playing';
  room.pendingDraw = 0;
  room.lastAction = `Game started! ${room.players[0].name} goes first.`;

  await saveRoom(room);
  return { room };
}

// ─── PLAY CARD ────────────────────────────────────────────────────────────────
export async function playCard(code, playerId, cardId, chosenColor = null) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'playing') return { error: 'Game not active' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex !== room.currentPlayerIndex) return { error: 'Not your turn' };

  const player = room.players[playerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not in hand' };

  const card = player.hand[cardIndex];
  const topCard = room.discard[room.discard.length - 1];
  const validCards = getValidCards(player.hand, topCard, room.currentColor);

  if (!validCards.find(c => c.id === cardId)) {
    return { error: 'Invalid play' };
  }

  // Remove card from hand
  player.hand.splice(cardIndex, 1);
  room.discard.push(card);

  // Handle wild color choice
  if (card.color === 'wild') {
    if (!chosenColor || !['red','blue','green','yellow'].includes(chosenColor)) {
      return { error: 'Must choose a color for wild card' };
    }
    room.currentColor = chosenColor;
  } else {
    room.currentColor = card.color;
  }

  // Check win
  if (player.hand.length === 0) {
    room.status = 'finished';
    room.winner = { id: player.id, name: player.name };
    room.lastAction = `🎉 ${player.name} wins!`;
    await saveRoom(room);
    return { room };
  }

  // Apply effect
  let skipCount = 0;
  switch (card.value) {
    case 'skip':
      skipCount = 1;
      room.lastAction = `${player.name} played Skip! Next player loses their turn.`;
      break;
    case 'reverse':
      room.direction *= -1;
      if (room.players.length === 2) skipCount = 1; // reverse = skip in 2-player
      room.lastAction = `${player.name} played Reverse! Direction changed.`;
      break;
    case 'draw2':
      room.pendingDraw += 2;
      skipCount = 1;
      room.lastAction = `${player.name} played Draw Two!`;
      break;
    case 'wild4':
      room.pendingDraw += 4;
      skipCount = 1;
      room.lastAction = `${player.name} played Wild Draw Four! Color: ${room.currentColor}`;
      break;
    case 'wild':
      room.lastAction = `${player.name} played Wild! Color: ${room.currentColor}`;
      break;
    default:
      room.lastAction = `${player.name} played ${card.color} ${card.value}`;
  }

  // Advance turn
  const n = room.players.length;
  room.currentPlayerIndex = (((room.currentPlayerIndex + room.direction * (1 + skipCount)) % n) + n) % n;

  // Force pending draws on next player
  if (room.pendingDraw > 0) {
    const nextPlayer = room.players[room.currentPlayerIndex];
    for (let i = 0; i < room.pendingDraw; i++) {
      if (room.deck.length === 0) {
        // Reshuffle
        const top = room.discard.pop();
        room.deck = shuffle([...room.discard]);
        room.discard = [top];
      }
      if (room.deck.length > 0) nextPlayer.hand.push(room.deck.shift());
    }
    room.lastAction += ` ${nextPlayer.name} draws ${room.pendingDraw} cards!`;
    room.pendingDraw = 0;
    // Skip again — they already drew
    room.currentPlayerIndex = (((room.currentPlayerIndex + room.direction) % n) + n) % n;
  }

  await saveRoom(room);
  return { room };
}

// ─── DRAW CARD ────────────────────────────────────────────────────────────────
export async function drawCard(code, playerId) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'playing') return { error: 'Game not active' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex !== room.currentPlayerIndex) return { error: 'Not your turn' };

  const player = room.players[playerIndex];

  // Reshuffle if needed
  if (room.deck.length === 0) {
    if (room.discard.length <= 1) return { error: 'No cards left' };
    const top = room.discard.pop();
    room.deck = shuffle([...room.discard]);
    room.discard = [top];
  }

  const drawnCard = room.deck.shift();
  player.hand.push(drawnCard);
  room.lastAction = `${player.name} drew a card.`;

  // Advance turn
  const n = room.players.length;
  room.currentPlayerIndex = (((room.currentPlayerIndex + room.direction) % n) + n) % n;

  await saveRoom(room);
  return { room, drawnCard };
}

// ─── LEAVE GAME (voluntary exit) ─────────────────────────────────────────────
export async function leaveGame(code, playerId) {
  const room = await getRoom(code);
  if (!room) return { error: 'Room not found' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { error: 'Player not found' };

  const player = room.players[playerIndex];
  const playerName = player.name;
  const wasCurrentPlayer = playerIndex === room.currentPlayerIndex;

  room.players.splice(playerIndex, 1);

  if (room.players.length === 0) {
    await deleteRoom(code);
    return { room: null, playerName, roomDeleted: true };
  }

  if (room.status === 'lobby') {
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
    }
    await saveRoom(room);
    return { room, playerName, roomDeleted: false };
  }

  if (room.status === 'playing') {
    if (room.players.length === 1) {
      room.status = 'finished';
      room.winner = { id: room.players[0].id, name: room.players[0].name };
      room.lastAction = `${playerName} left. ${room.players[0].name} wins!`;
      await saveRoom(room);
      return { room, playerName, roomDeleted: false };
    }

    if (wasCurrentPlayer) {
      const n = room.players.length;
      room.currentPlayerIndex = (((room.currentPlayerIndex) % n) + n) % n;
    }

    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
    }

    room.lastAction = `${playerName} left the game.`;
    await saveRoom(room);
    return { room, playerName, roomDeleted: false };
  }

  await saveRoom(room);
  return { room, playerName, roomDeleted: false };
}

// ─── DISCONNECT PLAYER ────────────────────────────────────────────────────────
export async function disconnectPlayer(socketId) {
  const { getAllRooms, saveRoom: save, deleteRoom: del } = await import('./store.js');
  const rooms = await getAllRooms();

  for (const room of rooms) {
    const player = room.players.find(p => p.socketId === socketId);
    if (!player) continue;

    player.connected = false;
    const anyConnected = room.players.some(p => p.connected);

    if (!anyConnected) {
      await del(room.code);
    } else {
      if (room.status === 'lobby' && room.hostId === player.id) {
        const newHost = room.players.find(p => p.connected);
        if (newHost) room.hostId = newHost.id;
      }
      // Don't end the game on disconnect - allow reconnection
      // The player can rejoin and continue playing
      await save(room);
    }
    return { room, disconnectedPlayer: player };
  }
  return null;
}


