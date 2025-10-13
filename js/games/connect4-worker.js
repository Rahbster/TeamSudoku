//==============================
// Connect 4 AI Web Worker (Final Robust Revision - Max Depth Focus)
//==============================

/**
 * This listener waits for a message from the main thread containing the game board.
 * It then calculates the best move and posts the result back.
 */
self.onmessage = function(e) {
    const { board, difficulty, rows, cols, connectLength } = e.data;
    console.log(`[WORKER] Message received. Difficulty: ${difficulty}`);

    // Make a deep copy to prevent mutation of the original board state during evaluation
    const boardCopy = JSON.parse(JSON.stringify(board));

    const { bestMove, moveScores } = findBestMove(boardCopy, difficulty, { rows, cols, connectLength });

    console.log(`[WORKER] Calculated best move: ${bestMove}. Posting scores back to main thread.`);
    self.postMessage({ bestMove, moveScores });
};

// --- AI Logic and Helper Functions (self-contained in the worker) ---

function findNextOpenRow(board, col, rows) {
    for (let r = rows - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            return r;
        }
    }
    return -1;
}

function checkWinner(board, r, c, player, rules) {
    // This function relies on the (r, c) coordinates of the last piece placed.
    // If the board state is being mutated outside of Minimax correctly, this is fine.
    
    // Check horizontal, vertical, and both diagonals
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        let count = 1;
        
        // Check forward from (r, c)
        for (let i = 1; i < rules.connectLength; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            // The bounds and content check looks correct here
            if (nr >= 0 && nr < rules.rows && nc >= 0 && nc < rules.cols && board[nr][nc] === player) count++; else break;
        }
        
        // Check backward from (r, c)
        for (let i = 1; i < rules.connectLength; i++) {
            const nr = r - dr * i, nc = c - dc * i;
            // The bounds and content check looks correct here
            if (nr >= 0 && nr < rules.rows && nc >= 0 && nc < rules.cols && board[nr][nc] === player) count++; else break;
        }
        
        if (count >= rules.connectLength) return true;
    }
    return false;
}

function getValidMoves(board, cols) {
    const validMoves = [];
    for (let c = 0; c < cols; c++) {
        // Check the top-most row (row 0)
        if (board[0][c] === 0) validMoves.push(c);
    }
    return validMoves;
}

function findBestMove(board, difficulty, rules) {
    const { rows, cols, connectLength } = rules;
    let validMoves = getValidMoves(board, cols);
    if (validMoves.length === 0) return null;

    switch (difficulty) {
        case 'very-easy':
        // For the easiest difficulty, no complex logic is needed.
        return { bestMove: validMoves[Math.floor(Math.random() * validMoves.length)], moveScores: [] };

        case 'easy':
        // A simple heuristic: check for an immediate win, then an immediate block, otherwise move randomly.
        // 1. Check for a winning move for the AI (player 2).
        for (const move of validMoves) {
            const r = findNextOpenRow(board, move, rows);
            board[r][move] = 2;
            if (checkWinner(board, r, move, 2, rules)) { board[r][move] = 0; return { bestMove: move, moveScores: [] }; }
            board[r][move] = 0;
        }
        // 2. Check if the player (player 1) has a winning move, and block it.
        for (const move of validMoves) {
            const r = findNextOpenRow(board, move, rows);
            board[r][move] = 1;
            if (checkWinner(board, r, move, 1, rules)) { board[r][move] = 0; return { bestMove: move, moveScores: [] }; }
            board[r][move] = 0;
        }
        // 3. If no win or block is found, make a random move.
        return { bestMove: validMoves[Math.floor(Math.random() * validMoves.length)], moveScores: [] };

        case 'medium':
        case 'hard':
            const depth = difficulty === 'medium' ? 5 : 6;
            let bestScore = -Infinity;
            let bestMove = validMoves[0];
            const moveScores = [];
            const centerCol = Math.floor(cols / 2);
 
            // OPTIMIZATION: Check moves closer to the center first to improve alpha-beta pruning efficiency.
            validMoves.sort((a, b) => Math.abs(a - centerCol) - Math.abs(b - centerCol));
 
            // Pre-check for immediate win/loss to avoid the expensive minimax search if an obvious move exists.
            for (const move of validMoves) {
                const r = findNextOpenRow(board, move, rows);
                if (r === -1) continue;

                // 1. Check AI Win
                board[r][move] = 2; // AI is player 2
                if (checkWinner(board, r, move, 2, rules)) { board[r][move] = 0; return { bestMove: move, moveScores: [] }; }
                board[r][move] = 0; // Backtrack

                // 2. Check Player Threat (Block)
                board[r][move] = 1; // Simulate player move
                if (checkWinner(board, r, move, 1, rules)) { board[r][move] = 0; return { bestMove: move, moveScores: [] }; }
                board[r][move] = 0; // Backtrack
            }
 
            // No immediate threats found, proceed with the full minimax search.
            for (const move of validMoves) {
                const r = findNextOpenRow(board, move, rows);
                if (r === -1) continue;

                board[r][move] = 2;
                // Minimax with maximum depth and corrected logic
                const score = minimax(board, depth - 1, -Infinity, Infinity, false, rules);
                moveScores.push({ move, score });
                board[r][move] = 0; // Backtrack

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            }
            return { bestMove, moveScores };

        default:
        // Fallback to a random move if the difficulty is not recognized.
        return { bestMove: validMoves[Math.floor(Math.random() * validMoves.length)], moveScores: [] };
    }
}

function scorePosition(board, player, rules) {
    let score = 0;
    const opponent = player === 1 ? 2 : 1;
    const { rows, cols, connectLength } = rules;
 
    // INCREASED VALUE: Prioritize center columns, as they offer more winning opportunities.
    const centerCol = Math.floor(cols / 2);
    for(let r = 0; r < rows; r++) {
        if (board[r][centerCol] === player) score += 15; // Increased weight
        if (board[r][centerCol] === opponent) score -= 5;
    }
 
    // Iterate through the board to score all possible lines (windows) of `connectLength`.
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Horizontal
            if (c <= cols - connectLength) {
                const window = board[r].slice(c, c + connectLength);
                score += evaluateWindow(window, player, rules);
            }
            // Vertical
            if (r <= rows - connectLength) {
                const window = Array.from({ length: connectLength }, (_, i) => board[r + i][c]);
                score += evaluateWindow(window, player, rules);
            }
            // Positive Diagonal
            if (r <= rows - connectLength && c <= cols - connectLength) {
                const window = Array.from({ length: connectLength }, (_, i) => board[r + i][c + i]);
                score += evaluateWindow(window, player, rules);
            }
            // Negative Diagonal
            if (r >= connectLength - 1 && c <= cols - connectLength) {
                const window = Array.from({ length: connectLength }, (_, i) => board[r - i][c + i]);
                score += evaluateWindow(window, player, rules);
            }
        }
    }
    return score;
}

function evaluateWindow(window, player, rules) {
    let score = 0;
    const opponent = player === 1 ? 2 : 1;
    const playerCount = window.filter(p => p === player).length;
    const opponentCount = window.filter(p => p === opponent).length;
    const emptyCount = window.filter(p => p === 0).length;

    // --- AI's Opportunities (Score increases) ---
    if (playerCount === rules.connectLength) {
        score += 10000;
    } else if (playerCount === rules.connectLength - 1 && emptyCount === 1) {
        score += 100; // High value for a winning threat (3-in-a-row)
    } else if (playerCount === rules.connectLength - 2 && emptyCount === 2) {
        score += 10; // Value for building blocks (2-in-a-row)
        if (rules.connectLength === 4 && window[0] === 0 && window[3] === 0) score += 10;
    }

    // --- Penalize opponent's threats (Block/Defend) ---
    if (opponentCount === rules.connectLength) {
        score -= 10000;
    } else if (opponentCount === rules.connectLength - 1 && emptyCount === 1) {
        // CRITICAL TUNING: Maxed out penalty relative to other scores to force a block.
        score -= 100000; 
    } else if (rules.connectLength === 4 && opponentCount === 2 && emptyCount === 2 && window[0] === 0 && window[3] === 0) {
        score -= 200;
    } else if (opponentCount === rules.connectLength - 2 && emptyCount === 2) {
        score -= 15; // Moderate penalty for a developing player threat
    }

    return score;
}

function minimax(board, depth, alpha, beta, maximizingPlayer, rules) {
    const validMoves = getValidMoves(board, rules.cols);

    // Check for terminal state (Draw)
    if (validMoves.length === 0) return 0;

    // Check for Max Depth
    if (depth === 0) {
        // Reached max search depth, return the heuristic score of the current board state.
        return scorePosition(board, 2, rules); // AI is player 2
    }

    if (maximizingPlayer) {
        let value = -Infinity;
        // Sort moves for the maximizing player to check more promising branches first.
        const sortedMoves = validMoves.sort((a, b) => Math.abs(a - Math.floor(rules.cols / 2)) - Math.abs(b - Math.floor(rules.cols / 2)));

        for (const move of sortedMoves) {
            const r = findNextOpenRow(board, move, rules.rows);
            if (r === -1) continue;
            
            board[r][move] = 2; // AI (Maximizing)
            
            // Explicitly check for AI win after making the move.
            if (checkWinner(board, r, move, 2, rules)) {
                board[r][move] = 0; // Backtrack
                // Increased terminal score to guarantee Minimax selects this branch
                return 10000000 + depth; 
            }

            const newValue = minimax(board, depth - 1, alpha, beta, false, rules);
            board[r][move] = 0; // Backtrack
            
            value = Math.max(value, newValue);
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return value;
    } else { // Minimizing player (Opponent)
        let value = Infinity;
        // Sort moves for the minimizing player to check more threatening branches first.
        const sortedMoves = validMoves.sort((a, b) => Math.abs(a - Math.floor(rules.cols / 2)) - Math.abs(b - Math.floor(rules.cols / 2)));

        for (const move of sortedMoves) {
            const r = findNextOpenRow(board, move, rules.rows);
            if (r === -1) continue;

            board[r][move] = 1; // Player (Minimizing)
            
            // Explicitly check for Player win after making the move.
            if (checkWinner(board, r, move, 1, rules)) {
                board[r][move] = 0; // Backtrack
                // Increased terminal score to guarantee Minimax selects this branch
                return -10000000 - depth; 
            }

            const newValue = minimax(board, depth - 1, alpha, beta, true, rules);
            board[r][move] = 0; // Backtrack

            value = Math.min(value, newValue);
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return value;
    }
}