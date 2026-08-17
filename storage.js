// storage.js — simple JSON-file persistence. No external database needed.
// Swap this for Supabase/Postgres later if the server grows large enough
// that file-based storage becomes a bottleneck (thousands of active users).

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to read data.json, starting fresh:', err);
    return { users: {} };
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = load();

function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      coins: 100, // starting balance
      xp: 0,
      level: 1,
      lastDaily: 0,
      lastXpGain: 0,
    };
  }
  return data.users[userId];
}

function saveUser(userId, userData) {
  data.users[userId] = userData;
  save(data);
}

function getAllUsers() {
  return data.users;
}

module.exports = { getUser, saveUser, getAllUsers };
