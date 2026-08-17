// leveling.js — XP from chatting, with a cooldown so people can't spam for levels.

const { getUser, saveUser, getAllUsers } = require('./storage');

const XP_COOLDOWN_MS = 60 * 1000; // one XP grant per minute per user
const XP_PER_MESSAGE_MIN = 5;
const XP_PER_MESSAGE_MAX = 15;

function xpForNextLevel(level) {
  return level * 100; // level 1->2 needs 100xp, 2->3 needs 200xp, etc.
}

// Returns { leveledUp, newLevel } if XP was granted, or null if on cooldown
function grantMessageXp(userId) {
  const user = getUser(userId);
  const now = Date.now();
  if (now - user.lastXpGain < XP_COOLDOWN_MS) return null;

  const gained = Math.floor(Math.random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1)) + XP_PER_MESSAGE_MIN;
  user.xp += gained;
  user.lastXpGain = now;

  let leveledUp = false;
  while (user.xp >= xpForNextLevel(user.level)) {
    user.xp -= xpForNextLevel(user.level);
    user.level += 1;
    leveledUp = true;
    user.coins += 50; // level-up bonus coins
  }

  saveUser(userId, user);
  return { leveledUp, newLevel: user.level, gained };
}

function getLeaderboard(limit = 10) {
  const users = getAllUsers();
  return Object.entries(users)
    .map(([userId, u]) => ({ userId, ...u }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp))
    .slice(0, limit);
}

function getCoinLeaderboard(limit = 10) {
  const users = getAllUsers();
  return Object.entries(users)
    .map(([userId, u]) => ({ userId, ...u }))
    .sort((a, b) => b.coins - a.coins)
    .slice(0, limit);
}

module.exports = { grantMessageXp, xpForNextLevel, getLeaderboard, getCoinLeaderboard };
