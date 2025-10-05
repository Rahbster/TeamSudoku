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
    const { board } = e.data;
    const bestMove = findBestMove(board);
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

function findBestMove(board) {
    // 1. Check if AI (Player 2) can win
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = 2;
            if (checkWinner(board, r, c, 2)) { board[r][c] = 0; return c; }
            board[r][c] = 0;
        }
    }

    // 2. Check if Player 1 can win, and block them
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = 1;
            if (checkWinner(board, r, c, 1)) { board[r][c] = 0; return c; }
            board[r][c] = 0;
        }
    }

    // 3. Fallback: pick a random valid column
    const validMoves = [];
    for (let c = 0; c < COLS; c++) {
        if (board[0][c] === 0) validMoves.push(c);
    }

    if (validMoves.length > 0) {
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    return null;
}