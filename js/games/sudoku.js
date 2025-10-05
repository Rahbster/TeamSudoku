//==============================
// Sudoku Game Logic
//==============================

import { dom, appState, dataChannels } from '../scripts.js';
import { startTimer } from '../timer.js';
import { generatePuzzle } from '../generator.js';
import { broadcastCellSelection, processAndBroadcastMove } from '../webrtc.js';
import { showWinnerScreen } from '../ui.js';
import { playBeepSound } from '../misc.js';

export function initialize() {
    console.log("Sudoku Initialized");
    // Show/hide UI elements specific to Sudoku
    dom.numberPad.classList.remove('hidden');
    dom.pencilButton.classList.remove('hidden');
    dom.sudokuGridArea.classList.remove('hidden'); // Ensure the grid container is visible
    document.querySelectorAll('.host-only').forEach(el => {
        if (el.id === 'difficulty-select' || el.id === 'new-puzzle-btn') {
            el.style.display = '';
        }
    });
    // Set the button text for Sudoku
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Puzzle';

    // Ensure the main "New Game" button is correctly wired up for Sudoku.
    dom.newPuzzleButton.onclick = () => loadPuzzle(dom.difficultySelector.value, null, false);

}

/**
 * Cleans up UI elements specific to Sudoku when switching games.
 */
export function cleanup() {
    console.log("Sudoku Cleanup");
    dom.numberPad.classList.add('hidden');
    dom.pencilButton.classList.add('hidden');
    // Also hide the host-only controls that Sudoku shows
    document.querySelectorAll('.host-only').forEach(el => {
        if (el.id === 'difficulty-select' || el.id === 'new-puzzle-btn') {
            el.style.display = 'none';
        }
    });
}

export function createGrid() {
    dom.sudokuGrid.innerHTML = '';
    dom.sudokuGrid.className = 'sudoku-grid'; // Set class for Sudoku styling

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.id = `cell-${row}-${col}`;

            const cellValue = document.createElement('div');
            cellValue.className = 'cell-value';
            cell.appendChild(cellValue);

            const scratchPad = document.createElement('div');
            scratchPad.className = 'scratch-pad';
            for (let i = 1; i <= 9; i++) {
                const digit = document.createElement('div');
                digit.className = 'scratch-pad-digit';
                digit.textContent = i;
                digit.dataset.digit = i;
                scratchPad.appendChild(digit);
            }
            cell.appendChild(scratchPad);

            if ((col + 1) % 3 === 0 && col < 8) cell.classList.add('subgrid-border-right');
            if ((row + 1) % 3 === 0 && row < 8) cell.classList.add('subgrid-border-bottom');

            cell.addEventListener('mousedown', (e) => handleInteractionStart(e, cell));
            cell.addEventListener('touchstart', (e) => handleInteractionStart(e, cell));
            cell.addEventListener('mouseup', (e) => handleInteractionEnd(e, cell));
            cell.addEventListener('touchend', (e) => handleInteractionEnd(e, cell));
            cell.addEventListener('mouseleave', () => clearTimeout(appState.pressTimer));

            dom.sudokuGrid.appendChild(cell);
        }
    }
}

function handleInteractionStart(event, cell) {
    event.preventDefault();
    clearTimeout(appState.pressTimer);
    appState.isLongPressActive = false;

    appState.pressTimer = setTimeout(() => {
        appState.isLongPressActive = true;
        const value = cell.querySelector('.cell-value').textContent.trim();
        if (value) {
            clearAllHighlights();
            highlightMatchingCells(value);
        }
    }, 500);
}

function handleInteractionEnd(event, cell) {
    clearTimeout(appState.pressTimer);
    if (appState.isLongPressActive) {
        appState.isLongPressActive = false;
        return;
    }
    handleCellClick(cell);
}

export function handleCellClick(cell) {
    clearAllHighlights();
    if (appState.activeCell) appState.activeCell.classList.remove('active-cell');
    appState.activeCell = cell;
    if (!cell.classList.contains('preloaded-cell')) cell.classList.add('active-cell');

    const value = cell.querySelector('.cell-value').textContent.trim();
    if (value) highlightMatchingCells(value);

    if (appState.playerTeam && dataChannels.length > 0) {
        const [_, row, col] = cell.id.split('-');
        const selectMessage = {
            type: 'cell-select',
            team: appState.playerTeam,
            row: parseInt(row, 10),
            col: parseInt(col, 10),
            playerId: appState.playerId,
            sessionId: appState.sessionId
        };
        if (appState.isInitiator) {
            broadcastCellSelection(selectMessage);
        } else {
            if (dataChannels[0] && dataChannels[0].readyState === 'open') {
                dataChannels[0].send(JSON.stringify(selectMessage));
            }
        }
    }
}

export function highlightMatchingCells(value) {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.querySelector('.cell-value').textContent.trim() === value.toString()) {
            cell.classList.add('highlight-cell');
        }
    });
}

export function clearAllHighlights() {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('highlight-cell');
    });
}

export function highlightConflictingCells(row, col, value) {
    for (let i = 0; i < 9; i++) {
        const rowCell = document.getElementById(`cell-${row}-${i}`);
        if (rowCell.querySelector('.cell-value').textContent.trim() === value) rowCell.classList.add('invalid-cell');
        const colCell = document.getElementById(`cell-${i}-${col}`);
        if (colCell.querySelector('.cell-value').textContent.trim() === value) colCell.classList.add('invalid-cell');
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const subgridCell = document.getElementById(`cell-${startRow + r}-${startCol + c}`);
            if (subgridCell.querySelector('.cell-value').textContent.trim() === value) subgridCell.classList.add('invalid-cell');
        }
    }
}

export async function loadPuzzle(difficulty, puzzleData, resetTeams = false) {
    createGrid();
    let puzzle = puzzleData;
    if (!puzzleData) {
        puzzle = generatePuzzle(difficulty);
        appState.initialSudokuState = JSON.parse(JSON.stringify(puzzle));
        if (resetTeams) appState.teams = {};
        for (const teamName in appState.teams) {
            if (appState.teams[teamName].gameType === 'sudoku') {
                appState.teams[teamName].gameState = JSON.parse(JSON.stringify(puzzle));
            }
        }
        appState.winner = null;
    }
    appState.initialSudokuState = JSON.parse(JSON.stringify(puzzle));

    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            const value = puzzle[row][col];
            cell.querySelector('.cell-value').textContent = value === 0 ? '' : value;
            if (value !== 0) cell.classList.add('preloaded-cell');
        }
    }
    startTimer();
    return puzzle;
}

export function updateGridForTeam(teamName) {
    const team = appState.teams[teamName];
    if (!team || team.gameType !== 'sudoku') return;

    const puzzle = team.gameState;
    createGrid(); // Recreate grid to ensure correct structure
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            const value = puzzle[r][c];
            cell.querySelector('.cell-value').textContent = value === 0 ? '' : value;
            const initialValue = appState.initialSudokuState[r][c];
            if (initialValue !== 0) cell.classList.add('preloaded-cell');
        }
    }
    checkGridState();
}

export function validatePuzzle() {
    const invalidCells = new Set();
    let isComplete = true;
    const gridValues = [];

    for (let row = 0; row < 9; row++) {
        const rowValues = [];
        for (let col = 0; col < 9; col++) {
            const cellValue = document.getElementById(`cell-${row}-${col}`).querySelector('.cell-value').textContent.trim();
            rowValues.push(cellValue);
            if (cellValue === '') isComplete = false;
        }
        gridValues.push(rowValues);
    }

    const checkConflicts = (arr) => {
        const seen = new Set();
        for (const num of arr) {
            if (num !== '' && seen.has(num)) return true;
            if (num !== '') seen.add(num);
        }
        return false;
    };

    for (let i = 0; i < 9; i++) {
        const rowValues = gridValues[i];
        const colValues = gridValues.map(row => row[i]);
        if (checkConflicts(rowValues)) {
            for (let j = 0; j < 9; j++) if (gridValues[i][j] !== '') invalidCells.add(`cell-${i}-${j}`);
        }
        if (checkConflicts(colValues)) {
            for (let j = 0; j < 9; j++) if (gridValues[j][i] !== '') invalidCells.add(`cell-${j}-${i}`);
        }
        const subgridValues = [];
        const startRow = Math.floor(i / 3) * 3;
        const startCol = (i % 3) * 3;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                subgridValues.push(gridValues[startRow + row][startCol + col]);
            }
        }
        if (checkConflicts(subgridValues)) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    if (gridValues[startRow + row][startCol + col] !== '') invalidCells.add(`cell-${startRow + row}-${startCol + col}`);
                }
            }
        }
    }

    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (!cell.classList.contains('preloaded-cell')) {
            cell.classList.remove('invalid-cell', 'solved-puzzle');
            if (invalidCells.has(cell.id)) cell.classList.add('invalid-cell');
        }
    });
    return { isValid: invalidCells.size === 0, isComplete: isComplete };
}

export function checkGridState() {
    updateNumberPadState();
    const { isValid, isComplete } = validatePuzzle();
    if (isComplete && isValid) {
        if (appState.isInitiator && !appState.winner) {
            appState.winner = appState.playerTeam;
            appState.gameInProgress = false;
            const gameOverMessage = { type: 'game-over', winningTeam: appState.playerTeam };
            const messageString = JSON.stringify(gameOverMessage);
            dataChannels.forEach(channel => {
                if (channel.readyState === 'open') channel.send(messageString);
            });
            showWinnerScreen(appState.playerTeam);
        }
    }
}

export function isMoveValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) {
        if (board[row][i] === num || board[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[startRow + i][startCol + j] === num) return false;
        }
    }
    return true;
}

export function updateNumberPadState() {
    const counts = {};
    for (let i = 1; i <= 9; i++) counts[i] = 0;
    document.querySelectorAll('.grid-cell .cell-value').forEach(cell => {
        const value = parseInt(cell.textContent.trim(), 10);
        if (value >= 1 && value <= 9) counts[value]++;
    });
    for (const number in counts) {
        const button = document.getElementById(`number-btn-${number}`);
        if (button) button.disabled = counts[number] >= 9;
    }
}

export function processMove(moveData) {
    // This function is called by the host to process a move from any player (including self)
    const team = appState.teams[moveData.team];
    if (team && team.gameType === 'sudoku') {
        const value = moveData.value === '' ? 0 : moveData.value;

        // Create a temporary board to validate the move
        const board = JSON.parse(JSON.stringify(team.gameState));
        board[moveData.row][moveData.col] = 0; // Temporarily clear the cell for validation

        if (value === 0 || isMoveValid(board, moveData.row, moveData.col, value)) {
            // 1. Update the authoritative state
            team.gameState[moveData.row][moveData.col] = value;

            // 2. Broadcast the valid move
            const moveUpdate = {
                type: 'move-update',
                game: 'sudoku',
                team: moveData.team,
                row: moveData.row,
                col: moveData.col,
                value: moveData.value,
                playerId: moveData.playerId,
                sessionId: moveData.sessionId
            };
            const message = JSON.stringify(moveUpdate);
            dataChannels.forEach(channel => {
                if (channel.readyState === 'open') channel.send(message);
            });
            // Host processes its own UI update
            processUIUpdate(moveUpdate);
        } else {
            // Invalid move, don't broadcast. Maybe send feedback to the specific player?
            // For now, we just ignore it on the host. The client-side validation should prevent this.
            console.log("Invalid move received from client and rejected by host.");
        }
    }
}

export function processUIUpdate(data) {
    // This function is run by all clients to update their UI based on a broadcast
    if (data.team === appState.playerTeam) {
        const cell = document.getElementById(`cell-${data.row}-${data.col}`);
        if (cell) {
            // For Sudoku, clear scratchpad when a final number is entered
            cell.querySelectorAll('.scratch-pad-digit').forEach(d => d.style.visibility = 'hidden');
            cell.querySelector('.cell-value').textContent = data.value;
        }
        // If this is a move from another player, add visual/audio feedback.
        if (data.sessionId !== appState.sessionId) {
            playBeepSound();
            if (cell) {
                cell.classList.add('blink');
                setTimeout(() => cell.classList.remove('blink'), 2000);
            }
        }
        checkGridState();
    }
}

export function getInitialState(difficulty) {
    return generatePuzzle(difficulty);
}