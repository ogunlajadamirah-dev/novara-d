// index.js — Community Games Bot
// Keeps a Discord server active with trivia, an economy (daily rewards +
// gambling mini-games), hangman, and a leveling/XP leaderboard.

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
require('dotenv').config();

const economy = require('./economy');
const leveling = require('./leveling');
const trivia = require('./trivia');
const hangman = require('./hangman');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // instant command registration in one server

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ---- Slash commands ----
const commands = [
  new SlashCommandBuilder().setName('balance').setDescription('Check your coin balance'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coin reward'),
  new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Bet coins on a coin flip')
    .addIntegerOption((o) => o.setName('amount').setDescription('How many coins to bet').setRequired(true).setMinValue(1))
    .addStringOption((o) =>
      o.setName('choice').setDescription('heads or tails').setRequired(true)
        .addChoices({ name: 'heads', value: 'heads' }, { name: 'tails', value: 'tails' }),
    ),
  new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Play the slot machine')
    .addIntegerOption((o) => o.setName('amount').setDescription('How many coins to bet').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('trivia').setDescription('Start a trivia question'),
  new SlashCommandBuilder().setName('hangman').setDescription('Start a game of hangman in this channel'),
  new SlashCommandBuilder().setName('rank').setDescription('Check your level and XP'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard')
    .addStringOption((o) =>
      o.setName('type').setDescription('Which leaderboard to show')
        .addChoices({ name: 'level', value: 'level' }, { name: 'coins', value: 'coins' }),
    ),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log('Slash commands registered.');
}

client.once('ready', async () => {
  console.log(`Games bot online as ${client.user.tag}`);
  await registerCommands();
});

// ---- Welcome new members ----
client.on('guildMemberAdd', async (member) => {
  try {
    const channel = member.guild.systemChannel;
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`Welcome, ${member}! 🎮 Try \`/daily\` for your first coins, \`/trivia\` for a quick game, or \`/rank\` to see your level.`);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Welcome message failed:', err);
  }
});

// ---- Message handling: XP grant + hangman guesses ----
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Hangman guesses take priority if a game is active in this channel
  const handledByHangman = await hangman.handleGuess(message).catch(() => false);
  if (handledByHangman) return;

  // Passive XP for chatting (cooldown-limited, see leveling.js)
  const result = leveling.grantMessageXp(message.author.id);
  if (result && result.leveledUp) {
    await message.channel.send(`🎉 ${message.author} just reached **Level ${result.newLevel}**! +50 bonus coins.`).catch(() => {});
  }
});

// ---- Slash command handling ----
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const handledTrivia = await trivia.handleTriviaButton(interaction).catch(() => false);
    if (handledTrivia) return;
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'balance') {
    const bal = economy.getBalance(interaction.user.id);
    await interaction.reply(`💰 You have **${bal}** coins.`);
  }

  if (commandName === 'daily') {
    const result = economy.claimDaily(interaction.user.id);
    if (result.success) {
      await interaction.reply(`✅ Claimed your daily reward: **+${result.amount}** coins. Balance: **${result.newBalance}**.`);
    } else {
      await interaction.reply({ content: `⏳ Already claimed — come back in ~${result.hoursLeft}h.`, ephemeral: true });
    }
  }

  if (commandName === 'coinflip') {
    const amount = interaction.options.getInteger('amount');
    const choice = interaction.options.getString('choice');
    const result = economy.coinflip(interaction.user.id, amount, choice);
    if (result.error) {
      await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      return;
    }
    const outcome = result.won ? `🪙 It landed on **${result.result}** — you won **+${result.amount}**!` : `🪙 It landed on **${result.result}** — you lost **${result.amount}**.`;
    await interaction.reply(`${outcome} Balance: **${result.newBalance}**.`);
  }

  if (commandName === 'slots') {
    const amount = interaction.options.getInteger('amount');
    const result = economy.slots(interaction.user.id, amount);
    if (result.error) {
      await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      return;
    }
    const line = result.spin.join(' | ');
    const outcome = result.winnings > 0 ? `You won **+${result.winnings}**!${result.jackpot ? ' 🎰 JACKPOT!' : ''}` : `You lost **${Math.abs(result.winnings)}**.`;
    await interaction.reply(`🎰 [ ${line} ]\n${outcome} Balance: **${result.newBalance}**.`);
  }

  if (commandName === 'trivia') {
    await trivia.startTrivia(interaction, true);
  }

  if (commandName === 'hangman') {
    await interaction.reply('Starting a hangman game...');
    await hangman.startHangman(interaction.channel);
  }

  if (commandName === 'rank') {
    const { getUser } = require('./storage');
    const user = getUser(interaction.user.id);
    const nextLevelXp = leveling.xpForNextLevel(user.level);
    await interaction.reply(`📊 **${interaction.user.username}** — Level **${user.level}** (${user.xp}/${nextLevelXp} XP) — 💰 ${user.coins} coins`);
  }

  if (commandName === 'leaderboard') {
    const type = interaction.options.getString('type') || 'level';
    const list = type === 'coins' ? leveling.getCoinLeaderboard(10) : leveling.getLeaderboard(10);
    const lines = await Promise.all(
      list.map(async (entry, i) => {
        const user = await client.users.fetch(entry.userId).catch(() => null);
        const name = user ? user.username : 'Unknown';
        return type === 'coins'
          ? `**${i + 1}.** ${name} — 💰 ${entry.coins}`
          : `**${i + 1}.** ${name} — Level ${entry.level} (${entry.xp} XP)`;
      }),
    );
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(type === 'coins' ? '💰 Coin Leaderboard' : '⭐ Level Leaderboard')
      .setDescription(lines.join('\n') || 'No data yet — get chatting!');
    await interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
