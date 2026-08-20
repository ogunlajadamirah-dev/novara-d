// applications.js — Creator & Moderator application system.
// Roles: Community Moderator, Senior Moderator (capped combined at MOD_CAP),
// Manga Artist, Translator, Editor, Proofreader, Letter Writer (uncapped).

const { getKV, setKV } = require('./db-kv');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const MOD_CAP = 20; // combined cap across Community Mod + Senior Mod, per your recruitment doc
const REVIEW_CHANNEL_ID = process.env.APPLICATIONS_CHANNEL_ID; // where applications get posted for review

const ROLES = [
  { id: 'community_mod', label: 'Community Moderator', capped: true },
  // Senior Moderator is NOT an applicable role — per the handbook, Senior
  // Mods are promoted internally from proven Community Mods, not applied
  // for directly. It still counts toward MOD_CAP below in case you ever
  // promote someone and want the 20-slot cap to reflect it.
  { id: 'manga_artist', label: 'Manga Artist', capped: false },
  { id: 'translator', label: 'Translator', capped: false },
  { id: 'editor', label: 'Editor', capped: false },
  { id: 'proofreader', label: 'Proofreader', capped: false },
  { id: 'letter_writer', label: 'Letter Writer', capped: false },
];

const STORAGE_KEY = 'applications';

function load() {
  return getKV(STORAGE_KEY, { applications: [] });
}

function save(data) {
  setKV(STORAGE_KEY, data);
}

function getApprovedModCount() {
  const data = load();
  return data.applications.filter(
    (a) => (a.roleId === 'community_mod' || a.roleId === 'senior_mod') && a.status === 'approved',
  ).length;
}

function roleLabel(roleId) {
  return ROLES.find((r) => r.id === roleId)?.label || roleId;
}

// ---- Step 1: role picker ----
async function startApplication(interaction) {
  const modCount = getApprovedModCount();
  const modSlotsLeft = MOD_CAP - modCount;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('apply_role_select')
    .setPlaceholder('Choose a role to apply for')
    .addOptions(
      ROLES.map((r) => ({
        label: r.capped ? `${r.label} (${modSlotsLeft} of ${MOD_CAP} mod slots left)` : r.label,
        value: r.id,
        description: r.capped ? 'Moderator role — capped at 20 total across both mod tiers' : 'Creator role',
      })),
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({
    content: 'What are you applying for?',
    components: [row],
    ephemeral: true,
  });
}

// ---- Step 2: role selected -> open modal ----
async function handleRoleSelect(interaction) {
  const roleId = interaction.values[0];
  const role = ROLES.find((r) => r.id === roleId);

  if (role.capped) {
    const modCount = getApprovedModCount();
    if (modCount >= MOD_CAP) {
      await interaction.update({ content: `Sorry — all ${MOD_CAP} moderator slots are currently filled. Check back later or apply for a creator role instead.`, components: [] });
      return;
    }
  }

  const modal = new ModalBuilder().setCustomId(`apply_modal_${roleId}`).setTitle(`Apply: ${role.label}`.slice(0, 45));

  const timezoneInput = new TextInputBuilder().setCustomId('timezone').setLabel('Your timezone').setStyle(TextInputStyle.Short).setRequired(true);
  const activityInput = new TextInputBuilder().setCustomId('activity').setLabel('Weekly availability / activity').setStyle(TextInputStyle.Short).setRequired(true);
  const experienceInput = new TextInputBuilder().setCustomId('experience').setLabel('Relevant experience').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const whyInput = new TextInputBuilder().setCustomId('why').setLabel('Why this role, specifically?').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const sampleInput = new TextInputBuilder().setCustomId('sample').setLabel('Portfolio link / sample OR a relevant story').setStyle(TextInputStyle.Paragraph).setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(timezoneInput),
    new ActionRowBuilder().addComponents(activityInput),
    new ActionRowBuilder().addComponents(experienceInput),
    new ActionRowBuilder().addComponents(whyInput),
    new ActionRowBuilder().addComponents(sampleInput),
  );

  await interaction.showModal(modal);
}

// ---- Step 3: modal submitted -> store + post to review channel ----
async function handleModalSubmit(interaction, client) {
  const roleId = interaction.customId.replace('apply_modal_', '');
  const role = ROLES.find((r) => r.id === roleId);

  const application = {
    id: `${interaction.user.id}_${Date.now()}`,
    userId: interaction.user.id,
    username: interaction.user.username,
    roleId,
    roleLabel: role.label,
    timezone: interaction.fields.getTextInputValue('timezone'),
    activity: interaction.fields.getTextInputValue('activity'),
    experience: interaction.fields.getTextInputValue('experience'),
    why: interaction.fields.getTextInputValue('why'),
    sample: interaction.fields.getTextInputValue('sample'),
    status: 'pending',
    submittedAt: Date.now(),
  };

  const data = load();
  data.applications.push(application);
  save(data);

  await interaction.reply({ content: `✅ Application submitted for **${role.label}**. You'll hear back once it's reviewed.`, ephemeral: true });

  if (REVIEW_CHANNEL_ID) {
    const channel = await client.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`New Application — ${role.label}`)
        .addFields(
          { name: 'Applicant', value: `<@${application.userId}> (${application.username})` },
          { name: 'Timezone', value: application.timezone, inline: true },
          { name: 'Weekly activity', value: application.activity, inline: true },
          { name: 'Experience', value: application.experience.slice(0, 1000) },
          { name: 'Why this role', value: application.why.slice(0, 1000) },
          { name: 'Sample / relevant story', value: application.sample.slice(0, 1000) },
        )
        .setFooter({ text: `Application ID: ${application.id}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appdecision_approve_${application.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`appdecision_reject_${application.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
      );

      await channel.send({ embeds: [embed], components: [row] });
    }
  }
}

// ---- Step 4: admin clicks Approve/Reject ----
async function handleDecisionButton(interaction, client) {
  if (!interaction.memberPermissions.has('ManageRoles')) {
    await interaction.reply({ content: 'You need Manage Roles permission to decide on applications.', ephemeral: true });
    return;
  }

  const [, decision, appId] = interaction.customId.split('_');
  const data = load();
  const app = data.applications.find((a) => a.id === appId);
  if (!app) {
    await interaction.reply({ content: 'Application not found — it may have been removed.', ephemeral: true });
    return;
  }

  if (decision === 'approve' && (app.roleId === 'community_mod' || app.roleId === 'senior_mod')) {
    const currentModCount = getApprovedModCount();
    if (currentModCount >= MOD_CAP) {
      await interaction.reply({ content: `Cannot approve — all ${MOD_CAP} mod slots are already filled.`, ephemeral: true });
      return;
    }
  }

  app.status = decision === 'approve' ? 'approved' : 'rejected';
  app.decidedBy = interaction.user.id;
  app.decidedAt = Date.now();
  save(data);

  const applicant = await client.users.fetch(app.userId).catch(() => null);
  if (applicant) {
    const msg = decision === 'approve'
      ? `🎉 Your application for **${app.roleLabel}** on Novara was approved! Someone from the team will reach out with next steps.`
      : `Thanks for applying for **${app.roleLabel}** on Novara. We won't be moving forward with this application right now, but we appreciate the time you put in.`;
    await applicant.send(msg).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(decision === 'approve' ? 0x2ecc71 : 0xe74c3c)
    .setFooter({ text: `${decision === 'approve' ? 'Approved' : 'Rejected'} by ${interaction.user.username}` });

  await interaction.update({ embeds: [updatedEmbed], components: [] });
}

// ---- View all applications on demand ----
async function listApplications(interaction) {
  if (!interaction.memberPermissions.has('ManageRoles')) {
    await interaction.reply({ content: 'You need Manage Roles permission to view applications.', ephemeral: true });
    return;
  }

  const statusFilter = interaction.options.getString('status') || 'pending';
  const data = load();
  const filtered = data.applications
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  if (filtered.length === 0) {
    await interaction.reply({ content: `No ${statusFilter === 'all' ? '' : statusFilter + ' '}applications found.`, ephemeral: true });
    return;
  }

  const statusEmoji = { pending: '🟡', approved: '🟢', rejected: '🔴' };
  const lines = filtered.slice(0, 20).map((a) => {
    const date = new Date(a.submittedAt).toLocaleDateString();
    return `${statusEmoji[a.status] || '⚪'} **${a.roleLabel}** — <@${a.userId}> (${a.username}) — ${date}\n\`ID: ${a.id}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Applications — ${statusFilter} (${filtered.length}${filtered.length > 20 ? ', showing 20' : ''})`)
    .setDescription(lines.join('\n\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  ROLES,
  MOD_CAP,
  startApplication,
  handleRoleSelect,
  handleModalSubmit,
  handleDecisionButton,
  getApprovedModCount,
  listApplications,
};
