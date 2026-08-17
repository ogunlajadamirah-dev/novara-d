// trivia.js — multiple-choice trivia with button answers, coin rewards.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const QUESTIONS = [
  { q: 'What is the largest planet in our solar system?', choices: ['Earth', 'Jupiter', 'Saturn', 'Neptune'], answer: 1 },
  { q: 'How many bones are in the adult human body?', choices: ['186', '206', '226', '246'], answer: 1 },
  { q: 'Which ocean is the largest?', choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { q: 'What year did the Titanic sink?', choices: ['1905', '1912', '1918', '1923'], answer: 1 },
  { q: 'What is the smallest country in the world?', choices: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'], answer: 2 },
  { q: 'Which element has the chemical symbol "Fe"?', choices: ['Fluorine', 'Iron', 'Francium', 'Fermium'], answer: 1 },
  { q: 'How many continents are there?', choices: ['5', '6', '7', '8'], answer: 2 },
  { q: 'What is the fastest land animal?', choices: ['Lion', 'Cheetah', 'Gazelle', 'Horse'], answer: 1 },
  { q: 'Which country invented paper?', choices: ['Egypt', 'China', 'India', 'Greece'], answer: 1 },
  { q: 'What is the longest river in the world?', choices: ['Amazon', 'Yangtze', 'Nile', 'Mississippi'], answer: 2 },
];

const REWARD = 30;
const activeQuestions = new Map(); // messageId -> { questionIndex, answered: Set(userId) }

async function startTrivia(interactionOrChannel, isInteraction = true) {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('🧠 Trivia Time')
    .setDescription(q.q)
    .setFooter({ text: `First correct answer wins ${REWARD} coins` });

  const row = new ActionRowBuilder().addComponents(
    q.choices.map((choice, i) =>
      new ButtonBuilder().setCustomId(`trivia_${i}`).setLabel(choice).setStyle(ButtonStyle.Secondary),
    ),
  );

  let sent;
  if (isInteraction) {
    sent = await interactionOrChannel.reply({ embeds: [embed], components: [row], fetchReply: true });
  } else {
    sent = await interactionOrChannel.send({ embeds: [embed], components: [row] });
  }

  activeQuestions.set(sent.id, { correctIndex: q.answer, answered: false, choices: q.choices });

  // Auto-expire after 30 seconds
  setTimeout(() => {
    const state = activeQuestions.get(sent.id);
    if (state && !state.answered) {
      activeQuestions.delete(sent.id);
      sent.edit({ components: [] }).catch(() => {});
    }
  }, 30000);
}

async function handleTriviaButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('trivia_')) return false;

  const messageId = interaction.message.id;
  const state = activeQuestions.get(messageId);
  if (!state) {
    await interaction.reply({ content: 'This question has expired.', ephemeral: true });
    return true;
  }
  if (state.answered) {
    await interaction.reply({ content: 'Someone already answered this one!', ephemeral: true });
    return true;
  }

  const chosenIndex = parseInt(interaction.customId.split('_')[1], 10);
  const correct = chosenIndex === state.correctIndex;

  if (correct) {
    state.answered = true;
    const user = getUser(interaction.user.id);
    user.coins += REWARD;
    saveUser(interaction.user.id, user);
    await interaction.update({ components: [] });
    await interaction.followUp(`✅ **${interaction.user.username}** got it right! The answer was **${state.choices[state.correctIndex]}**. +${REWARD} coins.`);
    activeQuestions.delete(messageId);
  } else {
    await interaction.reply({ content: `❌ Not quite — try again if someone else hasn't gotten it yet.`, ephemeral: true });
  }
  return true;
}

module.exports = { startTrivia, handleTriviaButton };
