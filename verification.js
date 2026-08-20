// verification.js — New members get an Unverified role on join and can't
// see the rest of the server until they click Verify.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const UNVERIFIED_ROLE_NAME = 'Unverified';
const VERIFIED_ROLE_NAME = 'Verified';

async function getOrCreateRole(guild, name, options = {}) {
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await guild.roles.create({ name, reason: 'Auto-created by verification system', ...options });
  }
  return role;
}

// Call this on guildMemberAdd
async function assignUnverifiedOnJoin(member) {
  try {
    const unverifiedRole = await getOrCreateRole(member.guild, UNVERIFIED_ROLE_NAME, { color: 0x95a5a6 });
    await member.roles.add(unverifiedRole);
  } catch (err) {
    console.error('Failed to assign Unverified role:', err);
  }
}

// Admin command: posts the verify button message in a channel
async function postVerificationMessage(interaction) {
  if (!interaction.memberPermissions.has('ManageRoles')) {
    await interaction.reply({ content: 'You need Manage Roles permission to set this up.', ephemeral: true });
    return;
  }

  // Check the BOT's own permissions — this is the most common silent-failure cause
  const botMember = interaction.guild.members.me;
  if (!botMember.permissions.has('ManageRoles')) {
    await interaction.reply({
      content: '❌ I don\'t have the **Manage Roles** permission in this server. Go to Server Settings → Roles → find my bot role → enable Manage Roles, then try again.',
      ephemeral: true,
    });
    return;
  }

  try {
    // Make sure both roles exist
    const unverifiedRole = await getOrCreateRole(interaction.guild, UNVERIFIED_ROLE_NAME, { color: 0x95a5a6 });
    const verifiedRole = await getOrCreateRole(interaction.guild, VERIFIED_ROLE_NAME, { color: 0x2ecc71 });

    // Check role hierarchy — the bot can only manage roles BELOW its own highest role
    if (botMember.roles.highest.position <= verifiedRole.position || botMember.roles.highest.position <= unverifiedRole.position) {
      await interaction.reply({
        content: `❌ My role is positioned too low. Go to Server Settings → Roles and drag my bot's role **above** "${VERIFIED_ROLE_NAME}" and "${UNVERIFIED_ROLE_NAME}", then try again.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('✅ Verify to enter Novara')
      .setDescription('Click the button below to verify and unlock the rest of the server. Quick and automatic — no waiting.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_button').setLabel('Verify Me').setStyle(ButtonStyle.Success).setEmoji('✅'),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Verification message posted.', ephemeral: true });
  } catch (err) {
    console.error('setupverify failed:', err);
    await interaction.reply({
      content: `❌ Something went wrong setting this up: ${err.message}. Most common cause: check I have Manage Roles permission and my role is positioned above the roles I'm trying to manage.`,
      ephemeral: true,
    }).catch(() => {});
  }
}

// Button click handler
async function handleVerifyButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'verify_button') return false;

  const guild = interaction.guild;
  const member = interaction.member;

  const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
  const verifiedRole = await getOrCreateRole(guild, VERIFIED_ROLE_NAME, { color: 0x2ecc71 });

  if (member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: 'You\'re already verified!', ephemeral: true });
    return true;
  }

  try {
    await member.roles.add(verifiedRole);
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole);
    }
    await interaction.reply({ content: '✅ You\'re verified! Welcome to the rest of the server.', ephemeral: true });
  } catch (err) {
    console.error('Verification failed:', err.message);
    const botMember = interaction.guild.members.me;
    const hierarchyIssue = botMember.roles.highest.position <= verifiedRole.position;
    await interaction.reply({
      content: hierarchyIssue
        ? 'Verification is misconfigured — ping an admin to check the bot\'s role position (Server Settings → Roles).'
        : 'Something went wrong verifying you — ping a mod for help.',
      ephemeral: true,
    });
  }
  return true;
}

module.exports = {
  assignUnverifiedOnJoin,
  postVerificationMessage,
  handleVerifyButton,
  UNVERIFIED_ROLE_NAME,
  VERIFIED_ROLE_NAME,
};
