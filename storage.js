// storage.js — Economy/leveling data (coins, XP, levels). Persisted via
// db-kv.js — Postgres if DATABASE_URL is set, local file otherwise.

const { getKV, setKV } = require('./db-kv');

const KEY = 'economy';

function getData() {
  return getKV(KEY, { users: {} });
}

function getUser(userId) {
  const data = getData();
  if (!data.users[userId]) {
    data.users[userId] = {
      coins: 100, // starting balance
      xp: 0,
      level: 1,
      lastDaily: 0,
      lastXpGain: 0,
    };
    setKV(KEY, data);
  }
  return data.users[userId];
}

function saveUser(userId, userData) {
  const data = getData();
  data.users[userId] = userData;
  setKV(KEY, data);
}

function getAllUsers() {
  return getData().users;
}

module.exports = { getUser, saveUser, getAllUsers };
