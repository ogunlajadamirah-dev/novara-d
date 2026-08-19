// moderation.js — Warn / kick / ban commands with a persisted warning
// history per user. Requires the appropriate Discord permission per action.

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const WARNINGS_FILE = path.join(__dirname, 'warnings.json');

function load() {
  if (!fs.existsSync(WARNINGS_FILE)) return { warnings: {} };
  try {
    return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
  } catch {
    return { warnings: {} };
  }
}

function save(data) {
  fs.writeFileSync(WARNINGS_FILE, JSON.stringify(data, null, 2));
}

function addWarning(userId, moderatorId, reason) {
  const data = load();
  if (!data.warnings[userId]) data.warnings[userId] = [];
  const entry = { moderatorId, reason, timestamp: Date.now() };
  data.warnings[userId].push(entry);
  save(data);
  return data.warnings[userId].length;
}

function getWarnings(userId) {
  const data = load();
  return data.warnings[userId] || [];
}

function clearWarnings(userId) {
  const data = load();
  const count = (data.warnings[userId] || []).length;
  delete data.warnings[userId];
  save(data);
  return count;
}

// ---- /warn ----
async function handleWarn(interaction, logAction) {
  if (!interaction.memberPermissions.has('ModerateMembers')) {
    await interaction.reply({ content: 'You need the Moderate Members permission to warn.', ephemeral: true });
    return;
  }
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason given';

  const count = addWarning(target.id, interaction.user.id, reason);

  await target.send(`⚠️ You received a warning in **${interaction.guild.name}**.\nReason: ${reason}\nThis is warning #${count} on record.`).catch(() => {});
  await interaction.reply(`⚠️ Warned ${target} — reason: ${reason} (warning #${count} on record).`);

  await logAction({
    action: 'Warn',
    color: 0xf39c12,
    moderator: interaction.user,
    target,
    reason,
    extra: `Total warnings: ${count}`,
  });
}

// ---- /warnings ----
async function handleWarnings(interaction) {
  const target = interaction.options.getUser('user');
  const warnings = getWarnings(target.id);

  if (warnings.length === 0) {
    await interaction.reply({ content: `${target.username} has no warnings on record.`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`Warnings for ${target.username}`)
    .setDescription(
      warnings
        .map((w, i) => `**#${i + 1}** — ${w.reason}\n<t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderatorId}>`)
        .join('\n\n'),
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ---- /clearwarnings ----
async function handleClearWarnings(interaction, logAction) {
  if (!interaction.memberPermissions.has('ModerateMembers')) {
    await interaction.reply({ content: 'You need the Moderate Members permission to do this.', ephemeral: true });
    return;
  }
  const target = interaction.options.getUser('user');
  const count = clearWarnings(target.id);
  await interaction.reply(`🧹 Cleared ${count} warning(s) for ${target}.`);

  await logAction({
    action: 'Warnings Cleared',
    color: 0x3498db,
    moderator: interaction.user,
    target,
    reason: `${count} warning(s) removed`,
  });
}

// ---- /kick ----
async function handleKick(interaction, logAction) {
  if (!interaction.memberPermissions.has('KickMembers')) {
    await interaction.reply({ content: 'You need the Kick Members permission to do this.', ephemeral: true });
    return;
  }
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason given';
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  if (!member) {
    await interaction.reply({ content: 'Could not find that member in this server.', ephemeral: true });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({ content: 'I can\'t kick that member — check role hierarchy (my role needs to be above theirs).', ephemeral: true });
    return;
  }

  await target.send(`You were kicked from **${interaction.guild.name}**.\nReason: ${reason}`).catch(() => {});
  await member.kick(reason);
  await interaction.reply(`👢 Kicked ${target.tag} — reason: ${reason}`);

  await logAction({ action: 'Kick', color: 0xe67e22, moderator: interaction.user, target, reason });
}

// ---- /ban ----
async function handleBan(interaction, logAction) {
  if (!interaction.memberPermissions.has('BanMembers')) {
    await interaction.reply({ content: 'You need the Ban Members permission to do this.', ephemeral: true });
    return;
  }
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason given';
  const deleteDays = interaction.options.getInteger('delete_days') || 0;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) {
    await interaction.reply({ content: 'I can\'t ban that member — check role hierarchy (my role needs to be above theirs).', ephemeral: true });
    return;
  }

  await target.send(`You were banned from **${interaction.guild.name}**.\nReason: ${reason}`).catch(() => {});
  await interaction.guild.members.ban(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
  await interaction.reply(`🔨 Banned ${target.tag} — reason: ${reason}`);

  await logAction({ action: 'Ban', color: 0xe74c3c, moderator: interaction.user, target, reason });
}

// ---- /unban ----
async function handleUnban(interaction, logAction) {
  if (!interaction.memberPermissions.has('BanMembers')) {
    await interaction.reply({ content: 'You need the Ban Members permission to do this.', ephemeral: true });
    return;
  }
  const userId = interaction.options.getString('user_id');
  try {
    await interaction.guild.members.unban(userId);
    await interaction.reply(`✅ Unbanned user ID ${userId}.`);
    await logAction({ action: 'Unban', color: 0x2ecc71, moderator: interaction.user, target: { tag: userId, id: userId }, reason: 'Manual unban' });
  } catch (err) {
    await interaction.reply({ content: 'Could not unban — check the user ID is correct and they\'re actually banned.', ephemeral: true });
  }
}

module.exports = {
  handleWarn,
  handleWarnings,
  handleClearWarnings,
  handleKick,
  handleBan,
  handleUnban,
  getWarnings,
};
