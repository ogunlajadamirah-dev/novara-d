// self-roles.js
// Self-role dropdowns + reaction roles for Discord.js v14

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const reactionRoleMessages = new Map();

/**
 * Check whether the user can manage roles.
 */
function canManageRoles(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles);
}

/**
 * /setupselfroles
 *
 * Creates a dropdown menu where members can choose roles.
 *
 * Example:
 * /setupselfroles
 * title: Choose your interests
 * roles: Fantasy,SciFi,Romance
 */
async function postSelfRoleMenu(interaction) {
  if (!canManageRoles(interaction)) {
    await interaction.reply({
      content: '❌ You need the **Manage Roles** permission to do this.',
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString('title');
  const rolesInput = interaction.options.getString('roles');

  const roleNames = rolesInput
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (roleNames.length === 0) {
    await interaction.reply({
      content: '❌ Please provide at least one role.',
      ephemeral: true,
    });
    return;
  }

  if (roleNames.length > 25) {
    await interaction.reply({
      content: '❌ Discord dropdown menus can contain a maximum of 25 options.',
      ephemeral: true,
    });
    return;
  }

  const options = [];

  for (const roleName of roleNames) {
    const role = interaction.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleName.toLowerCase()
    );

    if (!role) {
      continue;
    }

    // Bot cannot assign roles above its highest role.
    if (
      interaction.guild.members.me &&
      role.position >= interaction.guild.members.me.roles.highest.position
    ) {
      continue;
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(role.name.slice(0, 100))
        .setValue(role.id)
        .setDescription(`Toggle the ${role.name} role`)
    );
  }

  if (options.length === 0) {
    await interaction.reply({
      content:
        '❌ None of those roles were found, or the bot cannot manage those roles.\n\n' +
        'Make sure the roles already exist and that the bot role is above them.',
      ephemeral: true,
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('selfrole_select')
    .setPlaceholder('Choose your roles...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      'Select a role from the menu below.\n\n' +
      'You can use this menu to choose your interests, pronouns, notifications, or other available roles.'
    )
    .setColor(0x5865f2);

  await interaction.channel.send({
    embeds: [embed],
    components: [row],
  });

  await interaction.reply({
    content: '✅ Self-role menu posted.',
    ephemeral: true,
  });
}

/**
 * Handles the self-role dropdown.
 */
async function handleSelfRoleSelect(interaction) {
  const roleId = interaction.values[0];
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    await interaction.reply({
      content: '❌ That role no longer exists.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;

  if (member.roles.cache.has(role.id)) {
    try {
      await member.roles.remove(role);

      await interaction.reply({
        content: `➖ Removed the **${role.name}** role.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Failed to remove self-role:', error);

      await interaction.reply({
        content:
          '❌ I could not remove that role. Make sure my bot role is above the role.',
        ephemeral: true,
      });
    }

    return;
  }

  try {
    await member.roles.add(role);

    await interaction.reply({
      content: `✅ Added the **${role.name}** role.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Failed to add self-role:', error);

    await interaction.reply({
      content:
        '❌ I could not add that role. Make sure my bot role is above the role.',
      ephemeral: true,
    });
  }
}

/**
 * /setupreactionroles
 *
 * Example:
 * /setupreactionroles
 * title: Choose your pronouns
 * pairs: 🔵:He/Him,🔴:She/Her
 */
async function postReactionRoleMessage(interaction) {
  if (!canManageRoles(interaction)) {
    await interaction.reply({
      content: '❌ You need the **Manage Roles** permission to do this.',
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString('title');
  const pairsInput = interaction.options.getString('pairs');

  const pairs = pairsInput
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean);

  if (pairs.length === 0) {
    await interaction.reply({
      content: '❌ No reaction-role pairs were provided.',
      ephemeral: true,
    });
    return;
  }

  const validPairs = [];

  for (const pair of pairs) {
    const separator = pair.indexOf(':');

    if (separator === -1) continue;

    const emoji = pair.slice(0, separator).trim();
    const roleName = pair.slice(separator + 1).trim();

    const role = interaction.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleName.toLowerCase()
    );

    if (!role) continue;

    if (
      interaction.guild.members.me &&
      role.position >= interaction.guild.members.me.roles.highest.position
    ) {
      continue;
    }

    validPairs.push({
      emoji,
      roleId: role.id,
      roleName: role.name,
    });
  }

  if (validPairs.length === 0) {
    await interaction.reply({
      content:
        '❌ No valid roles were found. Make sure the roles exist and the bot can manage them.',
      ephemeral: true,
    });
    return;
  }

  const description = validPairs
    .map((p) => `${p.emoji} — **${p.roleName}**`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `${description}\n\nReact to this message to toggle a role.`
    )
    .setColor(0x5865f2);

  const message = await interaction.channel.send({
    embeds: [embed],
  });

  reactionRoleMessages.set(message.id, validPairs);

  for (const pair of validPairs) {
    try {
      await message.react(pair.emoji);
    } catch (error) {
      console.error(`Could not add reaction ${pair.emoji}:`, error);
    }
  }

  await interaction.reply({
    content: '✅ Reaction-role message posted.',
    ephemeral: true,
  });
}

/**
 * Handles reaction role additions.
 */
async function handleReactionAdd(reaction, user) {
  if (user.bot) return;

  const pairs = reactionRoleMessages.get(reaction.message.id);
  if (!pairs) return;

  const emoji = reaction.emoji.name || reaction.emoji.toString();

  const pair = pairs.find((p) => p.emoji === emoji);
  if (!pair) return;

  const member = await reaction.message.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) return;

  const role = reaction.message.guild.roles.cache.get(pair.roleId);
  if (!role) return;

  try {
    await member.roles.add(role);
  } catch (error) {
    console.error('Failed to add reaction role:', error);
  }
}

/**
 * Handles reaction role removal.
 */
async function handleReactionRemove(reaction, user) {
  if (user.bot) return;

  const pairs = reactionRoleMessages.get(reaction.message.id);
  if (!pairs) return;

  const emoji = reaction.emoji.name || reaction.emoji.toString();

  const pair = pairs.find((p) => p.emoji === emoji);
  if (!pair) return;

  const member = await reaction.message.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) return;

  const role = reaction.message.guild.roles.cache.get(pair.roleId);
  if (!role) return;

  try {
    await member.roles.remove(role);
  } catch (error) {
    console.error('Failed to remove reaction role:', error);
  }
}

module.exports = {
  postSelfRoleMenu,
  handleSelfRoleSelect,
  postReactionRoleMessage,
  handleReactionAdd,
  handleReactionRemove,
};
