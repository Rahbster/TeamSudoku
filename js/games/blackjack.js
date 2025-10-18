//==============================
// Black Jack Game Logic
//==============================

import { dom, appState } from '../scripts.js';
import { showToast, createTimerHTML } from '../ui.js';
import { startTimer, stopTimer } from '../timer.js';

const SUITS = ['♥', '♦', '♣', '♠'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const AI_PERSONALITIES = [
    { name: 'Cautious Carl', riskProfile: 'conservative' },
    { name: 'Standard Stan', riskProfile: 'standard' },
    { name: 'All-in Annie', riskProfile: 'aggressive' },
    { name: 'Betting Betty', riskProfile: 'standard' },
    { name: 'Risk-it Rick', riskProfile: 'aggressive' },
    { name: 'Steady Steve', riskProfile: 'conservative' }
];

let aiTurnTimeout = null; // To manage AI turn delays

function getShuffledAiPersonalities() {
    return [...AI_PERSONALITIES].sort(() => 0.5 - Math.random());
}

export function initialize() {
    document.body.classList.add('blackjack-active');
    loadPuzzle();
}

export function cleanup() {
    stopTimer(); // Stop the session timer
    clearTimeout(aiTurnTimeout); // Clear any pending AI turn
    document.body.classList.remove('blackjack-active');
}

/**
 * Creates a new, empty hand object.
 * @returns {{cards: Array, bet: number, isStanding: boolean, isBusted: boolean, result: null}}
 */
function createHand() {
    return {
        cards: [],
        bet: 0,
        isStanding: false,
        isBusted: false,
        result: null
    };
}

export function createGrid() {
    // Create the necessary HTML structure within the generic game board area.
    dom.gameBoardArea.innerHTML = `
        <div id="blackjack-area" class="blackjack-table">
            <div id="blackjack-top-area">
                <div id="blackjack-controls-container">
                    <div class="blackjack-info-bar">
                        ${createTimerHTML()}
                    </div>
                    <div id="blackjack-actions" class="player-actions"></div>
                    <div id="betting-controls"></div>
                </div>
                <div id="dealer-hand" class="hand-area">
                    <h3>Dealer: <span id="dealer-score"></span></h3>
                    <div class="cards"></div>
                </div>
            </div>
            <div id="player-area-container">
                <!-- Player boxes will be rendered here -->
            </div>
        </div>
    `;

    // Cache elements
    dom.dealerHand = document.getElementById('dealer-hand');
    dom.blackjackActions = document.getElementById('blackjack-actions');
    dom.bettingControls = document.getElementById('betting-controls');
    dom.playerAreaContainer = document.getElementById('player-area-container');

    // Initial render based on game state
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (gameState) {
        renderHands();
        renderBettingControls();
    }
}

export function getInitialState() {
    const isSoloGame = !appState.playerTeam;
    const players = {};

    // Add the human player for both solo and multiplayer
    players[appState.playerId] = {
        name: appState.playerId,
        balance: 100, // Starting balance
        isReady: false, // For multiplayer "deal" state
        hands: [createHand()],
        activeHandIndex: 0
    };

    // If it's a solo game, add AI players
    if (isSoloGame) {
        const aiCount = parseInt(dom.aiPlayerCountSelect.value, 10) || 0;
        const aiPersonalities = getShuffledAiPersonalities();
        for (let i = 0; i < aiCount; i++) {
            const aiId = `AI-${i + 1}`;
            const personality = aiPersonalities[i];
            players[aiId] = { name: personality.name, riskProfile: personality.riskProfile, balance: 100, hands: [createHand()], activeHandIndex: 0, isAI: true, isReady: false };
        }
    }

    return {
        deck: [],
        players: players,
        dealerHand: [],
        dealerScore: 0,
        gameOver: true,
        deckCount: parseInt(dom.deckCountSelect.value, 10) || 1,
        dealerIsPlaying: false, // New state to track dealer's turn
        turnPlayerId: null, // Whose turn is it to act
    };
}

export function loadPuzzle() {
    // For multiplayer, the host initializes the state.
    if (appState.playerTeam && appState.isInitiator) {
        const team = appState.teams[appState.playerTeam];
        team.gameState = getInitialState();
        // The host will add players as they join.
    } else if (!appState.playerTeam) { // For solo play
        appState.soloGameState = getInitialState();
    }
    createGrid(); // This will render based on the new state
    startTimer(); // Start timer for the session
    renderBettingControls(); // Render initial betting controls on load
}

function createDeck(deckCount = 1) {
    const deck = [];
    for (let i = 0; i < deckCount; i++) {
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
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    const playerAreaContainer = dom.playerAreaContainer;
    playerAreaContainer.innerHTML = ''; // Clear all player boxes

    // Sort players to show the current client first, then others.
    const playerIds = Object.keys(gameState.players);
    playerIds.sort((a, b) => {
        if (a === appState.playerId) return -1;
        if (b === appState.playerId) return 1;
        return a.localeCompare(b);
    });

    for (const playerId of playerIds) {
        const player = gameState.players[playerId];
        const playerBox = document.createElement('div');
        playerBox.className = 'player-box';
        playerBox.id = `player-box-${playerId}`;
        if (playerId === gameState.turnPlayerId) {
            playerBox.classList.add('active-turn');
        }

        let handsHTML = '';
        player.hands.forEach((hand, index) => {
            const cardsHTML = hand.cards.map(card => createCardElement(card).outerHTML).join('');
            const handScore = calculateHandValue(hand.cards);
            const handIsActive = playerId === gameState.turnPlayerId && index === player.activeHandIndex && !gameState.gameOver;
            const betOrResultText = hand.result ? hand.result : `Bet: ${hand.bet}`;

            handsHTML += `
                <div class="hand-display ${handIsActive ? 'active-hand' : ''}">
                    <h3>Score: ${handScore} | ${betOrResultText}</h3>
                    <div class="cards">${cardsHTML}</div>
                </div>
            `;
        });

        playerBox.innerHTML = `
            <h4>${player.name}</h4>
            <div class="player-info">Tokens: ${player.balance}</div>
            <div class="player-hands-container">${handsHTML}</div>
        `;
        playerAreaContainer.appendChild(playerBox);
    }

    // Render Dealer Hand
    renderDealerHand(gameState.gameOver ? false : true);
}

function renderBettingControls() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    const me = gameState.players[appState.playerId];

    // Do not show betting controls if the round is over but the player hasn't cleared their cards yet.
    if (gameState.gameOver && me && me.hands.some(h => h.cards.length > 0)) {
        dom.bettingControls.innerHTML = '';
        return;
    }
    
    const bettingArea = dom.bettingControls;
    bettingArea.innerHTML = `
        <button class="theme-button" data-bet="1">Bet 1</button>
        <button class="theme-button" data-bet="5">Bet 5</button>
        <button class="theme-button" data-bet="10">Bet 10</button>
        <button id="reset-bet-btn" class="theme-button">Reset</button>
    `;
    bettingArea.querySelectorAll('button[data-bet]').forEach(btn => {
        btn.onclick = () => placeBet(parseInt(btn.dataset.bet, 10));
    });
    const resetBtn = document.getElementById('reset-bet-btn');
    if (resetBtn) resetBtn.onclick = resetBet;

    // Check if a bet has been placed to decide whether to show the "Deal" button.
    const hasBet = me && me.hands.some(h => h.bet > 0);    
    // Always show the Deal button, but disable it if no bet has been placed.
    dom.blackjackActions.innerHTML = `<button id="start-hand-btn" class="theme-button" ${!hasBet ? 'disabled' : ''}>Deal</button>`;
    const dealBtn = document.getElementById('start-hand-btn');
    if (dealBtn) dealBtn.onclick = startHand;
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
    const move = {
        type: 'move',
        game: 'blackjack',
        action: 'bet',
        amount: amount,
        playerId: appState.playerId
    };

    if (appState.playerTeam) {
        if (appState.isInitiator) {
            processMove(move);
        } else {
            dataChannels[0]?.send(JSON.stringify(move));
        }
    } else { // Solo play
        processMove(move);
    }
}

function resetBet() {
    const move = {
        type: 'move',
        game: 'blackjack',
        action: 'reset-bet',
        playerId: appState.playerId
    };

    if (appState.playerTeam) {
        if (appState.isInitiator) {
            processMove(move);
        } else {
            dataChannels[0]?.send(JSON.stringify(move));
        }
    } else { // Solo play
        processMove(move);
    }
}

function startHand() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    gameState.gameOver = false;

    gameState.deck = createDeck(gameState.deckCount);
    shuffleDeck(gameState.deck);

    // AI places bets in solo mode
    if (!appState.playerTeam) {
        aiPlaceBets(gameState);
    }

    // Reset hands for all players, keeping their bets
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];

        // Reset ready status for the new round
        player.isReady = false;

        const currentBet = player.hands[0]?.bet || 0;
        if (currentBet === 0) {
            showToast(`${player.name} has not placed a bet.`, 'info');
            // In a real game, you might remove them from the round. For now, we'll let them sit out.
            player.hands = [];
            continue;
        } // Reset hand but keep the bet
        player.hands = [{ ...createHand(), bet: currentBet }];
        player.activeHandIndex = 0;
    }

    // Deal initial cards
    for (let i = 0; i < 2; i++) {
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            if (player.hands.length > 0) {
                player.hands[0].cards.push(gameState.deck.pop());
            }
        }
    }

    // After dealing, check for any natural Blackjacks and auto-stand those players.
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (player.hands.length > 0 && calculateHandValue(player.hands[0].cards) === 21) {
            player.hands[0].isStanding = true;
            showToast(`${player.name} has Blackjack!`, 'info');
        }
    }

    gameState.dealerHand = [gameState.deck.pop(), gameState.deck.pop()];

    // Set turn to the first player with a hand
    const firstPlayerId = Object.keys(gameState.players).find(pid => gameState.players[pid].hands.length > 0);
    gameState.turnPlayerId = firstPlayerId;

    renderHands();
    renderActionButtons();

    // Update UI for everyone
    if (appState.playerTeam && appState.isInitiator) {
        const update = { type: 'move-update', game: 'blackjack', gameState: gameState };
        processUIUpdate(update); // Host updates self
        dataChannels.forEach(dc => dc.send(JSON.stringify(update))); // Host broadcasts
    }
}

function renderDealerHand(hideFirstCard) {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    const { dealerHand } = gameState;
    const dealerCardsContainer = dom.dealerHand.querySelector('.cards');
    const dealerScoreElement = document.getElementById('dealer-score');

    // If all human players have cleared their cards, do not render the dealer's hand,
    // even if the data for the next hand already exists.
    const allHumansCleared = Object.values(gameState.players).filter(p => !p.isAI).every(p => p.hands.every(h => h.cards.length === 0));
    if (gameState.gameOver && allHumansCleared) {
        dealerCardsContainer.innerHTML = '';
        return;
    }

    dealerCardsContainer.innerHTML = '';
    dealerHand.forEach((card, index) => {
        dealerCardsContainer.appendChild(createCardElement(card, index === 0 && hideFirstCard));
    });

    const dealerScore = calculateHandValue(dealerHand);
    if (dealerScore > 21) {
        dealerScoreElement.textContent = 'Bust!';
    } else {
        dealerScoreElement.textContent = hideFirstCard ? '?' : dealerScore;
    }
}

function renderActionButtons() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (gameState.gameOver || gameState.turnPlayerId !== appState.playerId || gameState.dealerIsPlaying) {
        dom.blackjackActions.innerHTML = ''; // Not my turn, no actions
        // If the game is over and it's not our turn, check if we need to show the "Clear Cards" button
        if (gameState.gameOver) {
            const me = gameState.players[appState.playerId];
            // Show clear button if the player has cards on the table
            if (me && me.hands.some(h => h.cards.length > 0)) {
                dom.blackjackActions.innerHTML = `<button id="clear-cards-btn" class="theme-button">Clear Cards</button>`;
                document.getElementById('clear-cards-btn').onclick = clearPlayerCards;
            }
        }
        return;
    }

    const me = gameState.players[appState.playerId];
    const activeHand = me.hands[me.activeHandIndex];
    const canSplit = activeHand.cards.length === 2 && activeHand.cards[0].value === activeHand.cards[1].value && me.balance >= activeHand.bet;

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

function clearPlayerCards() {
    const move = { type: 'move', game: 'blackjack', action: 'clear-cards', playerId: appState.playerId };
    if (appState.playerTeam) {
        if (appState.isInitiator) {
            processMove(move);
        } else {
            // In multiplayer, non-hosts send their action to the host
            dataChannels[0]?.send(JSON.stringify(move));
        }
    } else { // Solo play
        processMove(move);
    }
}


function hit() {
    if (appState.soloGameState?.turnPlayerId?.startsWith('AI-')) return; // Prevent player from hitting for AI
    const move = { type: 'move', game: 'blackjack', action: 'hit', playerId: appState.playerId };
    if (appState.playerTeam) {
        if (appState.isInitiator) {
            processMove(move);
        } else {
            dataChannels[0]?.send(JSON.stringify(move));
        }
    } else { // Solo play
        processMove(move);
    }
}

function performHit(playerId) {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    const player = gameState.players[playerId];
    if (!player) return;
    const activeHand = player.hands[player.activeHandIndex];
    
    activeHand.cards.push(gameState.deck.pop());
    renderHands();

    const newScore = calculateHandValue(activeHand.cards);
    if (newScore > 21) {
        activeHand.isBusted = true;
        showToast("Bust!", "error");
        moveToNextHandOrEnd();
    } else if (newScore === 21) {
        // Automatically stand if the player hits to 21.
        performStand(playerId);
    }
}

function stand() {
    if (appState.soloGameState?.turnPlayerId?.startsWith('AI-')) return; // Prevent player from standing for AI
    const move = { type: 'move', game: 'blackjack', action: 'stand', playerId: appState.playerId };
    if (appState.playerTeam) {
        if (appState.isInitiator) {
            processMove(move);
        } else {
            dataChannels[0]?.send(JSON.stringify(move));
        }
    } else { // Solo play
        processMove(move);
    }
}

function performStand(playerId) {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    gameState.players[playerId].hands[gameState.players[playerId].activeHandIndex].isStanding = true;
    moveToNextHandOrEnd();
}

function split() {
    // This is more complex in multiplayer and will be implemented later.
    showToast("Split not yet available in multiplayer.", "info");
    /*
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

    // After a split, if the first new hand is 21, automatically stand.
    if (calculateHandValue(gameState.playerHands[gameState.activeHandIndex].cards) === 21) {
        stand();
    }
    */
}

function moveToNextHandOrEnd() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    if (!gameState.turnPlayerId) return; // Game is over or dealer is playing
    const currentPlayer = gameState.players[gameState.turnPlayerId];
    const nextHandIndex = currentPlayer.activeHandIndex + 1;

    if (nextHandIndex < currentPlayer.hands.length) {
        // Move to the player's next hand (from a split)
        currentPlayer.activeHandIndex = nextHandIndex;
    } else {
        // Move to the next player
        const playerIds = Object.keys(gameState.players);
        const currentPlayerIndex = playerIds.indexOf(gameState.turnPlayerId);
        const nextPlayerIndex = currentPlayerIndex + 1;

        if (nextPlayerIndex < playerIds.length) {
            const nextPlayerId = playerIds[nextPlayerIndex];
            gameState.turnPlayerId = nextPlayerId;
            if (gameState.players[nextPlayerId].isAI) {
                aiPlayTurn(nextPlayerId);
            }
        } else {
            // All players have acted, play dealer's turn
            gameState.turnPlayerId = null; // No player's turn
            playDealerTurn();
        }
    }

    // Update UI after move
    if (appState.isInitiator || !appState.playerTeam) {
        renderHands();
        renderActionButtons();
    }
}

function playDealerTurn() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    gameState.gameOver = true;
    gameState.dealerIsPlaying = true; // Mark that the dealer's turn has started
    renderHands(); // Re-render to show dealer's card and remove active hand highlight

    const dealerPlay = setInterval(() => {
        // Dealer hits if they have less than 17
        let dealerScore = calculateHandValue(gameState.dealerHand);
        if (dealerScore < 17) {
            gameState.dealerHand.push(gameState.deck.pop());
            renderDealerHand(false);
        } else {
            clearInterval(dealerPlay);
            gameState.dealerIsPlaying = false; // Mark that the dealer's turn is over
            endHand();
        }
    }, 1000);
}

function endHand() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam].gameState : appState.soloGameState;
    const dealerScore = calculateHandValue(gameState.dealerHand);

    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        player.hands.forEach((hand, index) => {
            const playerScore = calculateHandValue(hand.cards);
            const bet = hand.bet;

            if (playerScore > 21) {
                hand.result = `Bust! Lost ${bet}`;
                // Bet is already lost
            } else if (playerScore === 21 && hand.cards.length === 2 && player.hands.length === 1) {
                const winnings = Math.floor(bet * 1.5);
                hand.result = `Win ${winnings} Blackjack!`;
                player.balance += bet + winnings; // Return original bet + winnings
            } else if (dealerScore > 21) {
                hand.result = `Win ${bet} (Dealer Busts!)`;
                player.balance += bet * 2;
            } else if (playerScore > dealerScore) {
                hand.result = `Win ${bet}`;
                player.balance += bet * 2;
            } else if (dealerScore > playerScore) {
                hand.result = `Lost ${bet}`;
            } else {
                hand.result = "Push";
                player.balance += bet; // Return original bet
            }
            // The bet is not cleared here anymore, it's part of the result message.
            // It will be cleared when the player clicks "Clear Cards".
        });
        // Automatically reset hands only for AI players. Human players will use the "Clear Cards" button.
        // AI hands are no longer cleared here. They are cleared when the human player clears their own cards.
    }

    setTimeout(() => { //NOSONAR
        if (appState.playerTeam && appState.isInitiator) {
            const update = { type: 'move-update', game: 'blackjack', gameState: gameState, newRound: true };
            processUIUpdate(update); // Host updates self
            dataChannels.forEach(dc => dc.send(JSON.stringify(update))); // Host broadcasts
            renderHands(); // Host also needs to see the results
        } else if (!appState.playerTeam) {
            // At the end of a hand, only show the "Clear Cards" button.
            renderHands(); // Re-render hands to show win/loss results
            renderActionButtons();
        }
    }, 2000);
}

// Team-based functions (placeholders)
export function processMove(moveData) {
    if (moveData.game !== 'blackjack') return;

    // Handle solo play directly
    if (!appState.playerTeam) {
        processSoloMove(moveData);
        return;
    }

    // --- Multiplayer Logic ---
    if (!appState.isInitiator) return; // Only host processes multiplayer moves

    const gameState = appState.teams[appState.playerTeam].gameState;
    const playerId = moveData.playerId;
    const player = gameState.players[playerId];

    switch (moveData.action) {
        case 'reset-bet':
             if (gameState.gameOver && player) {
                // This action is now handled by processSoloMove for both modes
            }
            break;
        case 'bet':
            if (gameState.gameOver) {
                if (moveData.amount <= player.balance) {
                    player.hands[0].bet += moveData.amount;
                    player.balance -= moveData.amount;
                } else {
                    // Maybe send a toast back to the player? For now, just log.
                    console.log(`${playerId} has insufficient funds.`);
                }
            }
            break;
        case 'ready':
            if (gameState.gameOver && player) {
                player.isReady = true;
                // Check if all human players are ready
                const allHumanPlayers = Object.values(gameState.players).filter(p => !p.isAI);
                const allReady = allHumanPlayers.every(p => p.isReady);

                if (allReady) {
                    startHand(); // This will handle its own broadcast
                    return; // Exit early to prevent double broadcast
                } else {
                    // Not everyone is ready, just broadcast the updated player state
                    showWaitingMessage(gameState); // Update host's waiting message
                }
            }
            break;
        case 'hit':
            if (!gameState.gameOver && gameState.turnPlayerId === playerId) {
                performHit(playerId);
            }
            break;
        case 'stand':
            if (!gameState.gameOver && gameState.turnPlayerId === playerId) {
                performStand(playerId);
            }
            break;
        case 'clear-cards':
            if (gameState.gameOver && player) {
                // Reset this player's hand
                player.hands = [createHand()];
            }
            break;
    }

    // Broadcast the updated state after the move
    const update = { type: 'move-update', game: 'blackjack', gameState: gameState };
    processUIUpdate(update); // Host updates self
    dataChannels.forEach(dc => dc.send(JSON.stringify(update)));
}

function processSoloMove(moveData) {
    const gameState = appState.soloGameState;
    const playerId = moveData.playerId;
    const player = gameState.players[playerId];

    switch (moveData.action) {
        case 'bet':
            if (gameState.gameOver) {
                // Now process the bet
                if (moveData.amount <= player.balance) {
                    player.hands[0].bet += moveData.amount;
                    player.balance -= moveData.amount;
                    // Update UI immediately for solo play
                    renderHands();
                    renderBettingControls(); // Re-render controls to show the "Deal" button
                } else {
                    showToast("Not enough tokens!", "error");
                }
            }
            break;
        case 'reset-bet':
            if (gameState.gameOver && player) {
                const betAmount = player.hands[0]?.bet || 0;
                player.balance += betAmount;
                player.hands[0].bet = 0;
                renderHands(); // Update UI immediately
                    renderBettingControls(); // Re-check if Deal button should be shown/hidden
            }
            break;
        case 'deal':
            // This action is now handled by the "Deal" button's onclick event,
            // which calls startHand() directly. This case is no longer needed.
            break;
        case 'hit':
            if (!gameState.gameOver && gameState.turnPlayerId === playerId) {
                performHit(playerId);
            }
            break;
        case 'stand':
            if (!gameState.gameOver && gameState.turnPlayerId === playerId) {
                performStand(playerId);
            }
            break;
        case 'clear-cards':
            if (gameState.gameOver && player) {
                // Reset this player's hand
                player.hands = [createHand()];

                // Clear the dealer's hand visually if all human players have cleared their cards
                const allHumansCleared = Object.values(gameState.players).filter(p => !p.isAI).every(p => p.hands.every(h => h.cards.length === 0));
                
                if (allHumansCleared) {
                    // When the last human clears their cards, also clear the AI players' hands from the data state.
                    for (const pId in gameState.players) {
                        const p = gameState.players[pId];
                        if (p.isAI) {
                            p.hands = [createHand()];
                        }
                    }
                    dom.dealerHand.querySelector('.cards').innerHTML = '';
                    document.getElementById('dealer-score').textContent = '';
                }
                renderHands();
                renderActionButtons(); // This will hide the "Clear Cards" button
                renderBettingControls(); // This will render bet chips and the disabled Deal button
            }
            break;
    }
}

export function processUIUpdate(data) {
    if (data.game !== 'blackjack') return;
    const teamName = appState.playerTeam;
    if (!teamName) { // Handle solo play update
        appState.soloGameState = data.gameState;
    } else { // Handle team play update
        appState.teams[teamName].gameState = data.gameState;
    }

    if (data.newRound) {
        // It's a new round, reset UI for betting
        renderHands();
        renderBettingControls(); // This will re-enable the deal button

        // Clear dealer cards if they haven't been already
        const gameState = appState.teams[teamName].gameState;
        const allHumansCleared = Object.values(gameState.players).filter(p => !p.isAI).every(p => p.hands.every(h => h.cards.length === 0));

        if (allHumansCleared) {
            dom.dealerHand.querySelector('.cards').innerHTML = '';
            document.getElementById('dealer-score').textContent = '';
        }
    } else {
        // It's a mid-round update
        renderHands();
        renderActionButtons();
    }

    // If it's a multiplayer game and the hand is over, show waiting message
    if (appState.playerTeam && appState.teams[teamName].gameState.gameOver) {
        showWaitingMessage(appState.teams[teamName].gameState);
    }

    // Scroll to the current player's box
    const myPlayerBox = document.getElementById(`player-box-${appState.playerId}`);
    if (myPlayerBox) {
        myPlayerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function aiPlaceBets(gameState) {
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (player.isAI) {
            let betAmount = 5; // Standard bet
            if (player.riskProfile === 'conservative') {
                betAmount = Math.max(1, Math.floor(player.balance * 0.05)); // Bet 5% of balance, min 1
            } else if (player.riskProfile === 'aggressive') {
                betAmount = Math.max(1, Math.floor(player.balance * 0.20)); // Bet 20% of balance, min 1
            } else { // standard
                betAmount = Math.max(1, Math.floor(player.balance * 0.10)); // Bet 10% of balance, min 1
            }
            betAmount = Math.min(betAmount, player.balance); // Can't bet more than they have

            player.hands[0].bet = betAmount;
            player.balance -= betAmount;
        }
    }
}

function aiPlayTurn(aiPlayerId) {
    const gameState = appState.soloGameState;
    const aiPlayer = gameState.players[aiPlayerId];
    const activeHand = aiPlayer.hands[aiPlayer.activeHandIndex];

    // AI makes a decision based on basic strategy
    const dealerUpCard = gameState.dealerHand[1]; // The visible card
    const move = getBasicStrategyMove(activeHand.cards, dealerUpCard);

    // Add a short delay to simulate thinking
    aiTurnTimeout = setTimeout(() => {
        showToast(`${aiPlayer.name} decides to ${move.toUpperCase()}.`, 'info');

        if (move === 'hit') {
            performHit(aiPlayerId);
            // If the AI didn't bust, it might need to take another turn
            if (!gameState.players[aiPlayerId].hands[aiPlayer.activeHandIndex].isBusted) {
                aiPlayTurn(aiPlayerId);
            }
        } else { // stand or split (split defaults to stand for now)
            performStand(aiPlayerId);
        }
    }, 1500); // 1.5 second delay
}

function showWaitingMessage(gameState) {
    if (!gameState.gameOver) {
        dom.bettingControls.innerHTML = ''; // Clear waiting message if game started
        return;
    }

    const waitingOn = Object.values(gameState.players)
        .filter(p => !p.isAI && !p.isReady)
        .map(p => p.name);

    if (waitingOn.length > 0) {
        dom.bettingControls.innerHTML = `<p style="color: white; font-size: 1.2rem;">Waiting on: ${waitingOn.join(', ')}</p>`;
    }
}