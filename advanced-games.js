// advanced-games.js — Tic-Tac-Toe (1v1), Connect 4 (1v1), Wordle (co-op).
// These are stateful, multi-turn games — the kind people actually keep
// coming back to, same category as Hangman.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const WIN_REWARD = 60;
const TIE_REWARD = 15;

// ==================== TIC-TAC-TOE ====================
const ticTacToeGames = new Map();

function checkTTTWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((cell) => cell !== null)) return 'tie';
  return null;
}

function buildTTTButtons(board, gameId, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const cell = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${gameId}_${i}`)
          .setLabel(cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '\u200b')
          .setStyle(cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(disabled || cell !== null),
      );
    }
    rows.push(row);
  }
  return rows;
}

async function startTicTacToe(interaction) {
  const opponent = interaction.options.getUser('opponent');
  if (opponent.bot) {
    await interaction.reply({ content: 'Pick a real member to challenge, not a bot.', ephemeral: true });
    return;
  }
  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: 'You can\'t challenge yourself.', ephemeral: true });
    return;
  }

  const gameId = `${interaction.id}`;
  const board = Array(9).fill(null);
  const game = { board, players: { X: interaction.user.id, O: opponent.id }, turn: 'X', gameId };

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('❌⭕ Tic-Tac-Toe')
    .setDescription(`${interaction.user} (❌) vs ${opponent} (⭕)\n\nIt's ${interaction.user}'s turn.\nWinner gets **${WIN_REWARD}** coins.`);

  await interaction.reply({ embeds: [embed], components: buildTTTButtons(board, gameId) });
  ticTacToeGames.set(gameId, game);
}

async function handleTTTButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('ttt_')) return false;
  const [, gameId, indexStr] = interaction.customId.split('_');
  const game = ticTacToeGames.get(gameId);
  if (!game) {
    await interaction.reply({ content: 'This game has ended.', ephemeral: true });
    return true;
  }

  const currentPlayerId = game.players[game.turn];
  if (interaction.user.id !== currentPlayerId) {
    await interaction.reply({ content: 'It\'s not your turn!', ephemeral: true });
    return true;
  }

  const index = parseInt(indexStr, 10);
  if (game.board[index] !== null) {
    await interaction.reply({ content: 'That spot is taken.', ephemeral: true });
    return true;
  }

  game.board[index] = game.turn;
  const winner = checkTTTWinner(game.board);

  if (winner) {
    ticTacToeGames.delete(gameId);
    let description;
    if (winner === 'tie') {
      const p1 = await interaction.client.users.fetch(game.players.X);
      const p2 = await interaction.client.users.fetch(game.players.O);
      for (const id of [game.players.X, game.players.O]) {
        const u = getUser(id);
        u.coins += TIE_REWARD;
        saveUser(id, u);
      }
      description = `It's a tie! Both ${p1} and ${p2} get **${TIE_REWARD}** coins.`;
    } else {
      const winnerId = game.players[winner];
      const winnerUser = await interaction.client.users.fetch(winnerId);
      const u = getUser(winnerId);
      u.coins += WIN_REWARD;
      saveUser(winnerId, u);
      description = `${winnerUser} (${winner === 'X' ? '❌' : '⭕'}) wins! +${WIN_REWARD} coins.`;
    }
    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(description);
    await interaction.update({ embeds: [embed], components: buildTTTButtons(game.board, gameId, true) });
    return true;
  }

  game.turn = game.turn === 'X' ? 'O' : 'X';
  const nextPlayerId = game.players[game.turn];
  const header = interaction.message.embeds[0].description.split('\n\n')[0];
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
    `${header}\n\nIt's <@${nextPlayerId}>'s turn.\nWinner gets **${WIN_REWARD}** coins.`,
  );
  await interaction.update({ embeds: [embed], components: buildTTTButtons(game.board, gameId) });
  return true;
}

// ==================== CONNECT 4 ====================
const connect4Games = new Map();
const C4_ROWS = 6, C4_COLS = 7;

function makeC4Board() {
  return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null));
}

function dropC4Piece(board, col, piece) {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      board[r][col] = piece;
      return r;
    }
  }
  return -1;
}

function checkC4Winner(board) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      for (const [dr, dc] of dirs) {
        let count = 1;
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step, nc = c + dc * step;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS || board[nr][nc] !== piece) break;
          count++;
        }
        if (count >= 4) return piece;
      }
    }
  }
  if (board.every((row) => row.every((cell) => cell !== null))) return 'tie';
  return null;
}

function renderC4Board(board) {
  const emojiMap = { R: '🔴', Y: '🟡', null: '⚫' };
  return board.map((row) => row.map((cell) => emojiMap[cell]).join('')).join('\n');
}

function buildC4Buttons(gameId, fullCols = []) {
  const row = new ActionRowBuilder();
  for (let c = 0; c < C4_COLS; c++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`c4_${gameId}_${c}`)
        .setLabel(String(c + 1))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(fullCols.includes(c)),
    );
  }
  return [row];
}

async function startConnect4(interaction) {
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
  const board = makeC4Board();
  const game = { board, players: { R: interaction.user.id, Y: opponent.id }, turn: 'R', gameId };
  connect4Games.set(gameId, game);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🔴🟡 Connect 4')
    .setDescription(`${interaction.user} (🔴) vs ${opponent} (🟡)\n\n${renderC4Board(board)}\n\nIt's ${interaction.user}'s turn — click a column number.\nWinner gets **${WIN_REWARD}** coins.`);

  await interaction.reply({ embeds: [embed], components: buildC4Buttons(gameId) });
}

async function handleC4Button(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('c4_')) return false;
  const [, gameId, colStr] = interaction.customId.split('_');
  const game = connect4Games.get(gameId);
  if (!game) {
    await interaction.reply({ content: 'This game has ended.', ephemeral: true });
    return true;
  }

  const currentPlayerId = game.players[game.turn];
  if (interaction.user.id !== currentPlayerId) {
    await interaction.reply({ content: 'It\'s not your turn!', ephemeral: true });
    return true;
  }

  const col = parseInt(colStr, 10);
  const dropped = dropC4Piece(game.board, col, game.turn);
  if (dropped === -1) {
    await interaction.reply({ content: 'That column is full.', ephemeral: true });
    return true;
  }

  const winner = checkC4Winner(game.board);
  const fullCols = [];
  for (let c = 0; c < C4_COLS; c++) if (game.board[0][c] !== null) fullCols.push(c);

  if (winner) {
    connect4Games.delete(gameId);
    let description;
    if (winner === 'tie') {
      const p1 = await interaction.client.users.fetch(game.players.R);
      const p2 = await interaction.client.users.fetch(game.players.Y);
      for (const id of [game.players.R, game.players.Y]) {
        const u = getUser(id);
        u.coins += TIE_REWARD;
        saveUser(id, u);
      }
      description = `${renderC4Board(game.board)}\n\nIt's a tie! Both ${p1} and ${p2} get **${TIE_REWARD}** coins.`;
    } else {
      const winnerId = game.players[winner];
      const winnerUser = await interaction.client.users.fetch(winnerId);
      const u = getUser(winnerId);
      u.coins += WIN_REWARD;
      saveUser(winnerId, u);
      description = `${renderC4Board(game.board)}\n\n${winnerUser} (${winner === 'R' ? '🔴' : '🟡'}) wins! +${WIN_REWARD} coins.`;
    }
    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(description);
    await interaction.update({ embeds: [embed], components: buildC4Buttons(gameId, Array.from({ length: C4_COLS }, (_, i) => i)) });
    return true;
  }

  game.turn = game.turn === 'R' ? 'Y' : 'R';
  const nextPlayerId = game.players[game.turn];
  const header = interaction.message.embeds[0].description.split('\n\n')[0];
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
    `${header}\n\n${renderC4Board(game.board)}\n\nIt's <@${nextPlayerId}>'s turn — click a column number.\nWinner gets **${WIN_REWARD}** coins.`,
  );
  await interaction.update({ embeds: [embed], components: buildC4Buttons(gameId, fullCols) });
  return true;
}

// ==================== WORDLE (co-op, channel-wide) ====================
const WORDLE_WORDS = ['story', 'novel', 'write', 'quest', 'dream', 'magic', 'brave', 'heart', 'world', 'begin', 'grace', 'light', 'shade', 'plots'];
const WORDLE_REWARD = 50;
const wordleGames = new Map();

function scoreWordleGuess(guess, answer) {
  const result = Array(5).fill('⬛');
  const answerChars = answer.split('');
  const guessChars = guess.split('');

  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = '🟩';
      answerChars[i] = null;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === '🟩') continue;
    const idx = answerChars.indexOf(guessChars[i]);
    if (idx !== -1) {
      result[i] = '🟨';
      answerChars[idx] = null;
    }
  }
  return result.join('');
}

async function startWordle(channel) {
  if (wordleGames.has(channel.id)) {
    await channel.send('A Wordle game is already active in this channel!');
    return;
  }
  const word = WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)];
  wordleGames.set(channel.id, { word, guesses: [], maxGuesses: 6 });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x27ae60)
        .setTitle('🟩 Wordle — Community Edition')
        .setDescription(`Guess the 5-letter word! Anyone in the channel can guess. **6** total guesses shared across everyone.\nType a 5-letter word to guess.\n\nWhoever guesses it right wins **${WORDLE_REWARD}** coins.`),
    ],
  });
}

async function handleWordleGuess(message) {
  const game = wordleGames.get(message.channel.id);
  if (!game) return false;

  const guess = message.content.trim().toLowerCase();
  if (guess.length !== 5 || !/^[a-z]+$/.test(guess)) return false;

  const scoreLine = scoreWordleGuess(guess, game.word);
  game.guesses.push({ guess, scoreLine, userId: message.author.id });

  const won = guess === game.word;
  const outOfGuesses = game.guesses.length >= game.maxGuesses;
  const boardText = game.guesses.map((g) => `${g.scoreLine}  \`${g.guess.toUpperCase()}\``).join('\n');

  if (won) {
    const user = getUser(message.author.id);
    user.coins += WORDLE_REWARD;
    saveUser(message.author.id, user);
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x27ae60)
          .setTitle('🎉 Wordle Solved!')
          .setDescription(`${boardText}\n\n${message.author} got it! The word was **${game.word.toUpperCase()}**. +${WORDLE_REWARD} coins.`),
      ],
    });
    wordleGames.delete(message.channel.id);
  } else if (outOfGuesses) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('💀 Out of guesses!')
          .setDescription(`${boardText}\n\nThe word was **${game.word.toUpperCase()}**.`),
      ],
    });
    wordleGames.delete(message.channel.id);
  } else {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x27ae60)
          .setTitle('🟩 Wordle — Community Edition')
          .setDescription(`${boardText}\n\n${game.maxGuesses - game.guesses.length} guesses left. Keep guessing!`),
      ],
    });
  }
  return true;
}

module.exports = {
  startTicTacToe,
  handleTTTButton,
  startConnect4,
  handleC4Button,
  startWordle,
  handleWordleGuess,
};
