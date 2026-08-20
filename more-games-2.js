// more-games-2.js — 8ball, Math Race, Emoji Riddle, Typing Speed Test.

const { EmbedBuilder } = require('discord.js');
const { getUser, saveUser } = require('./storage');

// ==================== MAGIC 8-BALL ====================
const EIGHTBALL_ANSWERS = [
  'Yes, absolutely.', 'Without a doubt.', 'Most likely.', 'Signs point to yes.',
  'Ask again later.', 'Cannot predict right now.', 'Concentrate and ask again.',
  'Don\'t count on it.', 'My reply is no.', 'Outlook not so good.', 'Very doubtful.',
];

async function handle8Ball(interaction) {
  const question = interaction.options.getString('question');
  const answer = EIGHTBALL_ANSWERS[Math.floor(Math.random() * EIGHTBALL_ANSWERS.length)];
  const embed = new EmbedBuilder()
    .setColor(0x2c3e50)
    .setTitle('🎱 Magic 8-Ball')
    .addFields({ name: 'Question', value: question }, { name: 'Answer', value: answer });
  await interaction.reply({ embeds: [embed] });
}

// ==================== MATH RACE ====================
const MATH_REWARD = 30;
const activeMathGames = new Map();

function generateMathProblem() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  if (op === '*') {
    a = Math.floor(Math.random() * 12) + 1;
    b = Math.floor(Math.random() * 12) + 1;
    answer = a * b;
  } else {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = op === '+' ? a + b : a - b;
  }
  return { expression: `${a} ${op} ${b}`, answer };
}

async function startMathRace(channel) {
  if (activeMathGames.has(channel.id)) {
    await channel.send('A math race is already active in this channel!');
    return;
  }
  const { expression, answer } = generateMathProblem();
  activeMathGames.set(channel.id, { answer, expression, startedAt: Date.now() });
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x16a085)
        .setTitle('⚡ Math Race')
        .setDescription(`First to solve wins **${MATH_REWARD}** coins!\n\n## ${expression} = ?`),
    ],
  });

  setTimeout(() => {
    if (activeMathGames.has(channel.id)) {
      activeMathGames.delete(channel.id);
      channel.send(`⏱️ Time's up! The answer was **${answer}**.`).catch(() => {});
    }
  }, 20000);
}

async function handleMathGuess(message) {
  const game = activeMathGames.get(message.channel.id);
  if (!game) return false;
  const guess = parseInt(message.content.trim(), 10);
  if (isNaN(guess)) return false;

  if (guess === game.answer) {
    const timeTaken = ((Date.now() - game.startedAt) / 1000).toFixed(1);
    const user = getUser(message.author.id);
    user.coins += MATH_REWARD;
    saveUser(message.author.id, user);
    await message.reply(`⚡ Correct! ${game.expression} = **${game.answer}** — solved in ${timeTaken}s. +${MATH_REWARD} coins!`);
    activeMathGames.delete(message.channel.id);
    return true;
  }
  return false;
}

// ==================== EMOJI RIDDLE ====================
const EMOJI_RIDDLES = [
  { emojis: '🦁👑', answer: 'lion king', hint: 'Disney movie' },
  { emojis: '🕷️🧑', answer: 'spider man', hint: 'Superhero' },
  { emojis: '🐠🔍', answer: 'finding nemo', hint: 'Disney/Pixar movie' },
  { emojis: '❄️👸', answer: 'frozen', hint: 'Disney movie' },
  { emojis: '🏠🎈', answer: 'up', hint: 'Pixar movie' },
  { emojis: '🍫🏭', answer: 'charlie and the chocolate factory', hint: 'Book/movie' },
  { emojis: '🐝🎬', answer: 'bee movie', hint: 'Animated movie' },
  { emojis: '🌙🚶', answer: 'moonwalk', hint: 'Dance move' },
  { emojis: '🐦‍🔥', answer: 'phoenix', hint: 'Mythical creature' },
];
const RIDDLE_REWARD = 30;
const activeRiddles = new Map();

async function startEmojiRiddle(channel) {
  if (activeRiddles.has(channel.id)) {
    await channel.send('An emoji riddle is already active in this channel!');
    return;
  }
  const riddle = EMOJI_RIDDLES[Math.floor(Math.random() * EMOJI_RIDDLES.length)];
  activeRiddles.set(channel.id, riddle);
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('🧩 Emoji Riddle')
        .setDescription(`Guess what this represents:\n\n# ${riddle.emojis}\n\n*Hint: ${riddle.hint}*\n\nType your guess in chat!`),
    ],
  });

  setTimeout(() => {
    if (activeRiddles.has(channel.id)) {
      const r = activeRiddles.get(channel.id);
      activeRiddles.delete(channel.id);
      channel.send(`⏱️ Time's up! The answer was **${r.answer}**.`).catch(() => {});
    }
  }, 45000);
}

async function handleRiddleGuess(message) {
  const riddle = activeRiddles.get(message.channel.id);
  if (!riddle) return false;
  const guess = message.content.trim().toLowerCase();
  if (guess !== riddle.answer) return false;

  const user = getUser(message.author.id);
  user.coins += RIDDLE_REWARD;
  saveUser(message.author.id, user);
  await message.reply(`🎉 Correct! It was **${riddle.answer}**. +${RIDDLE_REWARD} coins!`);
  activeRiddles.delete(message.channel.id);
  return true;
}

// ==================== TYPING SPEED TEST ====================
const TYPING_SENTENCES = [
  'The quick brown fox jumps over the lazy dog',
  'Every great story starts with a single sentence',
  'Practice makes progress, not perfection',
  'Curiosity is the engine of achievement',
  'A good book is a dream that you hold in your hand',
  'Writers are readers moved to emulation',
];
const TYPING_REWARD = 35;
const activeTypingTests = new Map();

async function startTypingTest(channel) {
  if (activeTypingTests.has(channel.id)) {
    await channel.send('A typing test is already active in this channel!');
    return;
  }
  const sentence = TYPING_SENTENCES[Math.floor(Math.random() * TYPING_SENTENCES.length)];
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle('⌨️ Typing Speed Test')
        .setDescription('Type this sentence exactly, as fast as you can. Starting in 3...'),
    ],
  });

  setTimeout(async () => {
    activeTypingTests.set(channel.id, { sentence, startedAt: Date.now() });
    await channel.send(`\`\`\`${sentence}\`\`\``);
  }, 3000);

  setTimeout(() => {
    if (activeTypingTests.has(channel.id)) {
      activeTypingTests.delete(channel.id);
      channel.send('⏱️ Typing test closed — nobody typed it correctly in time.').catch(() => {});
    }
  }, 33000);
}

async function handleTypingSubmission(message) {
  const test = activeTypingTests.get(message.channel.id);
  if (!test) return false;
  if (message.content.trim() !== test.sentence) return false;

  const seconds = ((Date.now() - test.startedAt) / 1000).toFixed(2);
  const wpm = Math.round((test.sentence.split(' ').length / seconds) * 60);
  const user = getUser(message.author.id);
  user.coins += TYPING_REWARD;
  saveUser(message.author.id, user);
  await message.reply(`⌨️ Nailed it in **${seconds}s** (~${wpm} WPM)! +${TYPING_REWARD} coins.`);
  activeTypingTests.delete(message.channel.id);
  return true;
}

module.exports = {
  handle8Ball,
  startMathRace,
  handleMathGuess,
  startEmojiRiddle,
  handleRiddleGuess,
  startTypingTest,
  handleTypingSubmission,
};
