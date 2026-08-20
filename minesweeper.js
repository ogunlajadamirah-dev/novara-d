// minesweeper.js — Classic Minesweeper on a 5x5 button grid with flood-fill reveal.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const SIZE = 5;
const MINE_COUNT = 4;
const REWARD = 45;
const activeGames = new Map();

function makeBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const mines = new Set();
  while (mines.size < MINE_COUNT) {
    mines.add(Math.floor(Math.random() * SIZE * SIZE));
  }
  for (const idx of mines) {
    const r = Math.floor(idx / SIZE), c = idx % SIZE;
    board[r][c] = 9;
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 9) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === 9) count++;
        }
      }
      board[r][c] = count;
    }
  }
  return board;
}

function floodReveal(board, revealed, r, c) {
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
  if (revealed.has(`${r},${c}`)) return;
  revealed.add(`${r},${c}`);
  if (board[r][c] === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        floodReveal(board, revealed, r + dr, c + dc);
      }
    }
  }
}

const NUMBER_EMOJI = ['⬛', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function buildButtons(game, gameOver = false) {
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < SIZE; c++) {
      const key = `${r},${c}`;
      const isRevealed = game.revealed.has(key);
      const cellValue = game.board[r][c];

      let label = '⬜';
      let style = ButtonStyle.Secondary;

      if (isRevealed) {
        if (cellValue === 9) {
          label = '💣';
          style = ButtonStyle.Danger;
        } else {
          label = NUMBER_EMOJI[cellValue];
          style = ButtonStyle.Success;
        }
      } else if (gameOver && cellValue === 9) {
        label = '💣';
        style = ButtonStyle.Danger;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mine_${r}_${c}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(gameOver || isRevealed),
      );
    }
    rows.push(row);
  }
  return rows;
}

async function startMinesweeper(interaction) {
  const board = makeBoard();
  const game = { board, revealed: new Set(), userId: interaction.user.id, safeTotal: SIZE * SIZE - MINE_COUNT };

  const embed = new EmbedBuilder()
    .setColor(0x34495e)
    .setTitle('💣 Minesweeper')
    .setDescription(`${MINE_COUNT} mines hidden in a ${SIZE}x${SIZE} grid. Reveal all safe cells to win **${REWARD}** coins. Click a mine and you lose.`);

  const sent = await interaction.reply({ embeds: [embed], components: buildButtons(game), fetchReply: true });
  activeGames.set(sent.id, game);
}

async function handleMinesweeperButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('mine_')) return false;

  const game = activeGames.get(interaction.message.id);
  if (!game) {
    await interaction.reply({ content: 'This game has ended.', ephemeral: true });
    return true;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: 'This isn\'t your game.', ephemeral: true });
    return true;
  }

  const [, rStr, cStr] = interaction.customId.split('_');
  const r = parseInt(rStr, 10), c = parseInt(cStr, 10);

  if (game.board[r][c] === 9) {
    activeGames.delete(interaction.message.id);
    game.revealed.add(`${r},${c}`);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('💥 Boom!')
      .setDescription('You hit a mine. Better luck next time.');
    await interaction.update({ embeds: [embed], components: buildButtons(game, true) });
    return true;
  }

  floodReveal(game.board, game.revealed, r, c);

  if (game.revealed.size >= game.safeTotal) {
    activeGames.delete(interaction.message.id);
    const user = getUser(game.userId);
    user.coins += REWARD;
    saveUser(game.userId, user);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🎉 Cleared!')
      .setDescription(`All safe cells revealed! +${REWARD} coins.`);
    await interaction.update({ embeds: [embed], components: buildButtons(game, true) });
    return true;
  }

  const embed = new EmbedBuilder()
    .setColor(0x34495e)
    .setTitle('💣 Minesweeper')
    .setDescription(`${game.safeTotal - game.revealed.size} safe cells left to find.`);
  await interaction.update({ embeds: [embed], components: buildButtons(game) });
  return true;
}

module.exports = { startMinesweeper, handleMinesweeperButton };
