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
  AttachmentBuilder,
} = require('discord.js');
require('dotenv').config();

const economy = require('./economy');
const leveling = require('./leveling');
const trivia = require('./trivia');
const hangman = require('./hangman');
const applications = require('./applications');
const { initKVStore } = require('./db-kv');
const moreGames = require('./more-games');
const rankCard = require('./rank-card');
const verification = require('./verification');
const moderation = require('./moderation');
const logging = require('./logging');
const selfRoles = require('./self-roles');
const moreGames2 = require('./more-games-2');
const advancedGames = require('./advanced-games');
const blackjack = require('./blackjack');
const minesweeper = require('./minesweeper');
const battleship = require('./battleship');
const mafia = require('./mafia');

// Trim in case the token picked up a trailing space/newline when it was
// copy-pasted into the hosting platform's env var field.
const TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const GUILD_ID = (process.env.GUILD_ID || '').trim(); // instant command registration in one server

// ---- Startup diagnostics ----
// A real Discord bot token is ~70 characters. If this logs "NO" or a wrong
// length, the env var isn't reaching the app — fix it in your host's
// Variables/Secrets tab rather than in this code.
console.log('DISCORD_TOKEN loaded:', TOKEN ? `yes, length ${TOKEN.length}` : 'NO — undefined/empty');
console.log('CLIENT_ID loaded:', CLIENT_ID ? `yes, length ${CLIENT_ID.length}` : 'NO — undefined/empty');
console.log('GUILD_ID loaded:', GUILD_ID ? `yes, length ${GUILD_ID.length}` : 'NO — undefined/empty (optional, only needed for instant command registration)');

if (!TOKEN) {
  console.error('\nFATAL: DISCORD_TOKEN is missing. Set it in your host\'s environment variables (not just in a local .env file — hosts like Railway/Replit need it added in their own Variables/Secrets panel).');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('\nFATAL: CLIENT_ID is missing. Copy the Application ID from the Discord Developer Portal → General Information.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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
  new SlashCommandBuilder().setName('apply').setDescription('Apply for a mod or creator role on Novara'),
  new SlashCommandBuilder().setName('modslots').setDescription('Check how many moderator slots are still open'),
  new SlashCommandBuilder()
    .setName('viewapplications')
    .setDescription('(Admin) View submitted mod/creator applications')
    .addStringOption((o) =>
      o.setName('status').setDescription('Filter by status')
        .addChoices(
          { name: 'pending', value: 'pending' },
          { name: 'approved', value: 'approved' },
          { name: 'rejected', value: 'rejected' },
          { name: 'all', value: 'all' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('applicationdetail')
    .setDescription('(Admin) View the full form for one application by ID')
    .addStringOption((o) => o.setName('id').setDescription('Application ID (copy from /viewapplications)').setRequired(true)),
  new SlashCommandBuilder().setName('rps').setDescription('Play Rock Paper Scissors against the bot'),
  new SlashCommandBuilder().setName('guessnumber').setDescription('Start a number-guessing game in this channel (1-100)'),
  new SlashCommandBuilder().setName('wouldyourather').setDescription('Get a Would You Rather question'),
  new SlashCommandBuilder().setName('setupverify').setDescription('(Admin) Post the verification button in this channel'),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning')),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a member\'s warning history')
    .addUserOption((o) => o.setName('user').setDescription('Member to check').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to clear').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick')),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete this many days of their recent messages (0-7)').setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .addStringOption((o) => o.setName('user_id').setDescription('The user ID to unban').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setupselfroles')
    .setDescription('(Admin) Post a self-role select menu in this channel')
    .addStringOption((o) => o.setName('title').setDescription('Menu title').setRequired(true))
    .addStringOption((o) => o.setName('roles').setDescription('Comma-separated role names, e.g. Fantasy,SciFi,Romance').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setupreactionroles')
    .setDescription('(Admin) Post a reaction-role message in this channel')
    .addStringOption((o) => o.setName('title').setDescription('Message title').setRequired(true))
    .addStringOption((o) => o.setName('pairs').setDescription('emoji:RoleName pairs, comma-separated, e.g. 🔵:He/Him,🔴:She/Her').setRequired(true)),
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('mathrace').setDescription('Start a math race in this channel'),
  new SlashCommandBuilder().setName('emojiriddle').setDescription('Start an emoji riddle in this channel'),
  new SlashCommandBuilder().setName('typingtest').setDescription('Start a typing speed test in this channel'),
  new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Challenge someone to Tic-Tac-Toe')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true)),
  new SlashCommandBuilder()
    .setName('connect4')
    .setDescription('Challenge someone to Connect 4')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true)),
  new SlashCommandBuilder().setName('wordle').setDescription('Start a community Wordle game in this channel'),
  new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play Blackjack against the dealer')
    .addIntegerOption((o) => o.setName('bet').setDescription('How many coins to bet').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('minesweeper').setDescription('Play a round of Minesweeper'),
  new SlashCommandBuilder()
    .setName('battleship')
    .setDescription('Challenge someone to Battleship')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true)),
  new SlashCommandBuilder().setName('mafia').setDescription('Open a Mafia game lobby in this channel'),
  new SlashCommandBuilder().setName('mafiastart').setDescription('Start the Mafia game once enough players have joined'),
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

const logAction = logging.makeLogAction(client);

// ---- Passive event logging ----
client.on('messageDelete', (message) => logging.logMessageDelete(message, client));
client.on('messageUpdate', (oldMessage, newMessage) => logging.logMessageEdit(oldMessage, newMessage, client));
client.on('guildMemberRemove', (member) => logging.logMemberLeave(member, client));
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch().catch(() => {});
  await selfRoles.handleReactionAdd(reaction, user).catch((err) => console.error('reaction add failed:', err));
});
client.on('messageReactionRemove', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch().catch(() => {});
  await selfRoles.handleReactionRemove(reaction, user).catch((err) => console.error('reaction remove failed:', err));
});

// ---- Welcome new members + assign Unverified role ----
client.on('guildMemberAdd', async (member) => {
  await verification.assignUnverifiedOnJoin(member);
  await logging.logMemberJoin(member, client);
  try {
    const channel = member.guild.systemChannel;
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`Welcome, ${member}! 🎮 Head to the verification channel to unlock the server. After that, try \`/daily\` for your first coins, \`/trivia\` for a quick game, or \`/rank\` to see your level. Interested in joining as a mod or creator? Use \`/apply\`.`);
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

  // Number-guessing game, if active in this channel
  const handledByNumberGuess = await moreGames.handleNumberGuess(message).catch(() => false);
  if (handledByNumberGuess) return;

  // Math race, if active in this channel
  const handledByMath = await moreGames2.handleMathGuess(message).catch(() => false);
  if (handledByMath) return;

  // Emoji riddle, if active in this channel
  const handledByRiddle = await moreGames2.handleRiddleGuess(message).catch(() => false);
  if (handledByRiddle) return;

  // Typing test, if active in this channel
  const handledByTyping = await moreGames2.handleTypingSubmission(message).catch(() => false);
  if (handledByTyping) return;

  // Wordle guess, if active in this channel
  const handledByWordle = await advancedGames.handleWordleGuess(message).catch(() => false);
  if (handledByWordle) return;

  // Passive XP for chatting (cooldown-limited, see leveling.js)
  const result = leveling.grantMessageXp(message.author.id);
  if (result && result.leveledUp) {
    await message.channel.send(`🎉 ${message.author} just reached **Level ${result.newLevel}**! +50 bonus coins.`).catch(() => {});
  }
});

// ---- Slash command handling ----
client.on('interactionCreate', async (interaction) => {
  // Role picker for /apply
  if (interaction.isStringSelectMenu() && interaction.customId === 'apply_role_select') {
    await applications.handleRoleSelect(interaction).catch((err) => console.error('apply_role_select failed:', err));
    return;
  }

  // Self-role picker
  if (interaction.isStringSelectMenu() && interaction.customId === 'selfrole_select') {
    await selfRoles.handleSelfRoleSelect(interaction).catch((err) => console.error('selfrole_select failed:', err));
    return;
  }

  // Application modal submitted
  if (interaction.isModalSubmit() && interaction.customId.startsWith('apply_modal_')) {
    await applications.handleModalSubmit(interaction, client).catch((err) => console.error('handleModalSubmit failed:', err));
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('appdecision_')) {
      await applications.handleDecisionButton(interaction, client).catch((err) => console.error('handleDecisionButton failed:', err));
      return;
    }
    const handledVerify = await verification.handleVerifyButton(interaction).catch(() => false);
    if (handledVerify) return;
    const handledTrivia = await trivia.handleTriviaButton(interaction).catch(() => false);
    if (handledTrivia) return;
    const handledRPS = await moreGames.handleRPSButton(interaction).catch(() => false);
    if (handledRPS) return;
    const handledWYR = await moreGames.handleWYRButton(interaction).catch(() => false);
    if (handledWYR) return;
    const handledTTT = await advancedGames.handleTTTButton(interaction).catch(() => false);
    if (handledTTT) return;
    const handledC4 = await advancedGames.handleC4Button(interaction).catch(() => false);
    if (handledC4) return;
    const handledBJ = await blackjack.handleBlackjackButton(interaction).catch(() => false);
    if (handledBJ) return;
    const handledMines = await minesweeper.handleMinesweeperButton(interaction).catch(() => false);
    if (handledMines) return;
    const handledBS = await battleship.handleBattleshipButton(interaction).catch(() => false);
    if (handledBS) return;
    const handledMafiaJoin = await mafia.handleJoinButton(interaction).catch(() => false);
    if (handledMafiaJoin) return;
    const handledMafiaVote = await mafia.handleVoteButton(interaction).catch(() => false);
    if (handledMafiaVote) return;
    const handledMafiaNight = await mafia.handleNightActionButton(interaction).catch(() => false);
    if (handledMafiaNight) return;
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'apply') {
    await applications.startApplication(interaction);
  }

  if (commandName === 'modslots') {
    const filled = applications.getApprovedModCount();
    await interaction.reply(`🛡️ Moderator slots: **${filled}/${applications.MOD_CAP}** filled (${applications.MOD_CAP - filled} open).`);
  }

  if (commandName === 'viewapplications') {
    await applications.listApplications(interaction);
  }

  if (commandName === 'applicationdetail') {
    await applications.viewApplicationDetail(interaction);
  }

  if (commandName === 'rps') {
    await moreGames.startRPS(interaction);
  }

  if (commandName === 'guessnumber') {
    await interaction.reply('Starting a number-guessing game...');
    await moreGames.startNumberGuess(interaction.channel);
  }

  if (commandName === 'wouldyourather') {
    await moreGames.startWouldYouRather(interaction);
  }

  if (commandName === 'setupverify') {
    await verification.postVerificationMessage(interaction);
  }

  if (commandName === 'warn') {
    await moderation.handleWarn(interaction, logAction);
  }

  if (commandName === 'warnings') {
    await moderation.handleWarnings(interaction);
  }

  if (commandName === 'clearwarnings') {
    await moderation.handleClearWarnings(interaction, logAction);
  }

  if (commandName === 'kick') {
    await moderation.handleKick(interaction, logAction);
  }

  if (commandName === 'ban') {
    await moderation.handleBan(interaction, logAction);
  }

  if (commandName === 'unban') {
    await moderation.handleUnban(interaction, logAction);
  }

  if (commandName === 'setupselfroles') {
    await selfRoles.postSelfRoleMenu(interaction);
  }

  if (commandName === 'setupreactionroles') {
    await selfRoles.postReactionRoleMessage(interaction);
  }

  if (commandName === '8ball') {
    await moreGames2.handle8Ball(interaction);
  }

  if (commandName === 'mathrace') {
    await interaction.reply('Starting a math race...');
    await moreGames2.startMathRace(interaction.channel);
  }

  if (commandName === 'emojiriddle') {
    await interaction.reply('Starting an emoji riddle...');
    await moreGames2.startEmojiRiddle(interaction.channel);
  }

  if (commandName === 'typingtest') {
    await interaction.reply('Starting a typing test...');
    await moreGames2.startTypingTest(interaction.channel);
  }

  if (commandName === 'tictactoe') {
    await advancedGames.startTicTacToe(interaction);
  }

  if (commandName === 'connect4') {
    await advancedGames.startConnect4(interaction);
  }

  if (commandName === 'wordle') {
    await interaction.reply('Starting a Wordle game...');
    await advancedGames.startWordle(interaction.channel);
  }

  if (commandName === 'blackjack') {
    await blackjack.startBlackjack(interaction);
  }

  if (commandName === 'minesweeper') {
    await minesweeper.startMinesweeper(interaction);
  }

  if (commandName === 'battleship') {
    await battleship.startBattleship(interaction);
  }

  if (commandName === 'mafia') {
    await mafia.createLobby(interaction);
  }

  if (commandName === 'mafiastart') {
    await mafia.startGame(interaction, client);
  }

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
    await interaction.deferReply();
    const { getUser } = require('./storage');
    const user = getUser(interaction.user.id);
    const nextLevelXp = leveling.xpForNextLevel(user.level);
    const allUsers = leveling.getLeaderboard(9999);
    const rankPosition = allUsers.findIndex((u) => u.userId === interaction.user.id) + 1;

    const buffer = await rankCard.generateRankCard({
      username: interaction.user.username,
      handle: `@${interaction.user.username}`,
      avatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
      rank: rankPosition || allUsers.length + 1,
      level: user.level,
      xp: user.xp,
      xpNeeded: nextLevelXp,
      totalXp: user.level > 1 ? (user.level - 1) * 100 + user.xp : user.xp, // rough lifetime total across levels
      msgs: Math.floor(user.xp / 10), // approximate; swap for a real message counter if you want exact tracking
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
    await interaction.editReply({ files: [attachment] });
  }

  if (commandName === 'leaderboard') {
    await interaction.deferReply();
    const type = interaction.options.getString('type') || 'level';
    const list = type === 'coins' ? leveling.getCoinLeaderboard(8) : leveling.getLeaderboard(8);

    const entries = await Promise.all(
      list.map(async (entry) => {
        const user = await client.users.fetch(entry.userId).catch(() => null);
        return {
          name: user ? user.username : 'Unknown',
          avatarUrl: user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
          value: type === 'coins' ? entry.coins : entry.level,
          tag: type === 'coins' ? 'Wealthy' : `Level ${entry.level}`,
        };
      }),
    );

    if (entries.length === 0) {
      await interaction.editReply('No leaderboard data yet — get people chatting and playing games first!');
      return;
    }

    const buffer = await rankCard.generateLeaderboardCard({
      serverName: interaction.guild.name,
      title: type === 'coins' ? 'Coin Leaderboard' : 'Level Leaderboard',
      entries,
      formatValue: (v) => (type === 'coins' ? `💰${v.toLocaleString()}` : `Lv.${v}`),
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
    await interaction.editReply({ files: [attachment] });
  }
});

initKVStore().then(() => {
  client.login(TOKEN);
});
