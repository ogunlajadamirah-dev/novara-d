// rank-card.js — Generates styled PNG rank cards and leaderboard images,
// similar in spirit to the reference screenshots (Gray Fog Tavern style).
// Uses @napi-rs/canvas — no native build tools needed, works cleanly on
// Railway/Replit unlike node-canvas.

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// ==================== helpers ====================

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawCircleAvatar(ctx, avatarUrl, cx, cy, radius, borderColor) {
  try {
    const img = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch (err) {
    // fallback: solid circle if avatar fails to load
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = borderColor;
  ctx.stroke();
}

// ==================== RANK CARD ====================
// Matches the layout in rank.png: avatar left, name + handle, XP bar,
// total XP / msgs stats, and a RANK / LEVEL panel on the right.

async function generateRankCard({ username, handle, avatarUrl, rank, level, xp, xpNeeded, totalXp, msgs }) {
  const width = 950;
  const height = 260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background — dark gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#2b2420');
  bg.addColorStop(1, '#1a1512');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  // Right stat panel background
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, width - 220, 0, 220, height, 18);
  ctx.fill();
  ctx.fillStyle = ctx.fillStyle; // keep left corners square visually — fine for this simple version

  // Avatar
  await drawCircleAvatar(ctx, avatarUrl, 110, height / 2, 65, '#ffffff');

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(username, 210, 95);

  // Handle
  ctx.fillStyle = '#a89b8f';
  ctx.font = '20px sans-serif';
  ctx.fillText(handle, 210, 122);

  // Divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(210, 140);
  ctx.lineTo(700, 140);
  ctx.stroke();

  // EXPERIENCE label + numbers
  ctx.fillStyle = '#a89b8f';
  ctx.font = '16px sans-serif';
  ctx.fillText('EXPERIENCE', 210, 168);
  const pct = Math.min(100, Math.round((xp / xpNeeded) * 100));
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${xp} / ${xpNeeded} · ${pct}%`, 700, 168);
  ctx.textAlign = 'left';

  // XP bar
  const barX = 210, barY = 178, barW = 490, barH = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, barX, barY, barW, barH, 7);
  ctx.fill();
  ctx.fillStyle = '#e6ddd3';
  roundRect(ctx, barX, barY, Math.max(barW * (pct / 100), 14), barH, 7);
  ctx.fill();

  // TOTAL XP / MSGS stats
  ctx.fillStyle = '#a89b8f';
  ctx.font = '14px sans-serif';
  ctx.fillText('TOTAL XP', 210, 222);
  ctx.fillText('MSGS', 420, 222);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(totalXp.toLocaleString(), 210, 248);
  ctx.fillText(String(msgs), 420, 248);

  // RANK / LEVEL panel (right side)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a89b8f';
  ctx.font = '15px sans-serif';
  ctx.fillText('RANK', width - 110, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(`#${rank}`, width - 110, 135);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(width - 190, 155);
  ctx.lineTo(width - 30, 155);
  ctx.stroke();

  ctx.fillStyle = '#a89b8f';
  ctx.font = '15px sans-serif';
  ctx.fillText('LEVEL', width - 110, 190);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(String(level), width - 110, 235);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ==================== LEADERBOARD CARD ====================
// Top 3 podium + ranked list, matching ecolb.png's layout.

async function generateLeaderboardCard({ serverName, title, entries, currency = '', formatValue }) {
  const width = 1200;
  const rowHeight = 74;
  const podiumY = 105;
  const cardH = 250;
  const listStartY = podiumY + cardH + 60;
  const listCount = Math.max(0, entries.length - 3);
  const height = listStartY + listCount * (rowHeight + 8) + 30; // +30 bottom padding
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d0a0a';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(serverName, 40, 55);

  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(title.toUpperCase(), width / 2, 55);
  ctx.strokeStyle = '#e03e5b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 200, 68);
  ctx.lineTo(width / 2 + 200, 68);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a89b8f';
  ctx.font = '16px sans-serif';
  ctx.fillText(`PAGE 1/1 · ${entries.length} players`, width - 40, 55);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(40, 85);
  ctx.lineTo(width - 40, 85);
  ctx.stroke();

  // Podium (top 3)
  const podiumOrder = [1, 0, 2]; // visual order: 2nd, 1st, 3rd
  const podiumColors = ['#c0c0c0', '#f1c40f', '#e07a52'];
  const cardW = 340;
  const gap = 20;
  const totalW = cardW * 3 + gap * 2;
  const startX = (width - totalW) / 2;

  for (let slot = 0; slot < 3; slot++) {
    const entryIndex = podiumOrder[slot];
    const entry = entries[entryIndex];
    if (!entry) continue;
    const x = startX + slot * (cardW + gap);
    const isFirst = entryIndex === 0;
    const y = isFirst ? podiumY - 15 : podiumY;
    const h = isFirst ? cardH + 15 : cardH;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, x, y, cardW, h, 16);
    ctx.fill();
    if (isFirst) {
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, cardW, h, 16);
      ctx.stroke();
    }

    const cx = x + cardW / 2;
    const avatarY = y + 75;
    await drawCircleAvatar(ctx, entry.avatarUrl, cx, avatarY, 45, podiumColors[entryIndex]);

    ctx.textAlign = 'center';
    ctx.fillStyle = isFirst ? '#f1c40f' : '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(entry.name, cx, avatarY + 75);

    ctx.fillStyle = podiumColors[entryIndex];
    ctx.font = '14px sans-serif';
    ctx.fillText('◆ ' + (entry.tag || 'Member'), cx, avatarY + 100);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(formatValue ? formatValue(entry.value) : String(entry.value), cx, avatarY + 135);

    // rank badge
    ctx.beginPath();
    ctx.arc(cx, y + h - 5, 15, 0, Math.PI * 2);
    ctx.fillStyle = podiumColors[entryIndex];
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(String(entryIndex + 1), cx, y + h);
    ctx.textAlign = 'left';
  }

  // Ranked list (4th onward)
  let rowY = listStartY;
  for (let i = 3; i < entries.length; i++) {
    const entry = entries[i];
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 40, rowY, width - 80, rowHeight, 12);
    ctx.fill();

    ctx.fillStyle = '#a89b8f';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`#${i + 1}`, 60, rowY + rowHeight / 2 + 7);

    await drawCircleAvatar(ctx, entry.avatarUrl, 150, rowY + rowHeight / 2, 22, '#555');

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(entry.name, 190, rowY + rowHeight / 2 + 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e07a90';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(formatValue ? formatValue(entry.value) : String(entry.value), width - 60, rowY + rowHeight / 2 + 7);
    ctx.textAlign = 'left';

    rowY += rowHeight + 8;
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard, generateLeaderboardCard };
