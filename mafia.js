// mafia.js — Simplified Mafia/Werewolf. Lobby -> Night (DM actions) -> Day
// (public vote) -> repeat until one side wins. One active game per channel.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const NIGHT_DURATION_MS = 45000;
const DAY_VOTE_DURATION_MS = 60000;
const WIN_REWARD = 80;

const games = new Map();

function mafiaCountForPlayers(n) {
  return n >= 8 ? 2 : 1;
}

function buildLobbyEmbed(game) {
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle('🕵️ Mafia — Lobby Open')
    .setDescription(
      `Click **Join** to sign up. Need ${MIN_PLAYERS}-${MAX_PLAYERS} players.\n\n**Joined (${game.players.length}):**\n${game.players.map((id) => `<@${id}>`).join('\n') || 'Nobody yet'}\n\nGame creator can run \`/mafiastart\` once there are at least ${MIN_PLAYERS} players.`,
    );
}

function buildLobbyButtons(gameId, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mafia_join_${gameId}`).setLabel('Join').setStyle(ButtonStyle.Success).setDisabled(disabled),
  );
  return [row];
}

async function createLobby(interaction) {
  if (games.has(interaction.channel.id)) {
    await interaction.reply({ content: 'A Mafia game is already active or in lobby in this channel.', ephemeral: true });
    return;
  }

  const gameId = interaction.id;
  const game = {
    gameId,
    channelId: interaction.channel.id,
    creatorId: interaction.user.id,
    phase: 'lobby',
    players: [interaction.user.id],
    roles: {},
    alive: new Set(),
    nightActions: {},
    votes: {},
  };
  games.set(interaction.channel.id, game);

  const sent = await interaction.reply({ embeds: [buildLobbyEmbed(game)], components: buildLobbyButtons(gameId), fetchReply: true });
  game.lobbyMessageId = sent.id;
}

async function handleJoinButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('mafia_join_')) return false;
  const game = games.get(interaction.channel.id);
  if (!game || game.phase !== 'lobby') {
    await interaction.reply({ content: 'This lobby is no longer open.', ephemeral: true });
    return true;
  }
  if (game.players.includes(interaction.user.id)) {
    await interaction.reply({ content: 'You already joined!', ephemeral: true });
    return true;
  }
  if (game.players.length >= MAX_PLAYERS) {
    await interaction.reply({ content: 'Lobby is full.', ephemeral: true });
    return true;
  }

  game.players.push(interaction.user.id);
  await interaction.update({ embeds: [buildLobbyEmbed(game)], components: buildLobbyButtons(game.gameId) });
  return true;
}

async function startGame(interaction, client) {
  const game = games.get(interaction.channel.id);
  if (!game || game.phase !== 'lobby') {
    await interaction.reply({ content: 'No lobby to start in this channel.', ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.creatorId) {
    await interaction.reply({ content: 'Only the person who created the lobby can start it.', ephemeral: true });
    return;
  }
  if (game.players.length < MIN_PLAYERS) {
    await interaction.reply({ content: `Need at least ${MIN_PLAYERS} players — currently ${game.players.length}.`, ephemeral: true });
    return;
  }

  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = mafiaCountForPlayers(shuffled.length);
  let i = 0;
  const mafiaIds = shuffled.slice(i, i + mafiaCount); i += mafiaCount;
  const doctorId = shuffled[i]; i += 1;
  const detectiveId = shuffled[i]; i += 1;
  const villagerIds = shuffled.slice(i);

  for (const id of mafiaIds) game.roles[id] = 'mafia';
  game.roles[doctorId] = 'doctor';
  game.roles[detectiveId] = 'detective';
  for (const id of villagerIds) game.roles[id] = 'villager';
  for (const id of game.players) game.alive.add(id);

  for (const id of game.players) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) continue;
    const role = game.roles[id];
    let msg;
    if (role === 'mafia') {
      const teammates = mafiaIds.filter((m) => m !== id).map((m) => `<@${m}>`).join(', ');
      msg = `🔪 You are **Mafia**. Your teammates: ${teammates || 'you\'re working alone'}. Each night I'll DM you to choose a target.`;
    } else if (role === 'doctor') {
      msg = `💊 You are the **Doctor**. Each night I'll DM you to choose someone to protect.`;
    } else if (role === 'detective') {
      msg = `🔍 You are the **Detective**. Each night I'll DM you to investigate someone's role.`;
    } else {
      msg = `👤 You are a **Villager**. No night action — survive and help vote out the Mafia during the day.`;
    }
    await user.send(msg).catch(() => {});
  }

  await interaction.reply(`🎬 Game started with ${game.players.length} players! Roles have been DM'd. Check your DMs. Night 1 begins now...`);
  await runNightPhase(game, client);
}

// ==================== NIGHT PHASE ====================
async function runNightPhase(game, client) {
  game.phase = 'night';
  game.nightActions = { mafiaTarget: null, doctorSave: null, detectiveCheck: null };

  const alivePlayers = [...game.alive];
  const mafiaAlive = alivePlayers.filter((id) => game.roles[id] === 'mafia');
  const doctorAlive = alivePlayers.find((id) => game.roles[id] === 'doctor');
  const detectiveAlive = alivePlayers.find((id) => game.roles[id] === 'detective');

  const targetRow = (prefix) =>
    [new ActionRowBuilder().addComponents(
      alivePlayers.slice(0, 5).map((id) =>
        new ButtonBuilder().setCustomId(`mafia_${prefix}_${game.gameId}_${id}`).setLabel(`Player ${alivePlayers.indexOf(id) + 1}`).setStyle(ButtonStyle.Secondary),
      ),
    )];

  const legend = alivePlayers.map((id, idx) => `Player ${idx + 1} = <@${id}>`).join('\n');

  for (const id of mafiaAlive) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) await user.send({ content: `🌙 Night falls. Choose who Mafia kills tonight:\n${legend}`, components: targetRow('kill') }).catch(() => {});
  }
  if (doctorAlive) {
    const user = await client.users.fetch(doctorAlive).catch(() => null);
    if (user) await user.send({ content: `🌙 Night falls. Choose who to protect tonight:\n${legend}`, components: targetRow('save') }).catch(() => {});
  }
  if (detectiveAlive) {
    const user = await client.users.fetch(detectiveAlive).catch(() => null);
    if (user) await user.send({ content: `🌙 Night falls. Choose who to investigate tonight:\n${legend}`, components: targetRow('check') }).catch(() => {});
  }

  game.nightTimeout = setTimeout(() => resolveNight(game, client), NIGHT_DURATION_MS);
}

async function handleNightActionButton(interaction) {
  if (!interaction.isButton()) return false;
  const parts = interaction.customId.split('_');
  if (parts[0] !== 'mafia') return false;
  const action = parts[1];
  if (!['kill', 'save', 'check'].includes(action)) return false;

  const gameId = parts[2];
  const targetId = parts[3];
  const game = [...games.values()].find((g) => g.gameId === gameId);
  if (!game || game.phase !== 'night') {
    await interaction.reply({ content: 'This action window has closed.', ephemeral: true });
    return true;
  }

  if (action === 'kill') game.nightActions.mafiaTarget = targetId;
  if (action === 'save') game.nightActions.doctorSave = targetId;
  if (action === 'check') {
    game.nightActions.detectiveCheck = targetId;
    const isMafia = game.roles[targetId] === 'mafia';
    await interaction.reply({ content: `🔍 Result: <@${targetId}> is ${isMafia ? '**Mafia**' : 'not Mafia'}.`, ephemeral: true });
    return true;
  }

  await interaction.reply({ content: '✅ Choice locked in for tonight.', ephemeral: true });
  return true;
}

async function resolveNight(game, client) {
  const { mafiaTarget, doctorSave } = game.nightActions;
  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  let deathText;
  if (mafiaTarget && mafiaTarget !== doctorSave && game.alive.has(mafiaTarget)) {
    game.alive.delete(mafiaTarget);
    deathText = `☠️ <@${mafiaTarget}> was killed during the night. They were **${game.roles[mafiaTarget]}**.`;
  } else if (mafiaTarget && mafiaTarget === doctorSave) {
    deathText = `💊 The Doctor successfully protected the Mafia's target — nobody died last night!`;
  } else {
    deathText = `🌤️ Nobody died last night — the Mafia didn't act, or the target was saved.`;
  }

  const winCheck = checkWinCondition(game);
  if (winCheck) {
    await announceWin(game, client, channel, deathText);
    return;
  }

  await channel.send({ embeds: [new EmbedBuilder().setColor(0x2c3e50).setTitle('☀️ Morning has come').setDescription(deathText)] });
  await runDayPhase(game, client, channel);
}

// ==================== DAY PHASE ====================
async function runDayPhase(game, client, channel) {
  game.phase = 'day';
  game.votes = {};
  const alivePlayers = [...game.alive];

  const rows = [];
  for (let i = 0; i < alivePlayers.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      alivePlayers.slice(i, i + 5).map((id) =>
        new ButtonBuilder().setCustomId(`mafia_vote_${game.gameId}_${id}`).setLabel(`Player ${alivePlayers.indexOf(id) + 1}`).setStyle(ButtonStyle.Primary),
      ),
    );
    rows.push(row);
  }

  const legend = alivePlayers.map((id, idx) => `Player ${idx + 1} = <@${id}>`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('🗳️ Day Vote')
    .setDescription(`Discuss, then vote to lynch someone. ${DAY_VOTE_DURATION_MS / 1000}s to vote.\n\n${legend}\n\n**Votes so far:** none yet`);

  const sent = await channel.send({ embeds: [embed], components: rows });
  game.dayMessageId = sent.id;

  game.dayTimeout = setTimeout(() => resolveDay(game, client, channel), DAY_VOTE_DURATION_MS);
}

async function handleVoteButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('mafia_vote_')) return false;
  const [, , gameId, targetId] = interaction.customId.split('_');
  const game = [...games.values()].find((g) => g.gameId === gameId);
  if (!game || game.phase !== 'day') {
    await interaction.reply({ content: 'Voting has closed.', ephemeral: true });
    return true;
  }
  if (!game.alive.has(interaction.user.id)) {
    await interaction.reply({ content: 'Only living players can vote.', ephemeral: true });
    return true;
  }

  game.votes[interaction.user.id] = targetId;

  const tally = {};
  for (const v of Object.values(game.votes)) tally[v] = (tally[v] || 0) + 1;
  const alivePlayers = [...game.alive];
  const tallyText = Object.entries(tally).map(([id, count]) => `Player ${alivePlayers.indexOf(id) + 1}: ${count} vote(s)`).join('\n') || 'none yet';

  const legend = alivePlayers.map((id, idx) => `Player ${idx + 1} = <@${id}>`).join('\n');
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
    `Discuss, then vote to lynch someone.\n\n${legend}\n\n**Votes so far:**\n${tallyText}`,
  );

  await interaction.update({ embeds: [embed] });
  return true;
}

async function resolveDay(game, client, channel) {
  const tally = {};
  for (const v of Object.values(game.votes)) tally[v] = (tally[v] || 0) + 1;

  let lynchedId = null;
  let maxVotes = 0;
  let tie = false;
  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; lynchedId = id; tie = false; }
    else if (count === maxVotes) tie = true;
  }

  let resultText;
  if (!lynchedId || tie || maxVotes === 0) {
    resultText = '🤷 No majority — nobody was lynched today.';
  } else {
    game.alive.delete(lynchedId);
    resultText = `⚖️ <@${lynchedId}> was voted out. They were **${game.roles[lynchedId]}**.`;
  }

  const winCheck = checkWinCondition(game);
  if (winCheck) {
    await announceWin(game, client, channel, resultText);
    return;
  }

  await channel.send({ embeds: [new EmbedBuilder().setColor(0xf39c12).setTitle('🗳️ Vote Result').setDescription(resultText)] });
  await runNightPhase(game, client);
}

function checkWinCondition(game) {
  const aliveRoles = [...game.alive].map((id) => game.roles[id]);
  const mafiaAlive = aliveRoles.filter((r) => r === 'mafia').length;
  const nonMafiaAlive = aliveRoles.length - mafiaAlive;
  if (mafiaAlive === 0) return 'village';
  if (mafiaAlive >= nonMafiaAlive) return 'mafia';
  return null;
}

async function announceWin(game, client, channel, lastEventText) {
  const winner = checkWinCondition(game);
  const winningIds = game.players.filter((id) => (winner === 'mafia' ? game.roles[id] === 'mafia' : game.roles[id] !== 'mafia'));

  for (const id of winningIds) {
    const user = getUser(id);
    user.coins += WIN_REWARD;
    saveUser(id, user);
  }

  const roleReveal = game.players.map((id) => `<@${id}> — ${game.roles[id]}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(winner === 'mafia' ? 0xe74c3c : 0x2ecc71)
    .setTitle(winner === 'mafia' ? '🔪 Mafia Wins!' : '🎉 Village Wins!')
    .setDescription(`${lastEventText}\n\n${winner === 'mafia' ? 'The Mafia' : 'The Village'} has won! Winners get **${WIN_REWARD}** coins each.\n\n**Final roles:**\n${roleReveal}`);

  await channel.send({ embeds: [embed] });
  games.delete(game.channelId);
}

module.exports = {
  createLobby,
  handleJoinButton,
  startGame,
  handleNightActionButton,
  handleVoteButton,
};
