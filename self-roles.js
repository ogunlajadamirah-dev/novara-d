// self-roles.js — Two ways for members to self-assign roles:
// 1. Button-based menu (/setupselfroles) — modern, cleaner, up to 25 roles across button rows
// 2. Reaction-based (/setupreactionroles) — classic emoji-react-to-get-role style

const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const CONFIG_FILE = path.join(__dirname, 'self-roles.json');

function load() {
  if (!fs.existsSync(CONFIG_FILE)) return { reactionRoleMessages: {} };
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { reactionRoleMessages: {} };
  }
}

function save(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// ==================== BUTTON / SELECT-MENU SELF-ROLES ====================
// /setupselfroles title:"Pick your genres" roles:"Fantasy,SciFi,Romance,Horror"
// Posts a select menu; picking options toggles those roles on the member.

async function postSelfRoleMenu(interaction) {
  if (!interaction.memberPermissions.has('ManageRoles')) {
    await interaction.reply({ content: 'You need Manage Roles permission to set this up.', ephemeral: true });
    return;
  }

  const title = interaction.options.getString('title') || 'Choose your roles';
  const rolesRaw = interaction.options.getString('roles'); // comma-separated role names
  const roleNames = rolesRaw.split(',').map((r) => r.trim()).filter(Boolean);

  if (roleNames.length === 0 || roleNames.length > 25) {
    await interaction.reply({ content: 'Provide 1-25 comma-separated role names, e.g. `Fantasy,SciFi,Romance`.', ephemeral: true });
    return;
  }

  // Create any roles that don't already exist
  const guild = interaction.guild;
  const createdRoles = [];
  for (const name of roleNames) {
    let role = guild.roles.cache.find((r) => r.name === name);
    if (!role) {
      role = await guild.roles.create({ name, reason: 'Auto-created by self-roles setup' });
    }
    createdRoles.push(role);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('selfrole_select')
    .setPlaceholder('Select any that apply')
    .setMinValues(0)
    .setMaxValues(createdRoles.length)
    .addOptions(createdRoles.map((r) => ({ label: r.name, value: r.id })));

  const row = new ActionRowBuilder().addComponents(menu);
  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle(title).setDescription('Pick from the menu below — you can select multiple, and picking again removes them.');

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: `Self-role menu posted with ${createdRoles.length} role(s).`, ephemeral: true });
}

async function handleSelfRoleSelect(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'selfrole_select') return false;

  const member = interaction.member;
  const selectedIds = new Set(interaction.values);
  // All options on this menu are the "managed" role set — anything not selected this time gets removed
  const allOptionIds = interaction.component.options.map((o) => o.value);

  const added = [];
  const removed = [];

  for (const roleId of allOptionIds) {
    const hasRole = member.roles.cache.has(roleId);
    const wantsRole = selectedIds.has(roleId);
    if (wantsRole && !hasRole) {
      await member.roles.add(roleId).catch(() => {});
      added.push(roleId);
    } else if (!wantsRole && hasRole) {
      await member.roles.remove(roleId).catch(() => {});
      removed.push(roleId);
    }
  }

  const parts = [];
  if (added.length) parts.push(`Added: ${added.map((id) => `<@&${id}>`).join(', ')}`);
  if (removed.length) parts.push(`Removed: ${removed.map((id) => `<@&${id}>`).join(', ')}`);

  await interaction.reply({ content: parts.length ? parts.join('\n') : 'No changes.', ephemeral: true });
  return true;
}

// ==================== REACTION ROLES ====================
// /setupreactionroles title:"Pick your pronoun" pairs:"🔵:He/Him,🔴:She/Her,🟢:They/Them"

async function postReactionRoleMessage(interaction) {
  if (!interaction.memberPermissions.has('ManageRoles')) {
    await interaction.reply({ content: 'You need Manage Roles permission to set this up.', ephemeral: true });
    return;
  }

  const title = interaction.options.getString('title') || 'React to get a role';
  const pairsRaw = interaction.options.getString('pairs'); // "emoji:RoleName,emoji:RoleName"
  const pairs = pairsRaw.split(',').map((p) => p.trim()).filter(Boolean);

  const guild = interaction.guild;
  const emojiToRoleId = {};
  const lines = [];

  for (const pair of pairs) {
    const [emoji, ...rest] = pair.split(':');
    const roleName = rest.join(':').trim();
    const trimmedEmoji = emoji.trim();
    if (!trimmedEmoji || !roleName) continue;

    let role = guild.roles.cache.find((r) => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({ name: roleName, reason: 'Auto-created by reaction-roles setup' });
    }
    emojiToRoleId[trimmedEmoji] = role.id;
    lines.push(`${trimmedEmoji} — ${role.name}`);
  }

  if (Object.keys(emojiToRoleId).length === 0) {
    await interaction.reply({ content: 'Provide pairs like `🔵:He/Him,🔴:She/Her` — emoji:RoleName, comma-separated.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle(title).setDescription(lines.join('\n'));
  const sent = await interaction.channel.send({ embeds: [embed] });

  for (const emoji of Object.keys(emojiToRoleId)) {
    await sent.react(emoji).catch(() => {});
  }

  const data = load();
  data.reactionRoleMessages[sent.id] = emojiToRoleId;
  save(data);

  await interaction.reply({ content: `Reaction-role message posted with ${Object.keys(emojiToRoleId).length} option(s).`, ephemeral: true });
}

async function handleReactionAdd(reaction, user) {
  if (user.bot) return;
  const data = load();
  const mapping = data.reactionRoleMessages[reaction.message.id];
  if (!mapping) return;

  const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const roleId = mapping[emojiKey] || mapping[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(roleId).catch(() => {});
}

async function handleReactionRemove(reaction, user) {
  if (user.bot) return;
  const data = load();
  const mapping = data.reactionRoleMessages[reaction.message.id];
  if (!mapping) return;

  const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const roleId = mapping[emojiKey] || mapping[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(roleId).catch(() => {});
}

module.exports = {
  postSelfRoleMenu,
  handleSelfRoleSelect,
  postReactionRoleMessage,
  handleReactionAdd,
  handleReactionRemove,
};
