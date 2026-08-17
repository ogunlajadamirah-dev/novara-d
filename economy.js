// economy.js — points/coin economy with daily rewards and gambling-style mini games.

const { getUser, saveUser } = require('./storage');

const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function getBalance(userId) {
  return getUser(userId).coins;
}

function claimDaily(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const timeSinceLastClaim = now - user.lastDaily;

  if (timeSinceLastClaim < DAILY_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((DAILY_COOLDOWN_MS - timeSinceLastClaim) / (1000 * 60 * 60));
    return { success: false, hoursLeft };
  }

  user.coins += DAILY_AMOUNT;
  user.lastDaily = now;
  saveUser(userId, user);
  return { success: true, amount: DAILY_AMOUNT, newBalance: user.coins };
}

function coinflip(userId, amount, choice) {
  const user = getUser(userId);
  if (amount <= 0) return { error: 'Bet must be more than 0.' };
  if (amount > user.coins) return { error: `You only have ${user.coins} coins.` };

  const result = Math.random() > 0.5 ? 'heads' : 'tails';
  const won = result === choice;

  user.coins += won ? amount : -amount;
  saveUser(userId, user);

  return { result, won, newBalance: user.coins, amount };
}

const SLOT_SYMBOLS = ['🍒', '🍋', '🍇', '⭐', '💎'];
const SLOT_PAYOUTS = { '💎': 10, '⭐': 5, '🍇': 3, '🍋': 2, '🍒': 1.5 };

function slots(userId, amount) {
  const user = getUser(userId);
  if (amount <= 0) return { error: 'Bet must be more than 0.' };
  if (amount > user.coins) return { error: `You only have ${user.coins} coins.` };

  const spin = [0, 0, 0].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
  const allMatch = spin[0] === spin[1] && spin[1] === spin[2];
  const twoMatch = spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2];

  let winnings = 0;
  if (allMatch) {
    winnings = Math.floor(amount * SLOT_PAYOUTS[spin[0]]);
  } else if (twoMatch) {
    winnings = Math.floor(amount * 0.5); // small consolation payout
  } else {
    winnings = -amount;
  }

  user.coins += winnings;
  saveUser(userId, user);

  return { spin, winnings, newBalance: user.coins, jackpot: allMatch };
}

module.exports = { getBalance, claimDaily, coinflip, slots, DAILY_AMOUNT };
