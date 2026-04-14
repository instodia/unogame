import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createRoom, joinRoom, rejoinRoom,
  startGame, playCard, drawCard, disconnectPlayer
} from './roomManager.js';
import { getValidCards } from './gameLogic.js';

const app = express();
const httpServer = createServer(app);

// ─── CORS ──────────────────────────────────────────────────────────────────────
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'UNO server running 🃏' }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Build public game state (no opponent hands revealed)
function buildPublicState(room, forPlayerId) {
  const topCard = room.discard[room.discard.length - 1];
  return {
    code: room.code,
    status: room.status,
    currentColor: room.currentColor,
    topCard,
    direction: room.direction,
    pendingDraw: room.pendingDraw,
    winner: room.winner,
    lastAction: room.lastAction,
    deckSize: room.deck.length,
    currentPlayerIndex: room.currentPlayerIndex,
    players: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      cardCount: p.hand.length,
      isHost: p.id === room.hostId,
      isCurrent: i === room.currentPlayerIndex,
      // Only send hand to the owner
      hand: p.id === forPlayerId ? p.hand : undefined,
      // Valid cards only for current player
      validCards: (p.id === forPlayerId && i === room.currentPlayerIndex)
        ? getValidCards(p.hand, topCard, room.currentColor).map(c => c.id)
        : undefined,
    })),
  };
}

// Emit full game state to all players individually
function emitGameState(room) {
  room.players.forEach(player => {
    if (!player.socketId) return;
    io.to(player.socketId).emit('game_state', buildPublicState(room, player.id));
  });
}

// Emit lobby state (same for everyone)
function emitLobbyState(room) {
  const lobbyData = {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id: p.id, name: p.name, connected: p.connected, isHost: p.id === room.hostId
    })),
  };
  io.to(room.code).emit('lobby_state', lobbyData);
}

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // ── CREATE ROOM ──────────────────────────────────────────────────────────────
  socket.on('create_room', async ({ playerName }, cb) => {
    try {
      if (!playerName?.trim()) return cb({ error: 'Name required' });
      const { room, playerId } = await createRoom(playerName.trim(), socket.id);
      socket.join(room.code);
      socket.data = { roomCode: room.code, playerId };
      emitLobbyState(room);
      cb({ ok: true, code: room.code, playerId, room: {
        code: room.code, hostId: room.hostId,
        players: room.players.map(p => ({ id: p.id, name: p.name, isHost: true }))
      }});
    } catch (e) {
      console.error('create_room error:', e);
      cb({ error: 'Server error' });
    }
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────────────
  socket.on('join_room', async ({ code, playerName }, cb) => {
    try {
      if (!code?.trim() || !playerName?.trim()) return cb({ error: 'Code and name required' });
      const result = await joinRoom(code.trim().toUpperCase(), playerName.trim(), socket.id);
      if (result.error) return cb({ error: result.error });

      const { room, playerId } = result;
      socket.join(room.code);
      socket.data = { roomCode: room.code, playerId };
      emitLobbyState(room);
      cb({ ok: true, code: room.code, playerId });
    } catch (e) {
      console.error('join_room error:', e);
      cb({ error: 'Server error' });
    }
  });

  // ── REJOIN ROOM ──────────────────────────────────────────────────────────────
  socket.on('rejoin_room', async ({ code, playerId }, cb) => {
    try {
      const result = await rejoinRoom(code, playerId, socket.id);
      if (result.error) return cb({ error: result.error });

      const { room } = result;
      socket.join(room.code);
      socket.data = { roomCode: room.code, playerId };

      if (room.status === 'lobby') {
        emitLobbyState(room);
      } else {
        emitGameState(room);
      }
      cb({ ok: true });
    } catch (e) {
      cb({ error: 'Server error' });
    }
  });

  // ── START GAME ───────────────────────────────────────────────────────────────
  socket.on('start_game', async (_, cb) => {
    try {
      const { roomCode, playerId } = socket.data || {};
      if (!roomCode) return cb?.({ error: 'Not in a room' });

      const result = await startGame(roomCode, playerId);
      if (result.error) return cb?.({ error: result.error });

      const { room } = result;
      emitGameState(room);
      cb?.({ ok: true });
    } catch (e) {
      console.error('start_game error:', e);
      cb?.({ error: 'Server error' });
    }
  });

  // ── PLAY CARD ────────────────────────────────────────────────────────────────
  socket.on('play_card', async ({ cardId, chosenColor }, cb) => {
    try {
      const { roomCode, playerId } = socket.data || {};
      if (!roomCode) return cb?.({ error: 'Not in a room' });

      const result = await playCard(roomCode, playerId, cardId, chosenColor);
      if (result.error) return cb?.({ error: result.error });

      const { room } = result;
      emitGameState(room);
      cb?.({ ok: true });
    } catch (e) {
      console.error('play_card error:', e);
      cb?.({ error: 'Server error' });
    }
  });

  // ── DRAW CARD ────────────────────────────────────────────────────────────────
  socket.on('draw_card', async (_, cb) => {
    try {
      const { roomCode, playerId } = socket.data || {};
      if (!roomCode) return cb?.({ error: 'Not in a room' });

      const result = await drawCard(roomCode, playerId);
      if (result.error) return cb?.({ error: result.error });

      const { room } = result;
      emitGameState(room);
      cb?.({ ok: true });
    } catch (e) {
      console.error('draw_card error:', e);
      cb?.({ error: 'Server error' });
    }
  });

  // ── SEND CHAT ────────────────────────────────────────────────────────────────
  socket.on('send_chat', async ({ message }) => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode || !message?.trim()) return;

    const room = await getRoom(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    io.to(roomCode).emit('chat_message', {
      playerName: player.name,
      message: message.trim().slice(0, 200),
      ts: Date.now(),
    });
  });

  // ── DISCONNECT ───────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    try {
      const result = await disconnectPlayer(socket.id);
      if (!result) return;

      const { room, disconnectedPlayer } = result;
      if (!room) return;

      // Notify remaining players
      io.to(room.code).emit('player_disconnected', {
        playerName: disconnectedPlayer.name,
        remaining: room.players.filter(p => p.connected).length,
      });

      if (room.status === 'playing') {
        emitGameState(room);
      } else {
        emitLobbyState(room);
      }
    } catch (e) {
      console.error('disconnect handler error:', e);
    }
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 UNO server listening on port ${PORT}`);
  console.log(`📡 Accepting connections from: ${CLIENT_URL}`);
});
