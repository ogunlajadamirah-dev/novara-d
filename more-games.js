// more-games.js — Rock Paper Scissors, Number Guessing, Would You Rather.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

// ==================== ROCK PAPER SCISSORS ====================
const RPS_CHOICES = ['rock', 'paper', 'scissors'];
const RPS_REWARD = 25;

function rpsResult(userChoice, botChoice) {
  if (userChoice === botChoice) return 'tie';
  const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  return beats[userChoice] === botChoice ? 'win' : 'lose';
}

async function startRPS(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 Rock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 Paper').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ Scissors').setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({ content: `🎮 Rock Paper Scissors — pick one! Win = +${RPS_REWARD} coins.`, components: [row] });
}

async function handleRPSButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('rps_')) return false;
  const userChoice = interaction.customId.replace('rps_', '');
  const botChoice = RPS_CHOICES[Math.floor(Math.random() * 3)];
  const result = rpsResult(userChoice, botChoice);

  const user = getUser(interaction.user.id);
  let text;
  if (result === 'win') {
    user.coins += RPS_REWARD;
    saveUser(interaction.user.id, user);
    text = `You chose **${userChoice}**, I chose **${botChoice}** — you win! +${RPS_REWARD} coins.`;
  } else if (result === 'lose') {
    text = `You chose **${userChoice}**, I chose **${botChoice}** — you lose! Better luck next time.`;
  } else {
    text = `You chose **${userChoice}**, I chose **${botChoice}** — it's a tie!`;
  }

  await interaction.update({ content: text, components: [] });
  return true;
}

// ==================== NUMBER GUESSING ====================
const NUMBER_REWARD = 35;
const activeNumberGames = new Map(); // channelId -> { number, min, max, attempts }

async function startNumberGuess(channel) {
  if (activeNumberGames.has(channel.id)) {
    await channel.send('A number-guessing game is already active in this channel!');
    return;
  }
  const number = Math.floor(Math.random() * 100) + 1;
  activeNumberGames.set(channel.id, { number, min: 1, max: 100, attempts: 0 });
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle('🔢 Guess the Number')
        .setDescription(`I'm thinking of a number between **1 and 100**. Type your guess in chat!\nFirst correct guess wins **${NUMBER_REWARD}** coins.`),
    ],
  });
}

// Call from messageCreate — returns true if it handled the message
async function handleNumberGuess(message) {
  const game = activeNumberGames.get(message.channel.id);
  if (!game) return false;

  const guess = parseInt(message.content.trim(), 10);
  if (isNaN(guess)) return false; // not a number, ignore silently

  game.attempts += 1;

  if (guess === game.number) {
    const user = getUser(message.author.id);
    user.coins += NUMBER_REWARD;
    saveUser(message.author.id, user);
    await message.reply(`🎯 Correct! The number was **${game.number}**. You got it in ${game.attempts} attempts. +${NUMBER_REWARD} coins!`);
    activeNumberGames.delete(message.channel.id);
  } else if (guess < game.number) {
    await message.reply('📈 Higher!');
  } else {
    await message.reply('📉 Lower!');
  }
  return true;
}

// ==================== WOULD YOU RATHER ====================
const WYR_QUESTIONS = [
  ['Only write in first person forever', 'Only write in third person forever'],
  ['Have your favorite novel finish, but end badly', 'Have it stay unfinished forever'],
  ['Read 1 amazing book a year', 'Read 50 mediocre books a year'],
  ['Write the perfect opening line but a mediocre ending', 'A mediocre opening but a perfect ending'],
  ['Only read physical books forever', 'Only read on a screen forever'],
  ['Be able to talk to any fictional character', 'Be able to live inside any book for a day'],
  ['Have unlimited time to write, no talent boost', 'Incredible talent, but only 1 hour a week to use it'],
];

async function startWouldYouRather(interaction) {
  const [a, b] = WYR_QUESTIONS[Math.floor(Math.random() * WYR_QUESTIONS.length)];
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle('🤔 Would You Rather')
    .setDescription(`**A)** ${a}\n\n**B)** ${b}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wyr_a').setLabel('A').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wyr_b').setLabel('B').setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleWYRButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('wyr_')) return false;
  const choice = interaction.customId === 'wyr_a' ? 'A' : 'B';
  await interaction.reply({ content: `${interaction.user.username} picked **${choice}**!`, ephemeral: false });
  return true;
}

module.exports = {
  startRPS,
  handleRPSButton,
  startNumberGuess,
  handleNumberGuess,
  startWouldYouRather,
  handleWYRButton,
};
