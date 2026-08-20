// db-kv.js — Shared persistence layer for the whole bot.
//
// WHY THIS EXISTS: every storage file (storage.js, applications.js,
// moderation.js, self-roles.js) was writing to local JSON files. On
// Railway (and most hosts), the filesystem is REBUILT on every redeploy —
// so any local file gets wiped, taking real applications/warnings/economy
// data with it. This module fixes that by persisting to Postgres instead,
// while keeping the exact same simple get/set API those files already use.
//
// HOW IT WORKS: one Postgres table (`bot_storage`) with two columns —
// `key` (e.g. 'economy', 'applications', 'warnings') and `value` (JSONB
// blob — the same shape that used to be the whole contents of each JSON
// file). Everything is cached in memory for instant synchronous reads;
// writes go to Postgres in the background.
//
// FALLBACK: if DATABASE_URL isn't set (e.g. you haven't added Postgres
// yet), this automatically falls back to local JSON files, same as
// before — so the bot still runs, it just won't survive a redeploy until
// you add a database. A warning is logged so this isn't silent.

const fs = require('fs');
const path = require('path');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const cache = {}; // key -> value, in-memory for sync reads
let pool = null;
let usingPostgres = false;

// ---- Postgres setup (only loads the pg module if actually needed) ----
async function initKVStore() {
  if (DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes('railway') || DATABASE_URL.includes('render') ? { rejectUnauthorized: false } : undefined,
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_storage (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      const { rows } = await pool.query('SELECT key, value FROM bot_storage');
      for (const row of rows) cache[row.key] = row.value;
      usingPostgres = true;
      console.log(`✅ Connected to Postgres — data will survive redeploys. Loaded ${rows.length} storage key(s).`);
    } catch (err) {
      console.error('❌ Failed to connect to Postgres, falling back to local files:', err.message);
      usingPostgres = false;
    }
  } else {
    console.warn('⚠️  No DATABASE_URL set — using local JSON files. This data will be LOST on redeploy. Add a Postgres database and set DATABASE_URL to fix this.');
  }
}

// ---- Local file fallback helpers ----
function localFilePath(key) {
  return path.join(__dirname, `${key}.json`);
}

function loadFromLocalFile(key, defaultValue) {
  const filePath = localFilePath(key);
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function saveToLocalFile(key, value) {
  fs.writeFileSync(localFilePath(key), JSON.stringify(value, null, 2));
}

// ---- Public API — same shape regardless of backend ----

// Synchronous read from cache. `defaultValue` is used (and cached) the
// first time a key is read before anything has been saved to it.
function getKV(key, defaultValue) {
  if (cache[key] !== undefined) return cache[key];
  const loaded = usingPostgres ? undefined : loadFromLocalFile(key, undefined);
  cache[key] = loaded !== undefined ? loaded : defaultValue;
  return cache[key];
}

// Synchronous write to cache + fire-and-forget persist. Callers don't need
// to await this — reads immediately see the new value from cache, and the
// durable write happens in the background.
function setKV(key, value) {
  cache[key] = value;
  if (usingPostgres && pool) {
    pool
      .query(
        `INSERT INTO bot_storage (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      )
      .catch((err) => console.error(`Failed to persist key "${key}" to Postgres:`, err.message));
  } else {
    try {
      saveToLocalFile(key, value);
    } catch (err) {
      console.error(`Failed to persist key "${key}" to local file:`, err.message);
    }
  }
}

function isUsingPostgres() {
  return usingPostgres;
}

module.exports = { initKVStore, getKV, setKV, isUsingPostgres };
