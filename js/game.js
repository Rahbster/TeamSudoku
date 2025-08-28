//==============================
//Sudoku Game Logic
//==============================

import { dom,
         appState,
         pressTimer,
         dataChannels,
         startPressTimer
} from './scripts.js';

import {
    startTimer
} from './timer.js';

//==============================
//Game UI and Logic
//==============================

//Creates the Sudoku grid
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
            
            if ((col + 1) % 3 === 0 && col < 8) {
                cell.classList.add('subgrid-border-right');
            }
            if ((row + 1) % 3 === 0 && row < 8) {
                cell.classList.add('subgrid-border-bottom');
            }
            
            cell.addEventListener('mousedown', startPressTimer);
            cell.addEventListener('touchstart', startPressTimer);
            cell.addEventListener('mouseup', handleCellClick);
            cell.addEventListener('touchend', handleCellClick);
            cell.addEventListener('mouseleave', () => clearTimeout(pressTimer));

            dom.sudokuGrid.appendChild(cell);
        }
    }
}

let activeCellSelectCount = 0;

//Handles a cell click or tap
export function handleCellClick(event) {
    clearTimeout(pressTimer);
    const currentTime = new Date().getTime();
    if (currentTime - appState.lastEventTimestamp < 100) {
        appState.lastEventTimestamp = 0;
        return;
    }
    appState.lastEventTimestamp = currentTime;

    if (appState.isLongPressActive) {
        appState.isLongPressActive = false;
        return;
    }
    const cell = event.target;
    if (cell.classList.contains('preloaded-cell')) {
        const value = cell.textContent.trim();
        if (value !== '') {
            highlightMatchingCells(value);
        }
        return;
    }
    
    // Check if there is an existing active cell and remove the class
    if (appState.activeCell) {
        appState.activeCell.classList.remove('active-cell');
        // Clear any previous highlights
        clearAllHighlights();
    }
    if (appState.activeCell == cell) {
        activeCellSelectCount++;
        if (activeCellSelectCount > 3) {
            let board = [];
            for (let row = 0; row < 9; row++) {
                board[row] = [];
                for (let col = 0; col < 9; col++) {
                    const cellValue = document.getElementById(`cell-${row}-${col}`).textContent.trim();
                    const value = cellValue === '' ? 0 : parseInt(cellValue, 10);
                    board[row][col] = value;
                }
            }
            let hintValue = getHint(board);
            if (hintValue != null) {
                appState.activeCell.textContent = hintValue.value;
                highlightMatchingCells(appState.activeCell.textContent);
            }
        }
        checkGridState();
    }
    else {
        activeCellSelectCount = 0;
    }
    // Set the new active cell
    appState.activeCell = cell;
    // Add the active-cell class
    cell.classList.add('active-cell');
    // Highlight matching cells for the new active cell
    const value = appState.activeCell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

//Handles a cell long-press
export function handleLongPress(cell) {
    appState.isLongPressActive = true;
    const value = cell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

//Highlights all cells with a matching value
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

//Removes all highlight classes
export function clearAllHighlights() {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        cell.classList.remove('highlight-cell');
    });
}

//Fetches and loads a new puzzle
export async function loadPuzzle(difficulty, puzzleData) {
    createGrid();
    let puzzle = puzzleData;
    let isRemoteLoad = !!puzzleData;
    
    if (!isRemoteLoad) {
        try {
            const response = await fetch('https://sugoku.onrender.com/board?difficulty=' + difficulty);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            puzzle = data.board;
            appState.initialSudokuState = puzzle;
        } catch (error) {
            console.error('Failed to load puzzle:', error);
            alert('Failed to load puzzle. Please ensure you are running a local web server to avoid CORS issues.');
            return;
        }
    }
    
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

    // Check if the puzzle was loaded locally and there are active data channels.
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

//Validates the entire puzzle grid for conflicts and completeness
export function validatePuzzle() {
    const invalidCells = new Set();
    let isComplete = true;
    const gridValues = [];

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

    // Check rows, columns, and subgrids
    for (let i = 0; i < 9; i++) {
        const rowValues = gridValues[i];
        const colValues = [];
        for (let j = 0; j < 9; j++) {
            colValues.push(gridValues[j][i]);
        }
        
        if (checkConflicts(rowValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[i][j] !== '') invalidCells.add(`cell-${i}-${j}`);
            }
        }
        if (checkConflicts(colValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[j][i] !== '') invalidCells.add(`cell-${j}-${i}`);
            }
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

//Checks the current state of the grid for a win condition
export function checkGridState() {
    // Call the new function to update button states
    updateNumberPadState();

    const { isValid, isComplete } = validatePuzzle();
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

// Function to update the disabled state of the number pad buttons
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


