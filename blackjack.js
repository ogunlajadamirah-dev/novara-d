// blackjack.js — Standard Blackjack vs a dealer bot, with betting.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, saveUser } = require('./storage');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const activeGames = new Map(); // userId -> game state

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function handTotal(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond) return `${hand[0].rank}${hand[0].suit} 🂠`;
  return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function buildButtons(disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
  return [row];
}

function buildEmbed(game, statusText, revealDealer = false) {
  return new EmbedBuilder()
    .setColor(0x1a5c2e)
    .setTitle('🃏 Blackjack')
    .addFields(
      { name: `Your hand (${handTotal(game.player)})`, value: formatHand(game.player) },
      {
        name: revealDealer ? `Dealer's hand (${handTotal(game.dealer)})` : 'Dealer\'s hand',
        value: formatHand(game.dealer, !revealDealer),
      },
    )
    .setDescription(statusText || `Bet: **${game.bet}** coins`);
}

async function startBlackjack(interaction) {
  const bet = interaction.options.getInteger('bet');
  const user = getUser(interaction.user.id);
  if (bet > user.coins) {
    await interaction.reply({ content: `You only have ${user.coins} coins.`, ephemeral: true });
    return;
  }
  if (activeGames.has(interaction.user.id)) {
    await interaction.reply({ content: 'You already have a Blackjack game in progress.', ephemeral: true });
    return;
  }

  const deck = freshDeck();
  const game = { deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], bet, userId: interaction.user.id };
  activeGames.set(interaction.user.id, game);

  const playerTotal = handTotal(game.player);
  if (playerTotal === 21) {
    await resolveGame(interaction, game, true);
    return;
  }

  await interaction.reply({ embeds: [buildEmbed(game)], components: buildButtons() });
}

async function resolveGame(interaction, game, isReply = false) {
  activeGames.delete(game.userId);
  const user = getUser(game.userId);

  const playerTotal = handTotal(game.player);
  let statusText;
  let coinChange = 0;

  if (playerTotal > 21) {
    statusText = `💥 Bust! You lose **${game.bet}** coins.`;
    coinChange = -game.bet;
  } else if (playerTotal === 21 && game.player.length === 2) {
    statusText = `🎉 Blackjack! You win **${Math.floor(game.bet * 1.5)}** coins.`;
    coinChange = Math.floor(game.bet * 1.5);
  } else {
    // Dealer plays
    while (handTotal(game.dealer) < 17) {
      game.dealer.push(game.deck.pop());
    }
    const dealerTotal = handTotal(game.dealer);

    if (dealerTotal > 21) {
      statusText = `Dealer busts with ${dealerTotal}! You win **${game.bet}** coins.`;
      coinChange = game.bet;
    } else if (dealerTotal > playerTotal) {
      statusText = `Dealer wins with ${dealerTotal} vs your ${playerTotal}. You lose **${game.bet}** coins.`;
      coinChange = -game.bet;
    } else if (dealerTotal < playerTotal) {
      statusText = `You win with ${playerTotal} vs dealer's ${dealerTotal}! +**${game.bet}** coins.`;
      coinChange = game.bet;
    } else {
      statusText = `Push — both have ${playerTotal}. Bet returned.`;
      coinChange = 0;
    }
  }

  user.coins += coinChange;
  saveUser(game.userId, user);

  const embed = buildEmbed(game, statusText, true);
  if (isReply) {
    await interaction.reply({ embeds: [embed], components: buildButtons(true) });
  } else {
    await interaction.update({ embeds: [embed], components: buildButtons(true) });
  }
}

async function handleBlackjackButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('bj_')) return false;

  const game = activeGames.get(interaction.user.id);
  if (!game) {
    await interaction.reply({ content: 'This game has ended or isn\'t yours.', ephemeral: true });
    return true;
  }

  if (interaction.customId === 'bj_hit') {
    game.player.push(game.deck.pop());
    const total = handTotal(game.player);
    if (total >= 21) {
      await resolveGame(interaction, game);
    } else {
      await interaction.update({ embeds: [buildEmbed(game)], components: buildButtons() });
    }
    return true;
  }

  if (interaction.customId === 'bj_stand') {
    await resolveGame(interaction, game);
    return true;
  }

  return true;
}

module.exports = { startBlackjack, handleBlackjackButton };
