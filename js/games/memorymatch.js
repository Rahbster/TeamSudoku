//==============================
// Memory Match Game Logic
//==============================

import { startTimer } from '../timer.js';
import { dom, appState, dataChannels } from '../scripts.js';
import { showWinnerScreen } from '../ui.js';
import { playRemoteMoveSound } from '../misc.js';

let flippedCards = [];
let canFlip = true;

export function initialize() {
    console.log("Memory Match Initialized");
    dom.numberPad.classList.add('hidden');
    dom.pencilButton.classList.add('hidden');
    dom.sudokuGridArea.classList.remove('hidden');
}

export function cleanup() {
    console.log("Memory Match Cleanup");
    dom.sudokuGridArea.classList.add('hidden');
}

export function createGrid() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    dom.sudokuGrid.innerHTML = '';
    dom.sudokuGrid.className = 'memory-grid';
    dom.sudokuGrid.style.gridTemplateColumns = `repeat(${gameState.cols}, 1fr)`;
    dom.sudokuGrid.style.gridTemplateRows = `repeat(${gameState.rows}, 1fr)`;

    gameState.board.forEach((cardValue, index) => {
        const card = document.createElement('div');
        card.className = 'memory-card';
        card.dataset.index = index;

        card.innerHTML = `
            <div class="memory-card-inner">
                <div class="memory-card-face memory-card-back"></div>
                <div class="memory-card-face memory-card-front">${cardValue}</div>
            </div>
        `;

        card.addEventListener('click', () => handleCardClick(index));
        dom.sudokuGrid.appendChild(card);
    });
}

function handleCardClick(index) {
    if (!canFlip || appState.winner) return;

    const card = document.querySelector(`.memory-card[data-index='${index}']`);
    if (card.classList.contains('is-flipped')) return;

    // For now, we'll handle solo play directly. Team play would use processMove.
    if (appState.isInitiator && !appState.playerTeam) {
        processFlip(index);
    }
}

function processFlip(index) {
    const gameState = appState.soloGameState;
    if (gameState.flippedIndices.includes(index) || gameState.matchedPairs.flat().includes(index)) {
        return;
    }

    // Flip the card locally
    const card = document.querySelector(`.memory-card[data-index='${index}']`);
    card.classList.add('is-flipped');
    gameState.flippedIndices.push(index);

    if (gameState.flippedIndices.length === 2) {
        canFlip = false; // Prevent more flips while checking
        checkForMatch();
    }
}

function checkForMatch() {
    const gameState = appState.soloGameState;
    const [index1, index2] = gameState.flippedIndices;
    const card1Value = gameState.board[index1];
    const card2Value = gameState.board[index2];

    const card1Element = document.querySelector(`.memory-card[data-index='${index1}']`);
    const card2Element = document.querySelector(`.memory-card[data-index='${index2}']`);

    // Find which pair these values belong to
    const pair = gameState.pairs.find(p => p.includes(card1Value) && p.includes(card2Value));

    if (pair) {
        // It's a match!
        card1Element.classList.add('is-matched');
        card2Element.classList.add('is-matched');
        gameState.matchedPairs.push([index1, index2]);
        gameState.flippedIndices = [];
        canFlip = true;

        // Check for win condition
        if (gameState.matchedPairs.length === gameState.pairs.length) {
            showWinnerScreen('You');
        }
    } else {
        // Not a match, flip them back after a delay
        setTimeout(() => {
            card1Element.classList.remove('is-flipped');
            card2Element.classList.remove('is-flipped');
            gameState.flippedIndices = [];
            canFlip = true;
        }, 1500);
    }
}

export function getInitialState(difficulty, gameMode) {
    const settings = {
        'very-easy': { rows: 2, cols: 4, pairs: 4 },
        'easy': { rows: 3, cols: 4, pairs: 6 },
        'medium': { rows: 4, cols: 4, pairs: 8 },
        'hard': { rows: 4, cols: 5, pairs: 10 }
    };
    const { rows, cols, pairs: numPairs } = settings[difficulty] || settings['medium'];

    let pairs = [];
    if (gameMode === 'picture-picture') {
        const emojis = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍑', '🍍', '🥥', '🥝', '🥭'];
        for (let i = 0; i < numPairs; i++) {
            pairs.push([emojis[i], emojis[i]]);
        }
    } else if (gameMode === 'picture-word') {
        const wordPairs = [['🍎', 'APPLE'], ['🍌', 'BANANA'], ['🍇', 'GRAPES'], ['🍉', 'WATERMELON'], ['🍓', 'STRAWBERRY'], ['🍑', 'PEACH'], ['🍍', 'PINEAPPLE'], ['🥥', 'COCONUT'], ['🥝', 'KIWI'], ['🥭', 'MANGO']];
        pairs = wordPairs.slice(0, numPairs);
    } else { // math-simple
        for (let i = 0; i < numPairs; i++) {
            const a = Math.floor(Math.random() * 10) + 1;
            const b = Math.floor(Math.random() * 10) + 1;
            pairs.push([`${a} + ${b}`, a + b]);
        }
    }

    const board = pairs.flat().sort(() => 0.5 - Math.random());

    return {
        rows,
        cols,
        board,
        pairs,
        flippedIndices: [],
        matchedPairs: [],
        gameMode: gameMode || 'picture-picture',
        difficulty: difficulty || 'medium'
    };
}

export function loadPuzzle() {
    appState.winner = null;
    canFlip = true;
    startTimer();
    const difficulty = dom.difficultySelector.value;
    const gameMode = dom.memorymatchModeSelect.value;
    appState.soloGameState = getInitialState(difficulty, gameMode);
    createGrid();
}

// Team-based functions (placeholders for now)
export function processMove(moveData) {
    // To be implemented: Host receives a card flip from a player
    // and broadcasts it to the team.
}

export function processUIUpdate(data) {
    // To be implemented: All team members flip the card that was
    // selected by a teammate.
}