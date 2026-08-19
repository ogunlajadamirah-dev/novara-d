// hangman.js — classic hangman, one active game per channel.

const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const WORDS = [
  'community', 'discord', 'keyboard', 'sunshine', 'mountain', 'library',
  'birthday', 'elephant', 'notebook', 'universe', 'festival', 'chocolate',
  'umbrella', 'triangle', 'volcano', 'penguin', 'treasure', 'wonderful',
];

const REWARD = 40;
const MAX_WRONG = 6;
const STAGES = [
  '```\n \n \n \n \n \n```',
  '```\n  +---+\n      |\n      |\n      |\n     ===\n```',
  '```\n  +---+\n  O   |\n      |\n      |\n     ===\n```',
  '```\n  +---+\n  O   |\n  |   |\n      |\n     ===\n```',
  '```\n  +---+\n  O   |\n /|   |\n      |\n     ===\n```',
  '```\n  +---+\n  O   |\n /|\\  |\n      |\n     ===\n```',
  '```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n     ===\n```',
];

const activeGames = new Map(); // channelId -> { word, guessed: Set, wrong: number }

function renderWord(word, guessed) {
  return word
    .split('')
    .map((ch) => (guessed.has(ch) ? ch : '_'))
    .join(' ');
}

function buildEmbed(game, statusText) {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎯 Hangman')
    .setDescription(`${STAGES[game.wrong]}\n\n**Word:** \`${renderWord(game.word, game.guessed)}\`\n**Guessed:** ${[...game.guessed].join(', ') || 'none yet'}\n**Wrong guesses:** ${game.wrong}/${MAX_WRONG}\n\n${statusText || 'Type a single letter to guess.'}`);
}

async function startHangman(channel) {
  if (activeGames.has(channel.id)) {
    await channel.send('A hangman game is already in progress in this channel!');
    return;
  }
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const game = { word, guessed: new Set(), wrong: 0 };
  activeGames.set(channel.id, game);
  await channel.send({ embeds: [buildEmbed(game)] });
}

// Call this from your messageCreate listener for single-letter guesses
async function handleGuess(message) {
  const game = activeGames.get(message.channel.id);
  if (!game) return false;

  const content = message.content.trim().toLowerCase();
  if (!/^[a-z]$/.test(content)) return false; // not a single-letter guess, ignore

  if (game.guessed.has(content)) {
    await message.reply(`Already guessed **${content}**.`);
    return true;
  }
  game.guessed.add(content);

  if (!game.word.includes(content)) {
    game.wrong += 1;
  }

  const won = game.word.split('').every((ch) => game.guessed.has(ch));
  const lost = game.wrong >= MAX_WRONG;

  if (won) {
    const user = getUser(message.author.id);
    user.coins += REWARD;
    saveUser(message.author.id, user);
    await message.channel.send({ embeds: [buildEmbed(game, `🎉 **${message.author.username}** solved it! The word was **${game.word}**. +${REWARD} coins.`)] });
    activeGames.delete(message.channel.id);
  } else if (lost) {
    await message.channel.send({ embeds: [buildEmbed(game, `💀 Out of guesses! The word was **${game.word}**.`)] });
    activeGames.delete(message.channel.id);
  } else {
    await message.channel.send({ embeds: [buildEmbed(game)] });
  }

  return true;
}

module.exports = { startHangman, handleGuess };
