// battleship.js — 1v1 Battleship on 5x5 grids, ships auto-placed, turn-based
// button attacks. Only hit/miss is ever shown publicly — ship positions
// stay hidden until hit, preserving real hidden-information gameplay.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const SIZE = 5;
const SHIP_SIZES = [3, 2, 2];
const WIN_REWARD = 70;
const activeGames = new Map();

function placeShips() {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (const size of SHIP_SIZES) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() > 0.5;
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      const cells = [];
      let fits = true;
      for (let i = 0; i < size; i++) {
        const rr = horizontal ? r : r + i;
        const cc = horizontal ? c + i : c;
        if (rr >= SIZE || cc >= SIZE || grid[rr][cc]) {
          fits = false;
          break;
        }
        cells.push([rr, cc]);
      }
      if (fits) {
        for (const [rr, cc] of cells) grid[rr][cc] = true;
        placed = true;
      }
    }
  }
  return grid;
}

function totalShipCells() {
  return SHIP_SIZES.reduce((a, b) => a + b, 0);
}

function buildAttackButtons(shots, gameId, disabled = false) {
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < SIZE; c++) {
      const key = `${r},${c}`;
      const shot = shots.get(key);
      let label = '🌊', style = ButtonStyle.Secondary;
      if (shot === 'hit') { label = '🔥'; style = ButtonStyle.Danger; }
      else if (shot === 'miss') { label = '💧'; style = ButtonStyle.Primary; }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bs_${gameId}_${r}_${c}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled || shot !== undefined),
      );
    }
    rows.push(row);
  }
  return rows;
}

async function startBattleship(interaction) {
  const opponent = interaction.options.getUser('opponent');
  if (opponent.bot) {
    await interaction.reply({ content: 'Pick a real member to challenge, not a bot.', ephemeral: true });
    return;
  }
  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: 'You can\'t challenge yourself.', ephemeral: true });
    return;
  }

  const gameId = interaction.id;
  const game = {
    gameId,
    grids: {
      [interaction.user.id]: placeShips(),
      [opponent.id]: placeShips(),
    },
    shots: {
      [interaction.user.id]: new Map(),
      [opponent.id]: new Map(),
    },
    players: [interaction.user.id, opponent.id],
    turn: interaction.user.id,
  };
  activeGames.set(gameId, game);

  const embed = new EmbedBuilder()
    .setColor(0x2980b9)
    .setTitle('🚢 Battleship')
    .setDescription(`${interaction.user} vs ${opponent}\n\nShips auto-placed for both. It's <@${game.turn}>'s turn — attack their grid below.\nSink all ships to win **${WIN_REWARD}** coins.`);

  await interaction.reply({ embeds: [embed], components: buildAttackButtons(game.shots[game.turn], gameId) });
}

async function handleBattleshipButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('bs_')) return false;
  const [, gameId, rStr, cStr] = interaction.customId.split('_');
  const game = activeGames.get(gameId);
  if (!game) {
    await interaction.reply({ content: 'This game has ended.', ephemeral: true });
    return true;
  }

  if (interaction.user.id !== game.turn) {
    await interaction.reply({ content: 'It\'s not your turn!', ephemeral: true });
    return true;
  }

  const r = parseInt(rStr, 10), c = parseInt(cStr, 10);
  const opponentId = game.players.find((id) => id !== game.turn);
  const opponentGrid = game.grids[opponentId];
  const myShots = game.shots[game.turn];

  const isHit = opponentGrid[r][c];
  myShots.set(`${r},${c}`, isHit ? 'hit' : 'miss');

  const hitCount = [...myShots.values()].filter((v) => v === 'hit').length;

  if (hitCount >= totalShipCells()) {
    activeGames.delete(gameId);
    const winner = await interaction.client.users.fetch(game.turn);
    const user = getUser(game.turn);
    user.coins += WIN_REWARD;
    saveUser(game.turn, user);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🚢 Battleship — Game Over')
      .setDescription(`${isHit ? '🔥 Hit!' : '💧 Miss.'} ${winner} sank all ships and wins! +${WIN_REWARD} coins.`);
    await interaction.update({ embeds: [embed], components: buildAttackButtons(myShots, gameId, true) });
    return true;
  }

  game.turn = opponentId;
  const nextShots = game.shots[game.turn];

  const embed = new EmbedBuilder()
    .setColor(0x2980b9)
    .setTitle('🚢 Battleship')
    .setDescription(`${isHit ? '🔥 Hit!' : '💧 Miss.'}\n\nIt's <@${game.turn}>'s turn — attack their grid below.\nSink all ships to win **${WIN_REWARD}** coins.`);

  await interaction.update({ embeds: [embed], components: buildAttackButtons(nextShots, gameId) });
  return true;
}

module.exports = { startBattleship, handleBattleshipButton };
