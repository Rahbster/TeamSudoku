//==============================
// Sudoku Puzzle Generator
//==============================
// This module contains the logic for generating a new Sudoku puzzle from scratch.
// It ensures that the generated puzzle has a single, unique solution.

/**
 * Shuffles an array in place.
 * @param {any[]} array - The array to shuffle.
 */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Checks if a number can be placed in a specific cell without conflicts.
 * @param {number[][]} board - The Sudoku grid.
 * @param {number} row - The row index.
 * @param {number} col - The column index.
 * @param {number} num - The number to check.
 * @returns {boolean} - True if the move is valid, false otherwise.
 */
function isValid(board, row, col, num) {
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
 * Fills a 9x9 Sudoku board with a valid, complete solution using backtracking.
 * @param {number[][]} board - The 9x9 grid to fill.
 * @returns {boolean} - True if the board was successfully filled.
 */
function fillBoard(board) {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (board[row][col] === 0) {
                const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                shuffle(numbers); // Randomize numbers to get different puzzles

                for (const num of numbers) {
                    if (isValid(board, row, col, num)) {
                        board[row][col] = num;
                        if (fillBoard(board)) {
                            return true;
                        }
                        board[row][col] = 0; // Backtrack
                    }
                }
                return false;
            }
        }
    }
    return true;
}

/**
 * Counts the number of possible solutions for a given Sudoku board.
 * @param {number[][]} board - The 9x9 Sudoku grid.
 * @returns {number} - The total number of solutions found.
 */
function countSolutions(board) {
    let solutionCount = 0;

    function solve() {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (board[row][col] === 0) {
                    for (let num = 1; num <= 9; num++) {
                        if (isValid(board, row, col, num)) {
                            board[row][col] = num;
                            solve();
                            board[row][col] = 0; // Backtrack to find all solutions
                        }
                    }
                    return;
                }
            }
        }
        solutionCount++; // Found a full solution
    }

    solve();
    return solutionCount;
}

/**
 * Generates a new Sudoku puzzle with a unique solution.
 * @param {string} difficulty - The desired difficulty ('easy', 'medium', 'hard').
 * @returns {number[][]} - A 9x9 array representing the puzzle.
 */
export function generatePuzzle(difficulty) {
    const board = Array(9).fill(0).map(() => Array(9).fill(0));
    fillBoard(board); // Create a full, valid Sudoku board.

    // Determine the number of cells to remove based on difficulty.
    let attempts;
    if (difficulty === 'very-easy') {
        attempts = 40;
    } else if (difficulty === 'easy') {
        attempts = 50;
    } else if (difficulty === 'medium') {
        attempts = 55;
    } else if (difficulty === 'hard') {
        attempts = 60;
    } else { // hard
        attempts = 52; // Default to medium if difficulty is unknown
    }

    // "Poke holes" in the board by removing numbers.
    let removed = 0;
    while (attempts > 0 && removed < 64) { // Max 64 holes for a valid puzzle
        const row = Math.floor(Math.random() * 9);
        const col = Math.floor(Math.random() * 9);

        if (board[row][col] !== 0) {
            const backup = board[row][col];
            board[row][col] = 0;

            // Create a copy to test for a unique solution.
            const boardCopy = board.map(arr => [...arr]);
            const solutions = countSolutions(boardCopy);

            if (solutions !== 1) {
                // If removing this number results in multiple or no solutions, put it back.
                board[row][col] = backup;
            } else {
                removed++;
            }
        }
        attempts--;
    }

    return board;
}