//==============================
// Word Search Game Logic
//==============================

import { startTimer } from '../timer.js'; // Import speakText from ui.js
import { dom, appState, dataChannels } from '../scripts.js';
import { showWinnerScreen, createTimerHTML, speakText } from '../ui.js';
import { playRemoteMoveSound, debugLog } from '../misc.js';

const GRID_SIZE = 15;
let isSelecting = false;
let selectionPath = [];

export function initialize() {
    debugLog("Word Search Initialized");

    // Set the button text and ensure it's visible for the host
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Puzzle';
    dom.newPuzzleButton.style.display = '';
    // If we are initializing for a solo game, draw the grid.
    loadPuzzle();
}

export function cleanup() {
    // The game_manager now clears the gameBoardArea, so we just need to nullify the DOM cache.
    dom.wordSearchListArea = null;
}

export function createGrid() {
    debugLog('WordSearch createGrid called.');
    // Create the necessary structure within the generic game board area
    dom.gameBoardArea.innerHTML = `
        <div id="wordsearch-layout-container">
            <div id="wordsearch-grid"></div>
            <div id="wordsearch-sidebar" class="glass-panel">
                ${createTimerHTML()}
                <h3>Word List</h3>
                <ul id="word-list"></ul>
            </div>
        </div>
    `;
    // Now that the elements are created, cache them.
    const wordsearchGrid = document.getElementById('wordsearch-grid');
    wordsearchGrid.className = 'wordsearch-grid';
    dom.wordSearchListArea = document.getElementById('word-search-list-area');
    dom.wordList = document.getElementById('word-list');

    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.id = `cell-${r}-${c}`;
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.textContent = gameState.grid[r][c];

            cell.addEventListener('mousedown', handleMouseDown);
            cell.addEventListener('mouseover', handleMouseOver);
            cell.addEventListener('mouseup', handleMouseUp);
            // For touch devices
            cell.addEventListener('touchstart', (e) => { e.preventDefault(); handleMouseDown(e); });
            cell.addEventListener('touchmove', (e) => { e.preventDefault(); handleMouseOver(e); });
            cell.addEventListener('touchend', (e) => { e.preventDefault(); handleMouseUp(e); });

            wordsearchGrid.appendChild(cell);
        }
    }
    updateWordListUI();
}

function handleMouseDown(event) {
    if (appState.winner) return;
    // Clear any previous partial selection
    document.querySelectorAll('.wordsearch-grid .grid-cell.selecting').forEach(c => c.classList.remove('selecting'));

    isSelecting = true;
    selectionPath = [event.target];
    event.target.classList.add('selecting');
}

function handleMouseOver(event) {
    if (!isSelecting || appState.winner || selectionPath.length === 0) return;

    const targetCell = event.type === 'touchmove' ? document.elementFromPoint(event.touches[0].clientX, event.touches[0].clientY) : event.target;
    if (!targetCell || !targetCell.classList.contains('grid-cell')) return;

    // Clear previous selection highlights
    document.querySelectorAll('.wordsearch-grid .grid-cell.selecting').forEach(c => c.classList.remove('selecting'));

    const startCell = selectionPath[0];
    const endCell = targetCell;

    const startR = parseInt(startCell.dataset.r, 10);
    const startC = parseInt(startCell.dataset.c, 10);
    const endR = parseInt(endCell.dataset.r, 10);
    const endC = parseInt(endCell.dataset.c, 10);

    const dr = Math.sign(endR - startR);
    const dc = Math.sign(endC - startC);

    // Check for valid straight line (horizontal, vertical, or 45-degree diagonal)
    if (dr === 0 || dc === 0 || Math.abs(endR - startR) === Math.abs(endC - startC)) {
        let r = startR;
        let c = startC;
        while (true) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell) {
                cell.classList.add('selecting');
            }
            if (r === endR && c === endC) break;
            r += dr;
            c += dc;
        }
    } else {
        // If not a straight line, just highlight the start cell
        startCell.classList.add('selecting');
    }
}

function handleMouseUp() {
    if (!isSelecting || appState.winner) return;
    isSelecting = false;

    // Get the final path of selected cells
    const finalSelection = Array.from(document.querySelectorAll('.wordsearch-grid .grid-cell.selecting'));
    if (finalSelection.length === 0) return;

    // The path might be built in reverse, so we need to order it by DOM position
    // This isn't strictly necessary with the new logic but is good practice.
    finalSelection.sort((a, b) => {
        const rA = parseInt(a.dataset.r, 10);
        const cA = parseInt(a.dataset.c, 10);
        const rB = parseInt(b.dataset.r, 10);
        const cB = parseInt(b.dataset.c, 10);
        if (rA !== rB) return rA - rB;
        return cA - cB;
    });

    const startCell = finalSelection[0];
    const endCell = finalSelection[finalSelection.length - 1];

    // Reconstruct the path programmatically to ensure it's a perfect line
    const path = [];
    const startR = parseInt(startCell.dataset.r, 10);
    const startC = parseInt(startCell.dataset.c, 10);
    const endR = parseInt(endCell.dataset.r, 10);
    const endC = parseInt(endCell.dataset.c, 10);

    const dr = Math.sign(endR - startR);
    const dc = Math.sign(endC - startC);

    let r = startR;
    let c = startC;
    while (true) {
        const cell = document.getElementById(`cell-${r}-${c}`);
        if (cell) {
            path.push(cell);
        }
        if (r === endR && c === endC) break;
        r += dr;
        c += dc;
    }

    const selectedWord = path.map(cell => cell.textContent).join('');
    const reversedSelectedWord = [...path].reverse().map(cell => cell.textContent).join('');

    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    let found = false;
    for (const wordObj of gameState.words) {
        if (!wordObj.found && (wordObj.word === selectedWord || wordObj.word === reversedSelectedWord)) {
            const wordToMark = wordObj.word;
            found = true;

            const move = {
                type: 'move',
                game: 'wordsearch',
                team: appState.playerTeam,
                word: wordToMark,
                path: path.map(cell => ({ r: cell.dataset.r, c: cell.dataset.c })),
                playerId: appState.playerId,
                sessionId: appState.sessionId
            };

            if (appState.isInitiator) {
                // For solo play, process the move directly on the soloGameState
                if (!appState.playerTeam) {
                    processUIUpdate(move);
                } else {
                    processMove(move);
                }
            } else {
                if (dataChannels.length > 0 && dataChannels[0].readyState === 'open') {
                    dataChannels[0].send(JSON.stringify(move));
                }
            }
            break;
        }
    }

    // Clear selection styling
    document.querySelectorAll('.wordsearch-grid .grid-cell.selecting').forEach(c => c.classList.remove('selecting'));
    selectionPath = [];
}

function updateWordListUI() {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    dom.wordList.innerHTML = '';
    gameState.words.forEach(wordObj => {
        const li = document.createElement('li');
        li.textContent = wordObj.word; // Make the word speakable
        li.onclick = () => speakText(wordObj.word);
        if (wordObj.found) {
            li.classList.add('found');
        }
        dom.wordList.appendChild(li);
    });
}

/**
 * Generates the grid and word list for a new Word Search puzzle.
 */
export function getInitialState() {
    let words;
    const wordCount = parseInt(dom.wordCountInput.value, 10) || 10;
    const customWordList = dom.customWordListInput.value.trim();

    if (customWordList) {
        // Parse the custom list, splitting by newlines, commas, or spaces.
        // Filter out empty strings and convert to uppercase.
        const customWords = customWordList.split(/[\n, ]+/)
            .map(word => word.trim().toUpperCase())
            .filter(word => word.length > 1 && word.length <= 12); // Basic validation, also filters empty strings

        if (customWords.length > 0) {
            // Shuffle the array and take the configured number of words
            for (let i = customWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [customWords[i], customWords[j]] = [customWords[j], customWords[i]];
            }
            words = customWords.slice(0, wordCount);
        }
    }
    
    // If no valid custom list was provided, use the default.
    if (!words) {
        words = ["GEMINI", "CODE", "ASSIST", "SUDOKU", "TEAM", "WEBRTC", "PUZZLE", "JAVASCRIPT", "HTML", "CSS"];
    }

    words.sort(); // Sort the final list of words alphabetically.

    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
    const solution = {};

    for (const word of words) {
        let placed = false;
        while (!placed) {
            const direction = Math.floor(Math.random() * 4); // 0: H, 1: V, 2: D-right, 3: D-left
            const r = Math.floor(Math.random() * GRID_SIZE);
            const c = Math.floor(Math.random() * GRID_SIZE);

            let canPlace = true;
            const path = [];
            for (let i = 0; i < word.length; i++) {
                let nr, nc;
                if (direction === 0) { nr = r; nc = c + i; }
                else if (direction === 1) { nr = r + i; nc = c; }
                else if (direction === 2) { nr = r + i; nc = c + i; }
                else { nr = r + i; nc = c - i; }

                if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || (grid[nr][nc] !== '' && grid[nr][nc] !== word[i])) {
                    canPlace = false;
                    break;
                }
                path.push({ r: nr, c: nc });
            }

            if (canPlace) {
                for (let i = 0; i < word.length; i++) {
                    grid[path[i].r][path[i].c] = word[i];
                }
                solution[word] = path;
                placed = true;
            }
        }
    }

    // Fill remaining empty cells with random letters
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] === '') {
                grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
            }
        }
    }

    return {
        grid,
        words: words.map(w => ({ word: w, found: false, foundBy: null })),
        solution
    };
}

export function loadPuzzle() {
    debugLog('WordSearch loadPuzzle called.');
    appState.winner = null;
    const newState = getInitialState();
    if (appState.playerTeam) {
        const team = appState.teams[appState.playerTeam];
        team.gameState = newState;
        updateGridForTeam(appState.playerTeam);
    } else if (appState.isInitiator) {
        appState.soloGameState = newState;
        createGrid();
    }
}

export function updateGridForTeam(teamName) {
    const team = appState.teams[teamName];
    if (!team || team.gameType !== 'wordsearch') return;
    if (!team.gameState && appState.isInitiator) {
        team.gameState = getInitialState();
    }
    createGrid();
    // Mark already found words
    team.gameState.words.forEach(wordObj => {
        if (wordObj.found) {
            const path = team.gameState.solution[wordObj.word];
            path.forEach(pos => {
                document.getElementById(`cell-${pos.r}-${pos.c}`).classList.add('found');
            });
        }
    });
}

export function processMove(moveData) {
    // Host authoritative logic
    if (!appState.isInitiator) return;

    const team = appState.teams[moveData.team];
    if (!team) return;

    const wordObj = team.gameState.words.find(w => w.word === moveData.word);
    if (wordObj && !wordObj.found) {
        wordObj.found = true;
        wordObj.foundBy = moveData.playerId;

        const moveUpdate = {
            type: 'move-update',
            game: 'wordsearch',
            team: moveData.team,
            word: moveData.word,
            path: moveData.path,
            sessionId: moveData.sessionId
        };

        const message = JSON.stringify(moveUpdate);
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') channel.send(message);
        });
        processUIUpdate(moveUpdate); // Host processes its own UI update
    }
}

export function processUIUpdate(data) {
    const gameState = appState.playerTeam ? appState.teams[appState.playerTeam]?.gameState : appState.soloGameState;
    if (!gameState) return;

    // Mark word as found in local state
    const wordObj = gameState.words.find(w => w.word === data.word);
    if (wordObj) {
        wordObj.found = true;
    }

    // Highlight path on grid
    data.path.forEach(pos => {
        const cell = document.getElementById(`cell-${pos.r}-${pos.c}`);
        if (cell) cell.classList.add('found');
    });

    // Update word list UI
    updateWordListUI();

    // Play sound for remote moves
    if (data.sessionId !== appState.sessionId) {
        playRemoteMoveSound();
    }

    // Check for win condition
    const allFound = gameState.words.every(w => w.found);
    if (allFound && !appState.winner) {
        if (appState.isInitiator) {
            const winner = appState.playerTeam || 'You'; // Solo win or team win
            const gameOverMessage = { type: 'game-over', winningTeam: winner };
            const messageString = JSON.stringify(gameOverMessage);
            dataChannels.forEach(channel => {
                if (channel.readyState === 'open') channel.send(messageString);
            });
            showWinnerScreen(winner);
        }
    } else if (gameState.moves >= GRID_SIZE * GRID_SIZE && !appState.winner) {
        if (appState.isInitiator) {
            showWinnerScreen('tie');
        }
    }
}