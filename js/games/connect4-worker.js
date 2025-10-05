//==============================
// Connect 4 AI Web Worker
//==============================

const ROWS = 6;
const COLS = 7;

/**
 * This listener waits for a message from the main thread containing the game board.
 * It then calculates the best move and posts the result back.
 */
self.onmessage = function(e) {
    const { board, difficulty } = e.data;
    console.log(`[WORKER] Message received. Difficulty: ${difficulty}`);

    // Make a deep copy to prevent mutation of the original board state during evaluation
    const boardCopy = JSON.parse(JSON.stringify(board));

    const bestMove = findBestMove(boardCopy, difficulty);

    console.log(`[WORKER] Calculated best move: ${bestMove}. Posting back to main thread.`);
    self.postMessage({ bestMove: bestMove });
};

// --- AI Logic and Helper Functions (self-contained in the worker) ---

function findNextOpenRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            return r;
        }
    }
    return -1;
}

function checkWinner(board, r, c, player) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        let count = 1;
        for (let i = 1; i < 4; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) count++; else break;
        }
        for (let i = 1; i < 4; i++) {
            const nr = r - dr * i, nc = c - dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) count++; else break;
        }
        if (count >= 4) return true;
    }
    return false;
}

function getValidMoves(board) {
    const validMoves = [];
    for (let c = 0; c < COLS; c++) {
        if (board[0][c] === 0) validMoves.push(c);
    }
    return validMoves;
}

function findBestMove(board, difficulty) {
    const validMoves = getValidMoves(board);
    if (validMoves.length === 0) return null;

    switch (difficulty) {
        case 'very-easy':
            return validMoves[Math.floor(Math.random() * validMoves.length)];

        case 'easy':
            // Original logic: win, block, then random
            // Check for winning move for AI (2)
            for (const move of validMoves) {
                const r = findNextOpenRow(board, move);
                board[r][move] = 2;
                if (checkWinner(board, r, move, 2)) { board[r][move] = 0; return move; }
                board[r][move] = 0;
            }
            // Check for blocking move for Player (1)
            for (const move of validMoves) {
                const r = findNextOpenRow(board, move);
                board[r][move] = 1;
                if (checkWinner(board, r, move, 1)) { board[r][move] = 0; return move; }
                board[r][move] = 0;
            }
            return validMoves[Math.floor(Math.random() * validMoves.length)];

        case 'medium':
        case 'hard':
            const depth = difficulty === 'medium' ? 3 : 5; // Deeper search for hard
            let bestScore = -Infinity;
            let bestMove = validMoves[0];

            for (const move of validMoves) {
                const r = findNextOpenRow(board, move);
                board[r][move] = 2; // AI is player 2
                const score = minimax(board, depth - 1, -Infinity, Infinity, false);
                board[r][move] = 0; // Backtrack
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            }
            return bestMove;

        default:
            return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
}

function scorePosition(board, player) {
    let score = 0;
    const centerArray = board.map(row => row[Math.floor(COLS / 2)]);
    const centerCount = centerArray.filter(p => p === player).length;
    score += centerCount * 3;

    // Score Horizontal, Vertical, Diagonal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            // Horizontal
            if (c <= COLS - 4) {
                const window = [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]];
                score += evaluateWindow(window, player);
            }
            // Vertical
            if (r <= ROWS - 4) {
                const window = [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]];
                score += evaluateWindow(window, player);
            }
            // Positive Diagonal
            if (r <= ROWS - 4 && c <= COLS - 4) {
                const window = [board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]];
                score += evaluateWindow(window, player);
            }
            // Negative Diagonal
            if (r >= 3 && c <= COLS - 4) {
                const window = [board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]];
                score += evaluateWindow(window, player);
            }
        }
    }
    return score;
}

function evaluateWindow(window, player) {
    let score = 0;
    const opponent = player === 1 ? 2 : 1;
    const playerCount = window.filter(p => p === player).length;
    const opponentCount = window.filter(p => p === opponent).length;
    const emptyCount = window.filter(p => p === 0).length;

    if (playerCount === 4) {
        score += 100;
    } else if (playerCount === 3 && emptyCount === 1) {
        score += 5;
    } else if (playerCount === 2 && emptyCount === 2) {
        score += 2;
    }

    if (opponentCount === 3 && emptyCount === 1) {
        score -= 4;
    }

    return score;
}

function isTerminalNode(board) {
    return checkWinner(board, 0, 0, 1) || checkWinner(board, 0, 0, 2) || getValidMoves(board).length === 0;
}

function minimax(board, depth, alpha, beta, maximizingPlayer) {
    const validMoves = getValidMoves(board);
    const isTerminal = validMoves.length === 0 || depth === 0; // Simplified terminal check

    if (isTerminal) {
        if (validMoves.length === 0) {
            // Check if the last move resulted in a win
            // This is a simplification; a full check would be more robust.
            return 0;
        }
        return scorePosition(board, 2); // Score from AI's perspective
    }

    if (maximizingPlayer) {
        let value = -Infinity;
        for (const move of validMoves) {
            const r = findNextOpenRow(board, move);
            board[r][move] = 2; // AI's move
            const newValue = minimax(board, depth - 1, alpha, beta, false);
            board[r][move] = 0; // Backtrack
            value = Math.max(value, newValue);
            alpha = Math.max(alpha, value);
            if (alpha >= beta) {
                break; // Beta cut-off
            }
        }
        return value;
    } else { // Minimizing player
        let value = Infinity;
        for (const move of validMoves) {
            const r = findNextOpenRow(board, move);
            board[r][move] = 1; // Player's move
            const newValue = minimax(board, depth - 1, alpha, beta, true);
            board[r][move] = 0; // Backtrack
            value = Math.min(value, newValue);
            beta = Math.min(beta, value);
            if (alpha >= beta) {
                break; // Alpha cut-off
            }
        }
        return value;
    }
}

function findBestMove_simple(board) {
    const validMoves = getValidMoves(board);
    if (validMoves.length > 0) {
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    return null;
}