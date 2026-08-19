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

  // Make sure both roles exist
  await getOrCreateRole(interaction.guild, UNVERIFIED_ROLE_NAME, { color: 0x95a5a6 });
  await getOrCreateRole(interaction.guild, VERIFIED_ROLE_NAME, { color: 0x2ecc71 });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ Verify to enter Novara')
    .setDescription('Click the button below to verify and unlock the rest of the server. Quick and automatic — no waiting.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_button').setLabel('Verify Me').setStyle(ButtonStyle.Success).setEmoji('✅'),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: 'Verification message posted.', ephemeral: true });
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
    console.error('Verification failed:', err);
    await interaction.reply({ content: 'Something went wrong verifying you — ping a mod for help.', ephemeral: true });
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
