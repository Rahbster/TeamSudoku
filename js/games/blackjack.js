//==============================
// Black Jack Game Logic
//==============================

import { dom, appState } from '../scripts.js';
import { showToast } from '../ui.js';

const SUITS = ['♥', '♦', '♣', '♠'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function initialize() {
    console.log("Black Jack Initialized");
    dom.numberPad.classList.add('hidden');
    dom.sudokuGridArea.classList.add('hidden');
    dom.pencilButton.classList.add('hidden');
    dom.blackjackArea.classList.remove('hidden');
    document.body.classList.add('blackjack-active');
    document.getElementById('player-balance').textContent = `Tokens: ${appState.soloGameState?.balance || 100}`;
    renderBettingControls();

    // Ensure the main "New Game" button is correctly wired up for Black Jack.
    dom.newPuzzleButton.onclick = loadPuzzle;
}

export function cleanup() {
    console.log("Black Jack Cleanup");
    dom.blackjackArea.classList.add('hidden');
    document.body.classList.remove('blackjack-active');
}

export function createGrid() {
    // This game doesn't use the main grid, it uses its own UI area.
    // The UI is built by the render functions.
}

export function getInitialState() {
    return {
        deck: [],
        playerHands: [{ cards: [], bet: 0, score: 0, isStanding: false, isBusted: false }],
        activeHandIndex: 0,
        dealerHand: [],
        dealerScore: 0,
        balance: appState.soloGameState?.balance || 100, // Persist balance between games
        gameOver: true,
        deckCount: parseInt(dom.deckCountSelect.value, 10) || 1,
    };
}

export function loadPuzzle() {
    // In Black Jack, "New Game" starts a new hand.
    if (appState.soloGameState.playerHands[0].bet > 0) {
        startHand();
    } else {
        showToast("Place a bet to start a new hand!", "error");
    }
}

function createDeck() {
    const deck = [];
    for (let i = 0; i < appState.soloGameState.deckCount; i++) {
        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ suit, value });
            }
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function getCardValue(card) {
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    if (card.value === 'A') return 11;
    return parseInt(card.value, 10);
}

function calculateHandValue(hand) {
    let value = hand.reduce((sum, card) => sum + getCardValue(card), 0);
    let aceCount = hand.filter(card => card.value === 'A').length;
    while (value > 21 && aceCount > 0) {
        value -= 10;
        aceCount--;
    }
    return value;
}

function renderHands() {
    const gameState = appState.soloGameState;
    const playerHandArea = dom.playerHand;
    playerHandArea.innerHTML = ''; // Clear previous hands

    // Render Player Hands
    gameState.playerHands.forEach((hand, index) => {
        const handContainer = document.createElement('div');
        handContainer.className = 'hand-display';
        if (index === gameState.activeHandIndex && !gameState.gameOver) {
            handContainer.classList.add('active-hand');
        }

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'cards';
        hand.cards.forEach(card => cardsContainer.appendChild(createCardElement(card)));

        const scoreElement = document.createElement('h3');
        scoreElement.id = `player-score-${index}`;
        scoreElement.textContent = calculateHandValue(hand.cards);

        handContainer.appendChild(scoreElement);
        handContainer.appendChild(cardsContainer);
        playerHandArea.appendChild(handContainer);
    });

    // Render Dealer Hand
    renderDealerHand(gameState.gameOver ? false : true);
}

function renderBettingControls() {
    const bettingArea = dom.bettingControls;
    bettingArea.innerHTML = `
        <button class="theme-button" data-bet="1">Bet 1</button>
        <button class="theme-button" data-bet="5">Bet 5</button>
        <button class="theme-button" data-bet="10">Bet 10</button>
    `;
    bettingArea.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => placeBet(parseInt(btn.dataset.bet, 10));
    });
    dom.blackjackActions.innerHTML = `<button id="start-hand-btn" class="theme-button">Deal</button>`;
    document.getElementById('start-hand-btn').onclick = loadPuzzle;
}

function createCardElement(card, hide = false) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'playing-card';
    if (hide) {
        cardDiv.classList.add('back');
    } else {
        const color = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
        cardDiv.classList.add(color);
        cardDiv.innerHTML = `
            <div class="value top">${card.value}</div>
            <div class="suit">${card.suit}</div>
            <div class="value bottom">${card.value}</div>
        `;
    }
    return cardDiv;
}

/**
 * Determines the correct basic strategy move for Black Jack.
 * @param {Array} playerHand - The player's current hand.
 * @param {Object} dealerUpCard - The dealer's visible card.
 * @returns {'hit' | 'stand' | 'split'} The recommended move.
 */
function getBasicStrategyMove(playerHand, dealerUpCard) {
    const playerScore = calculateHandValue(playerHand);
    const dealerValue = getCardValue(dealerUpCard);
    const card1Value = getCardValue(playerHand[0]);
    const card2Value = getCardValue(playerHand[1]);

    // Basic Split logic
    if (playerHand.length === 2 && card1Value === card2Value) {
        if (card1Value === 8 || card1Value === 11) return 'split'; // Always split Aces and 8s
        if (card1Value === 9 && ![7, 10, 11].includes(dealerValue)) return 'split';
        if (card1Value === 7 && dealerValue <= 7) return 'split';
        if (card1Value === 6 && dealerValue <= 6) return 'split';
        if (card1Value === 4 && [5, 6].includes(dealerValue)) return 'split';
        if ((card1Value === 2 || card1Value === 3) && dealerValue <= 7) return 'split';
    }

    // Check if the player's hand is "soft" (contains an Ace counted as 11)
    const isSoft = playerHand.some(card => card.value === 'A') && playerScore !== calculateHandValue(playerHand.map(card => card.value === 'A' ? { ...card, value: '1' } : card));

    if (isSoft) {
        if (playerScore >= 19) {
            return 'stand'; // Soft 19, 20, 21 always stand
        }
        if (playerScore === 18) {
            // Stand on dealer 2-8, otherwise hit
            return (dealerValue >= 2 && dealerValue <= 8) ? 'stand' : 'hit';
        }
        // Soft 17 or less should always be hit
        return 'hit';
    } else {
        // Hard totals
        if (playerScore >= 17) {
            return 'stand';
        }
        if (playerScore <= 11) {
            return 'hit';
        }
        if (playerScore === 12) {
            // Stand on dealer 4-6, otherwise hit
            return (dealerValue >= 4 && dealerValue <= 6) ? 'stand' : 'hit';
        }
        if (playerScore >= 13 && playerScore <= 16) {
            // Stand on dealer 2-6, otherwise hit
            return (dealerValue >= 2 && dealerValue <= 6) ? 'stand' : 'hit';
        }
    }

    // Fallback, should not be reached with the logic above
    return 'hit';
}

/**
 * Checks the player's move against basic strategy and shows a toast if incorrect.
 * @param {'hit' | 'stand'} playerMove - The move the player chose.
 */
function checkPlayerMove(playerMove) {
    const { playerHands, activeHandIndex, dealerHand } = appState.soloGameState;
    const activeHand = playerHands[activeHandIndex];
    const correctMove = getBasicStrategyMove(activeHand.cards, dealerHand[1]); // dealerHand[1] is the up-card
    if (playerMove !== correctMove) {
        showToast(`Strategy Tip: The better move was to ${correctMove.toUpperCase()}.`, 'info');
    }
}

function placeBet(amount) {
    const gameState = appState.soloGameState;
    if (amount > gameState.balance) {
        showToast("Not enough tokens!", "error");
        return;
    }
    // Bets are placed on the first hand initially
    gameState.playerHands[0].bet += amount;
    gameState.balance -= amount;
    document.getElementById('player-balance').textContent = `Tokens: ${gameState.balance} | Bet: ${gameState.playerHands[0].bet}`;
}

function startHand() {
    const gameState = appState.soloGameState;
    gameState.gameOver = false;
    gameState.activeHandIndex = 0;
    // Reset hands, keeping the bet from the first hand
    const currentBet = gameState.playerHands[0].bet;
    gameState.playerHands = [{ cards: [], bet: currentBet, score: 0, isStanding: false, isBusted: false }];

    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    gameState.playerHands[0].cards.push(gameState.deck.pop(), gameState.deck.pop());
    gameState.dealerHand = [gameState.deck.pop(), gameState.deck.pop()];

    renderHands();
    renderActionButtons();

    if (calculateHandValue(gameState.playerHands[0].cards) === 21) {
        stand(); // Automatic stand on Blackjack
    }
}

function renderDealerHand(hideFirstCard) {
    const { dealerHand } = appState.soloGameState;
    const dealerCardsContainer = dom.dealerHand.querySelector('.cards');
    const dealerScoreElement = document.getElementById('dealer-score');

    dealerCardsContainer.innerHTML = '';
    dealerHand.forEach((card, index) => {
        dealerCardsContainer.appendChild(createCardElement(card, index === 0 && hideFirstCard));
    });
    dealerScoreElement.textContent = hideFirstCard ? '?' : calculateHandValue(dealerHand);
}

function renderActionButtons() {
    const gameState = appState.soloGameState;
    const activeHand = gameState.playerHands[gameState.activeHandIndex];
    const canSplit = activeHand.cards.length === 2 && // Must be the first two cards
                     activeHand.cards[0].value === activeHand.cards[1].value && // Cards must have the same rank (e.g., two 'K's)
                     gameState.balance >= activeHand.bet;

    dom.bettingControls.innerHTML = ''; // Clear betting buttons
    dom.blackjackActions.innerHTML = `
        <button id="hit-btn" class="theme-button">Hit</button>
        <button id="stand-btn" class="theme-button">Stand</button>
        ${canSplit ? '<button id="split-btn" class="theme-button">Split</button>' : ''}
    `;
    document.getElementById('hit-btn').onclick = hit;
    document.getElementById('stand-btn').onclick = stand;
    if (canSplit) {
        document.getElementById('split-btn').onclick = split;
    }
}

function hit() {
    const gameState = appState.soloGameState;
    if (gameState.gameOver) return;

    const activeHand = gameState.playerHands[gameState.activeHandIndex];
    checkPlayerMove('hit');

    activeHand.cards.push(gameState.deck.pop());
    renderHands();

    if (calculateHandValue(activeHand.cards) > 21) {
        activeHand.isBusted = true;
        showToast("Bust!", "error");
        moveToNextHandOrEnd();
    }
}

function stand() {
    const gameState = appState.soloGameState;
    if (gameState.gameOver) return;
    checkPlayerMove('stand');

    gameState.playerHands[gameState.activeHandIndex].isStanding = true;
    moveToNextHandOrEnd();
}

function split() {
    const gameState = appState.soloGameState;
    if (gameState.gameOver) return;

    const handToSplit = gameState.playerHands[gameState.activeHandIndex];
    
    // Deduct bet for the new hand
    gameState.balance -= handToSplit.bet;
    document.getElementById('player-balance').textContent = `Tokens: ${gameState.balance}`;

    // Create two new hands from the split
    const hand1 = { ...handToSplit, cards: [handToSplit.cards[0], gameState.deck.pop()] };
    const hand2 = { ...handToSplit, cards: [handToSplit.cards[1], gameState.deck.pop()] };

    // Replace the original hand with the two new hands
    gameState.playerHands.splice(gameState.activeHandIndex, 1, hand1, hand2);

    renderHands();
    renderActionButtons();
}

function moveToNextHandOrEnd() {
    const gameState = appState.soloGameState;
    const nextHandIndex = gameState.activeHandIndex + 1;

    if (nextHandIndex < gameState.playerHands.length) {
        gameState.activeHandIndex = nextHandIndex;
        renderHands();
        renderActionButtons();
    } else {
        playDealerTurn();
    }
}

function playDealerTurn() {
    const gameState = appState.soloGameState;
    gameState.gameOver = true;
    renderHands(); // Re-render to show dealer's card and remove active hand highlight

    const dealerPlay = setInterval(() => {
        // Dealer hits if they have less than 17
        let dealerScore = calculateHandValue(gameState.dealerHand);
        if (dealerScore < 17) {
            gameState.dealerHand.push(gameState.deck.pop());
            renderDealerHand(false);
        } else {
            clearInterval(dealerPlay);
            endHand();
        }
    }, 1000);
}

function endHand() {
    const gameState = appState.soloGameState;
    const dealerScore = calculateHandValue(gameState.dealerHand);
    let totalWinnings = 0;

    gameState.playerHands.forEach((hand, index) => {
        const playerScore = calculateHandValue(hand.cards);
        let message = `Hand ${index + 1}: `;

        if (playerScore > 21) {
            message += "Bust! You lose.";
        } else if (playerScore === 21 && hand.cards.length === 2 && gameState.playerHands.length === 1) {
            message += "Blackjack! You win!";
            gameState.balance += hand.bet * 2.5; // 3:2 payout
        } else if (dealerScore > 21) {
            message += "Dealer busts! You win!";
            gameState.balance += hand.bet * 2;
        } else if (playerScore > dealerScore) {
            message += "You win!";
            gameState.balance += hand.bet * 2;
        } else if (dealerScore > playerScore) {
            message += "Dealer wins.";
        } else {
            message += "Push (Tie).";
            gameState.balance += hand.bet;
        }
        showToast(message);
        hand.bet = 0; // Clear bet for this hand
    });

    gameState.playerHands[0].bet = 0; // Ensure main bet is cleared

    setTimeout(() => {
        document.getElementById('player-balance').textContent = `Tokens: ${gameState.balance}`;
        renderBettingControls();
        // Clear hands for next round
        dom.playerHand.innerHTML = '';
        dom.dealerHand.querySelector('.cards').innerHTML = ''; // Clear dealer cards
        document.getElementById('dealer-score').textContent = ''; // Clear dealer score
    }, 2000);
}

// Team-based functions (placeholders)
export function processMove(moveData) {}
export function processUIUpdate(data) {}