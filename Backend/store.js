import Redis from 'ioredis';

// ─── REDIS CONNECTION ─────────────────────────────────────────────────────────
let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    tls: process.env.REDIS_URL.startsWith('rediss') ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  redis.on('connect', () => console.log('✅ Redis connected'));
  redis.on('error', (e) => console.error('❌ Redis error:', e.message));
} else {
  // Fallback: in-memory Map (for local dev without Redis)
  console.log('⚠️  No REDIS_URL found — using in-memory store (not for production)');
  const store = new Map();
  redis = {
    get: async (k) => store.get(k) ?? null,
    set: async (k, v, ...args) => { store.set(k, v); return 'OK'; },
    del: async (k) => { store.delete(k); return 1; },
    keys: async (pattern) => {
      const prefix = pattern.replace('*', '');
      return [...store.keys()].filter(k => k.startsWith(prefix));
    },
  };
}

const ROOM_TTL = 60 * 60; // 1 hour

// ─── ROOM HELPERS ─────────────────────────────────────────────────────────────
export async function getRoom(code) {
  const raw = await redis.get(`room:${code}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveRoom(room) {
  await redis.set(`room:${room.code}`, JSON.stringify(room), 'EX', ROOM_TTL);
}

export async function deleteRoom(code) {
  await redis.del(`room:${code}`);
}

export async function getAllRooms() {
  const keys = await redis.keys('room:*');
  if (!keys.length) return [];
  const rooms = await Promise.all(keys.map(k => redis.get(k)));
  return rooms.map(r => JSON.parse(r)).filter(Boolean);
}

export default redis;
