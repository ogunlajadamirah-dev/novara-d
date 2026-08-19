// logging.js — Two kinds of logging:
// 1. Mod action log (warn/kick/ban/etc) — called directly by moderation.js
// 2. Passive event log (message deletes/edits, member join/leave) — wired
//    to Discord events in index.js

const { EmbedBuilder } = require('discord.js');

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

async function getLogChannel(client) {
  if (!LOG_CHANNEL_ID) return null;
  return client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
}

// Called by moderation.js after any mod action
function makeLogAction(client) {
  return async function logAction({ action, color, moderator, target, reason, extra }) {
    const channel = await getLogChannel(client);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${action}`)
      .addFields(
        { name: 'User', value: target.tag ? `${target.tag} (${target.id})` : String(target), inline: true },
        { name: 'Moderator', value: `${moderator.tag}`, inline: true },
        { name: 'Reason', value: reason || 'No reason given' },
      )
      .setTimestamp();

    if (extra) embed.addFields({ name: 'Note', value: extra });

    await channel.send({ embeds: [embed] }).catch(() => {});
  };
}

// ---- Passive event logging ----

async function logMessageDelete(message, client) {
  if (message.author?.bot) return;
  const channel = await getLogChannel(client);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('🗑️ Message Deleted')
    .addFields(
      { name: 'Author', value: message.author ? `${message.author.tag}` : 'Unknown', inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Content', value: message.content?.slice(0, 1000) || '(no text content — may have been an embed/attachment)' },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logMessageEdit(oldMessage, newMessage, client) {
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return; // ignore embed-only updates etc.
  const channel = await getLogChannel(client);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('✏️ Message Edited')
    .addFields(
      { name: 'Author', value: `${newMessage.author.tag}`, inline: true },
      { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
      { name: 'Before', value: oldMessage.content?.slice(0, 500) || '(empty)' },
      { name: 'After', value: newMessage.content?.slice(0, 500) || '(empty)' },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logMemberJoin(member, client) {
  const channel = await getLogChannel(client);
  if (!channel) return;
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('📥 Member Joined')
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.id})`, inline: true },
      { name: 'Account age', value: `${accountAgeDays} days`, inline: true },
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logMemberLeave(member, client) {
  const channel = await getLogChannel(client);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle('📤 Member Left')
    .addFields({ name: 'User', value: `${member.user.tag} (${member.id})` })
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  makeLogAction,
  logMessageDelete,
  logMessageEdit,
  logMemberJoin,
  logMemberLeave,
};
