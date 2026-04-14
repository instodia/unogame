// ─── CARD DEFINITIONS ────────────────────────────────────────────────────────
const COLORS = ['red', 'blue', 'green', 'yellow'];
const NUMBER_VALUES = ['0','1','2','3','4','5','6','7','8','9'];
const ACTION_VALUES = ['skip', 'reverse', 'draw2'];
const WILD_VALUES = ['wild', 'wild4'];

export function buildDeck() {
  const deck = [];
  let id = 0;

  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: id++, color, value: '0' });
    // Two of each 1-9 and actions
    for (const val of [...NUMBER_VALUES.slice(1), ...ACTION_VALUES]) {
      deck.push({ id: id++, color, value: val });
      deck.push({ id: id++, color, value: val });
    }
  }

  // 4 wilds + 4 wild draw fours
  for (const val of WILD_VALUES) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, color: 'wild', value: val });
    }
  }

  return shuffle(deck);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── VALIDITY CHECK ───────────────────────────────────────────────────────────
export function isValidPlay(card, topCard, currentColor) {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function getValidCards(hand, topCard, currentColor) {
  return hand.filter(c => isValidPlay(c, topCard, currentColor));
}

// ─── DEAL ─────────────────────────────────────────────────────────────────────
export function dealCards(deck, playerCount, cardsEach = 7) {
  const hands = {};
  for (let i = 0; i < playerCount; i++) {
    hands[i] = deck.splice(0, cardsEach);
  }

  // Flip first card — skip wilds as starting card
  let startCard = deck.shift();
  while (startCard.color === 'wild') {
    deck.push(startCard);
    deck = shuffle(deck);
    startCard = deck.shift();
  }

  return { hands, startCard, deck };
}

// ─── APPLY CARD EFFECTS ───────────────────────────────────────────────────────
// Returns { skip, drawCount, reverseDirection }
export function getCardEffect(card) {
  switch (card.value) {
    case 'skip':    return { skip: 1, drawCount: 0, reverse: false };
    case 'reverse': return { skip: 0, drawCount: 0, reverse: true };
    case 'draw2':   return { skip: 1, drawCount: 2, reverse: false };
    case 'wild4':   return { skip: 1, drawCount: 4, reverse: false };
    default:        return { skip: 0, drawCount: 0, reverse: false };
  }
}

// ─── NEXT PLAYER INDEX ────────────────────────────────────────────────────────
export function getNextPlayerIndex(current, direction, playerCount, skipCount = 0) {
  let next = current;
  for (let i = 0; i <= skipCount; i++) {
    next = ((next + direction) % playerCount + playerCount) % playerCount;
  }
  return next;
}

// ─── RESHUFFLE DISCARD INTO DECK ─────────────────────────────────────────────
export function reshuffleIfNeeded(deck, discard) {
  if (deck.length > 0) return { deck, discard };
  if (discard.length <= 1) return { deck, discard }; // nothing to do

  const topCard = discard[discard.length - 1];
  const newDeck = shuffle(discard.slice(0, -1));
  return { deck: newDeck, discard: [topCard] };
}
