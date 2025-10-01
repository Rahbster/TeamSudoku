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
function solve(board, state) {
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            if (board[row][col] === 0) {
                for (let num = 1; num <= 9; num++) {
                    if (state.count > 1) return; // Optimization: stop if we already found multiple solutions
                    if (isValid(board, row, col, num)) {
                        board[row][col] = num;
                        solve(board, state);
                        board[row][col] = 0; // Backtrack
                    }
                }
                return;
            }
        }
    }
    state.count++;
}

function countSolutions(board) {
    const state = { count: 0 };
    // It is critical to work on a copy so the original board passed in is not mutated.
    const localBoard = board.map(arr => [...arr]);
    solve(localBoard, state);
    return state.count;
}

/**
 * Generates a new Sudoku puzzle with a unique solution.
 * @param {string} difficulty - The desired difficulty ('easy', 'medium', 'hard').
 * @returns {number[][]} - A 9x9 array representing the puzzle.
 */
export function generatePuzzle(difficulty) {
    const solution = Array(9).fill(0).map(() => Array(9).fill(0));
    fillBoard(solution); // Create a full, valid Sudoku board.

    const puzzle = solution.map(arr => [...arr]); // Create a copy to poke holes in

    // Create a list of all cell coordinates and shuffle them
    const cells = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            cells.push([r, c]);
        }
    }
    shuffle(cells);

    // Difficulty settings: max clues to remove and a difficulty score threshold.
    // A higher score means a harder puzzle (requires more advanced techniques).
    const difficultySettings = {
        'very-easy': { maxRemoved: 40, scoreThreshold: 5 },
        'easy':      { maxRemoved: 45, scoreThreshold: 20 },
        'medium':    { maxRemoved: 50, scoreThreshold: 50 },
        'hard':      { maxRemoved: 55, scoreThreshold: 200 }
    };

    const settings = difficultySettings[difficulty] || difficultySettings['medium'];
    let removedCount = 0;

    for (const [row, col] of cells) {
        if (removedCount >= settings.maxRemoved) {
            break;
        }

        const backup = puzzle[row][col];
        puzzle[row][col] = 0;

        // Create a DEEP copy to pass to the solver, preventing mutation of the original puzzle.
        const solutions = countSolutions(JSON.parse(JSON.stringify(puzzle)));

        if (solutions !== 1) {
            // If removing this number results in multiple or no solutions, put it back.
            puzzle[row][col] = backup;
        } else {
            // Check the difficulty score of the current puzzle state
            // Create a DEEP copy for the scoring function to solve, so it doesn't modify the actual puzzle.
            const scoreBoard = JSON.parse(JSON.stringify(puzzle));
            const score = getDifficultyScore(scoreBoard);
            if (score > settings.scoreThreshold) {
                // This move made the puzzle too hard for the selected difficulty, so undo it.
                puzzle[row][col] = backup;
            } else {
                removedCount++;
            }
        }
    }

    return puzzle;
}

/**
 * Calculates a difficulty score for a puzzle.
 * A higher score indicates a more difficult puzzle.
 * This is a simplified scoring model.
 * @param {number[][]} board - The puzzle to score.
 * @returns {number} - The difficulty score.
 */
function getDifficultyScore(board) {
    let score = 1;
    let changed;

    do {
        changed = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0) {
                    const possibilities = getPossibilities(board, r, c);
                    if (possibilities.length === 1) {
                        board[r][c] = possibilities[0];
                        changed = true;
                    }
                }
            }
        }
        if (changed) {
            score++; // Each pass of finding "singles" adds to the score.
        }
    } while (changed);

    // If the puzzle isn't solved yet, it requires more advanced techniques.
    // We can add a large penalty to the score to represent this.
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === 0) {
                score += 50; // Add a significant penalty for needing advanced logic.
            }
        }
    }

    return score;
}

/**
 * Gets all possible valid numbers for a given empty cell.
 * @param {number[][]} board - The Sudoku grid.
 * @param {number} row - The row of the cell.
 * @param {number} col - The column of the cell.
 * @returns {number[]} - An array of possible numbers.
 */
function getPossibilities(board, row, col) {
    const possibilities = [];
    for (let num = 1; num <= 9; num++) {
        if (isValid(board, row, col, num)) {
            possibilities.push(num);
        }
    }
    return possibilities;
}