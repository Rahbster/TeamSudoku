//==============================
//Sudoku Game Logic
//==============================

import { dom,
         appState, dataChannels,
         startPressTimer
} from './scripts.js';

import {
    startTimer,
    stopTimer
} from './timer.js';

import {
    generatePuzzle
} from './generator.js';

//==============================
//Game UI and Logic
//==============================

/**
 * Creates and populates the 9x9 Sudoku grid in the DOM.
 * It clears any existing grid, then generates new cells with appropriate classes and event listeners.
 */
export function createGrid() {
    if (dom.sudokuGrid.firstChild) {
        while (dom.sudokuGrid.firstChild) {
            dom.sudokuGrid.removeChild(dom.sudokuGrid.firstChild);
        }
    }
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.id = `cell-${row}-${col}`;
            cell.textContent = '';
            
            // Add thicker borders to delineate the 3x3 subgrids.
            if ((col + 1) % 3 === 0 && col < 8) {
                cell.classList.add('subgrid-border-right');
            }
            if ((row + 1) % 3 === 0 && row < 8) {
                cell.classList.add('subgrid-border-bottom');
            }
            
            // Add event listeners for both mouse and touch to handle clicks and long-presses.
            cell.addEventListener('mousedown', startPressTimer);
            cell.addEventListener('touchstart', startPressTimer);
            cell.addEventListener('mouseup', handleCellClick);
            cell.addEventListener('touchend', handleCellClick);
            cell.addEventListener('mouseleave', () => clearTimeout(appState.pressTimer));

            dom.sudokuGrid.appendChild(cell);
        }
    }
}

let activeCellSelectCount = 0;

/**
 * Handles a click or tap event on a grid cell.
 * Manages cell selection, highlighting, and triggers hint generation on multiple taps.
 * @param {Event} event - The mouse or touch event.
 */
export function handleCellClick(event) {
    clearTimeout(appState.pressTimer);
    // Debounce rapid events to prevent double-firing on some devices.
    const currentTime = new Date().getTime();
    if (currentTime - appState.lastEventTimestamp < 100) {
        appState.lastEventTimestamp = 0;
        return;
    }
    appState.lastEventTimestamp = currentTime;

    // If a long-press was just completed, do nothing.
    if (appState.isLongPressActive) {
        appState.isLongPressActive = false;
        return;
    }
    const cell = event.target;
    // If the cell is pre-filled, just highlight matching numbers.
    if (cell.classList.contains('preloaded-cell')) {
        const value = cell.textContent.trim();
        if (value !== '') {
            highlightMatchingCells(value);
        }
        return;
    }
    
    // If there is an existing active cell, remove its 'active' class and clear highlights.
    if (appState.activeCell) {
        appState.activeCell.classList.remove('active-cell');
        clearAllHighlights();
    }

    // Reset the multi-click counter if a different cell is selected.
    if (appState.activeCell !== cell) {
        activeCellSelectCount = 0;
    }

    // Set the new active cell and highlight it.
    appState.activeCell = cell;
    cell.classList.add('active-cell');
    const value = appState.activeCell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

/**
 * Highlights all cells on the grid that contain the same value as the provided number.
 * @param {string} value - The number to match and highlight.
 */
export function highlightMatchingCells(value) {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        if (cell.textContent.trim() === value && !cell.classList.contains('invalid-cell') && !cell.classList.contains('solved-puzzle')) {
            cell.classList.add('highlight-cell');
        }
        else {
            cell.classList.remove('highlight-cell');
        }
    });
}

/**
 * Removes the 'highlight-cell' class from all cells on the grid.
 */
export function clearAllHighlights() {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        cell.classList.remove('highlight-cell');
    });
}

/**
 * Loads a new puzzle onto the grid. Can be generated locally or received from a peer.
 * @param {string} difficulty - The difficulty level ('easy', 'medium', 'hard') for local generation.
 * @param {number[][]} [puzzleData] - Optional puzzle data received from a peer.
 * If provided, this puzzle is loaded instead of generating a new one.
 */
export async function loadPuzzle(difficulty, puzzleData) {
    createGrid();
    let puzzle = puzzleData;
    let isRemoteLoad = !!puzzleData;
    
    if (!isRemoteLoad) {
        // Generate puzzle locally instead of fetching from an API
        puzzle = generatePuzzle(difficulty);
        appState.initialSudokuState = puzzle;
        console.log('Generated new puzzle locally for difficulty:', difficulty);
    }
    
    // Populate the grid cells with the puzzle numbers.
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            const value = puzzle[row][col];
            cell.textContent = value === 0 ? '' : value;
            if (value !== 0) {
                cell.classList.add('preloaded-cell');
            }
        }
    }
    
    checkGridState();

    // If the puzzle was generated locally (by the host), broadcast it to all connected peers.
    if (!isRemoteLoad && dataChannels && dataChannels.length > 0) {
        const puzzleMessage = { type: 'initial-state', state: puzzle };
        const messageString = JSON.stringify(puzzleMessage);

        // Broadcast the puzzle to all connected data channels.
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') {
                channel.send(messageString);
            }
        });
    }
    startTimer();
}

/**
 * Validates the entire Sudoku grid for conflicts (duplicate numbers in rows, columns, or subgrids)
 * and checks if the puzzle is fully filled.
 * @returns {{isValid: boolean, isComplete: boolean}} - An object indicating if the grid is valid and complete.
 */
export function validatePuzzle() {
    const invalidCells = new Set();
    let isComplete = true;
    const gridValues = [];

    // First, create a 2D array representation of the current grid values.
    for (let row = 0; row < 9; row++) {
        const rowValues = [];
        for (let col = 0; col < 9; col++) {
            const cellValue = document.getElementById(`cell-${row}-${col}`).textContent.trim();
            rowValues.push(cellValue);
            if (cellValue === '') {
                isComplete = false;
            }
        }
        gridValues.push(rowValues);
    }
    
    // Helper function to check for duplicates in an array (row, column, or subgrid).
    const checkConflicts = (arr) => {
        const seen = new Set();
        for (const num of arr) {
            if (num !== '' && seen.has(num)) {
                return true;
            }
            if (num !== '') {
                seen.add(num);
            }
        }
        return false;
    };

    // Check for conflicts in all rows, columns, and 3x3 subgrids.
    for (let i = 0; i < 9; i++) {
        const rowValues = gridValues[i];
        const colValues = [];
        for (let j = 0; j < 9; j++) {
            colValues.push(gridValues[j][i]);
        }
        
        // If a row has conflicts, mark all its cells as invalid.
        if (checkConflicts(rowValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[i][j] !== '') invalidCells.add(`cell-${i}-${j}`);
            }
        }
        // If a column has conflicts, mark all its cells as invalid.
        if (checkConflicts(colValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[j][i] !== '') invalidCells.add(`cell-${j}-${i}`);
            }
        }
        // If a subgrid has conflicts, mark all its cells as invalid.
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

    // Apply or remove the 'invalid-cell' class based on the validation results.
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const isPreloaded = cell.classList.contains('preloaded-cell');
        if (!isPreloaded) {
            cell.classList.remove('invalid-cell', 'solved-puzzle');
            if (invalidCells.has(cell.id)) {
                cell.classList.add('invalid-cell');
            }
        }
    });
    return { isValid: invalidCells.size === 0, isComplete: isComplete };
}

/**
 * Checks the current state of the grid, validates it, and determines if the puzzle is solved.
 * If solved, it stops the timer and displays a congratulations message.
 */
export function checkGridState() {
    updateNumberPadState();

    const { isValid, isComplete } = validatePuzzle();
    // The puzzle is solved if it's completely filled and has no conflicts.
    if (isComplete && isValid) {
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.add('solved-puzzle');
        });
        stopTimer();
        alert("Congratulations! The puzzle is solved!");
    }
}

/**
 * Solves a Sudoku puzzle using a backtracking algorithm.
 * @param {number[][]} board - The 9x9 Sudoku grid.
 * @returns {boolean} - True if the puzzle is solved, false otherwise.
 */
function solveSudoku(board) {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            // Find an empty cell
            if (board[row][col] === 0) {
                // Try numbers 1-9
                for (let num = 1; num <= 9; num++) {
                    if (isValidMove(board, row, col, num)) {
                        board[row][col] = num; // Make a temporary assignment

                        // Recursively try to solve the rest of the puzzle
                        if (solveSudoku(board)) {
                            return true; // Puzzle is solved
                        }

                        // If it fails, backtrack
                        board[row][col] = 0;
                    }
                }
                return false; // No number worked, so backtrack
            }
        }
    }
    return true; // All cells are filled, puzzle is solved
}

/**
 * Checks if a number can be placed in a specific cell without conflicts.
 * @param {number[][]} board - The Sudoku grid.
 * @param {number} row - The row index.
 * @param {number} col - The column index.
 * @param {number} num - The number to check.
 * @returns {boolean} - True if the move is valid, false otherwise.
 */
function isValidMove(board, row, col, num) {
    // Check row and column
    for (let i = 0; i < 9; i++) {
        if (board[row][i] === num || board[i][col] === num) {
            return false;
        }
    }

    // Check 3x3 subgrid
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[startRow + i][startCol + j] === num) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Finds the correct value for the appState.activeCell to provide a hint.
 * @param {number[][]} board - The current state of the Sudoku grid.
 * @returns {{row: number, col: number, value: number} | null} - The hint object or null if the active cell is not empty.
 */
function getHint(board) {
    const activeCell = appState.activeCell;

    // First, check if there is an active cell and if it's empty
    if (!activeCell || activeCell.textContent.trim() !== '') {
        console.log("No empty active cell selected to provide a hint.");
        return null;
    }

    // Get the row and column from the active cell's ID
    const [_, row, col] = activeCell.id.split('-');
    const hintRow = parseInt(row, 10);
    const hintCol = parseInt(col, 10);

    // Create a copy of the board to find the solution without altering the current game state
    const boardCopy = board.map(arr => [...arr]);

    // Iterate through numbers 1-9 to find the correct value for the active cell
    for (let num = 1; num <= 9; num++) {
        if (isValidMove(boardCopy, hintRow, hintCol, num)) {
            boardCopy[hintRow][hintCol] = num;

            // Check if this number leads to a solvable puzzle
            if (solveSudoku(boardCopy)) {
                return { row: hintRow, col: hintCol, value: num };
            }

            // Backtrack if the number doesn't work
            boardCopy[hintRow][hintCol] = 0;
        }
    }

    // If no number works (the puzzle is unsolvable), return null
    return null;
}

/**
 * Updates the state of the number pad buttons, disabling any number that has already
 * been placed 9 times on the grid.
 */
export function updateNumberPadState() {
    const counts = {};
    for (let i = 1; i <= 9; i++) {
        counts[i] = 0;
    }
    
    // Count all numbers currently on the grid
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        const value = parseInt(cell.textContent.trim(), 10);
        if (value >= 1 && value <= 9) {
            counts[value]++;
        }
    });

    // Disable the button if a number has been used 9 times
    for (const number in counts) {
        const button = document.getElementById(`number-btn-${number}`);
        if (button) {
            button.disabled = counts[number] >= 9;
        }
    }
}
