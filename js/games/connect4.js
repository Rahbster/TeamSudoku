//==============================
// Connect 4 Game Logic
//==============================

import { startTimer, stopTimer } from '../timer.js';
import { dom, appState, dataChannels } from '../scripts.js';
import { showWinnerScreen, showToast } from '../ui.js';
import { playRemoteMoveSound, debugLog } from '../misc.js';

// Initialize the AI Web Worker
const aiWorker = new Worker('./js/games/connect4-worker.js');

aiWorker.onmessage = function(e) {
    debugLog('Received message from AI worker:', e.data);
    const { bestMove, moveScores } = e.data;
    if (bestMove !== null) {
        // A short delay to simulate AI thinking
        setTimeout(() => {            
            debugLog(`AI is making a move in column: ${bestMove}`); //This is a comment
            makeSoloMove(bestMove, 2); // AI is always player 2
            displayAiScores(moveScores); // Display the new scores after the AI move
            // Re-enable player input
            document.getElementById('connect4-grid').style.pointerEvents = 'auto';
            findAndHighlightImminentThreats(appState.soloGameState.board);
        }, 1000);
    } else {        
        document.getElementById('connect4-grid').style.pointerEvents = 'auto';
        debugLog('AI worker returned no valid moves.');
    }
};

export function initialize() {
    debugLog("Connect 4 Initialized");

    // Show undo button only for solo standard mode
    if (appState.isInitiator && !appState.playerTeam && dom.connect4ModeSelect.value === 'standard') {
        dom.undoBtn.style.display = '';
        dom.undoBtn.onclick = undoLastMoves;
    } else {
        dom.undoBtn.style.display = 'none';
    }

    // Set the button text for Connect 4
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Game';

    // If we are initializing for a solo game, draw the grid.
    debugLog('Connect4 initialize. Current soloGameState:', JSON.parse(JSON.stringify(appState.soloGameState || null)));
    if (appState.isInitiator && !appState.playerTeam) {
        createGrid();
    }

}

/**
 * Cleans up UI elements specific to Connect 4 when switching games.
 */
export function cleanup() {
    dom.undoBtn.style.display = 'none';
}

export function createGrid() {
    debugLog('Connect4 createGrid called.');
    dom.gameBoardArea.innerHTML = '<div id="connect4-grid"></div>';
    const grid = document.getElementById('connect4-grid');
    grid.innerHTML = '';
    grid.className = 'connect4-grid'; // Set class for Connect 4 styling
    
    const { rows, cols } = getBoardDimensions();
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell empty';
            cell.id = `cell-${r}-${c}`;
            cell.dataset.col = c;
            cell.addEventListener('click', handleCellClick);
            grid.appendChild(cell);
        }
    }

    // For Five-in-a-Row, pre-fill the side columns
    if (appState.soloGameState?.gameMode === 'five-in-a-row') {
        const board = appState.soloGameState.board;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c] !== 0) {
                    const cell = document.getElementById(`cell-${r}-${c}`);
                    cell.classList.remove('empty');
                    cell.classList.add(board[r][c] === 1 ? 'player1' : 'player2');
                }
            }
        }
    }
}

async function handleCellClick(event) {
    if (appState.winner) return; // Game is over, do nothing.

    const col = parseInt(event.target.dataset.col, 10);

    // Handle solo play for the host
    if (appState.isInitiator && !appState.playerTeam) {
        if (!appState.soloGameState) return; // Should not happen, but a good guard

        if (appState.soloGameState.gameMode === 'standard') {
            // --- Standard Player vs. AI Logic ---
            debugLog(`Player is making a move in column: ${col}`);
            const playerMoveSuccessful = makeSoloMove(col, 1); // Player is always 1

            // If player's move was valid, the game isn't over, and no one is connected, let the AI take a turn.
            if (playerMoveSuccessful && !appState.winner && dataChannels.length === 0) {
                clearAiScores(); // Clear old scores before AI thinks
                // Check for threats immediately after the player's move.
                findAndHighlightImminentThreats(appState.soloGameState.board);

                // Disable player input while AI is "thinking"
                document.getElementById('connect4-grid').style.pointerEvents = 'none';
                // Offload the AI move calculation to the Web Worker
                debugLog(`Posting board to AI worker. Difficulty: ${appState.soloGameState.difficulty}`);
                aiWorker.postMessage({
                    board: appState.soloGameState.board,
                    difficulty: appState.soloGameState.difficulty,
                    gameMode: appState.soloGameState.gameMode,
                    ...getGameRules(appState.soloGameState.gameMode)
                });
            }
        } else {
            // --- Cooperative Sabotage Logic (Solo) ---
            const playerMoveSuccessful = makeSoloSabotageMove(col, 1);

            if (playerMoveSuccessful && !appState.winner) {
                document.getElementById('connect4-grid').style.pointerEvents = 'none';
                setTimeout(() => {
                    // Pass a deep copy of the board to the AI to prevent state mutation.
                    const aiColumn = findBestSabotageMove(JSON.parse(JSON.stringify(appState.soloGameState.board)));
                    if (aiColumn !== null) {
                        makeSoloSabotageMove(aiColumn, 2); // AI is player 2
                    } else {
                        // This means the AI is trapped and has no safe moves, so the player wins.
                        // This is an advanced case, for now we assume a move is always possible.
                        console.log("AI is trapped! Player wins.");
                        showWinnerScreen('all');
                    }
                    document.getElementById('connect4-grid').style.pointerEvents = 'auto';
                }, 500);
            }
        }

        return; // End execution for solo move.
    }

    // --- Team Play Logic ---
    if (!appState.playerTeam) return; // If not solo and not in a team, do nothing.

    const team = appState.teams[appState.playerTeam];
    if (team.gameState.turn !== appState.playerTeam) {
        console.log("Not your team's turn!");
        return;
    }

    const move = {
        type: 'move',
        game: 'connect4',
        team: appState.playerTeam,
        col: col,
        playerId: appState.playerId,
        sessionId: appState.sessionId
    };

    if (appState.isInitiator) {
        processMove(move);
    } else {
        if (dataChannels.length > 0 && dataChannels[0].readyState === 'open') {
            dataChannels[0].send(JSON.stringify(move));
        }
    }
}

export function updateGridForTeam(teamName) {
    const team = appState.teams[teamName];
    if (!team || team.gameType !== 'connect4') return;

    // If gameState is null, it means the host needs to create it.
    if (!team.gameState && appState.isInitiator) {
        team.gameState = getInitialState();
        // The first turn goes to the team that was created first.
        team.gameState.turn = Object.keys(appState.teams)[0];
    }

    createGrid(); // Recreate grid to ensure correct structure
    if (team.gameState) {
        const board = team.gameState.board;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = document.getElementById(`cell-${r}-${c}`);
                if (board[r][c]) {
                    cell.classList.remove('empty');
                    cell.classList.add(board[r][c] === 1 ? 'player1' : 'player2');
                }
            }
        }
    }
}

export function getInitialState(difficulty) {
    const gameMode = dom.connect4ModeSelect.value;
    const rules = getGameRules(gameMode);
    const board = Array(rules.rows).fill(null).map(() => Array(rules.cols).fill(0));

    // Pre-fill board for Five-in-a-Row
    if (gameMode === 'five-in-a-row') {
        for (let r = 0; r < rules.rows; r++) {
            // Left-most column
            board[r][0] = (r % 2 === 0) ? 2 : 1; // Player 2 (Red/AI), Player 1 (Yellow/Human)
            // Right-most column
            board[r][rules.cols - 1] = (r % 2 === 0) ? 1 : 2;
        }
    }

    // Calculate initial moves for Five-in-a-Row
    const initialMoves = (gameMode === 'five-in-a-row') ? rules.rows * 2 : 0;

    return {
        board: board,
        moveHistory: [], // To store {r, c} of moves for undo
        moves: initialMoves,
        difficulty: difficulty || 'medium',
        gameMode: gameMode || 'standard', // Default to standard
        turn: null, // Host will set this
        players: {} // Maps teamName to player number (1 or 2)
    };
}

/**
 * Gets the rules for a specific game mode.
 * @param {string} gameMode - The selected game mode.
 * @returns {{rows: number, cols: number, connectLength: number}}
 */
function getGameRules(gameMode) {
    if (gameMode === 'five-in-a-row') {
        return { rows: 6, cols: 9, connectLength: 5 };
    }
    // Default to standard rules
    return { rows: 6, cols: 7, connectLength: 4 };
}

/**
 * Resets the Connect 4 game board.
 * This function is called by the game_manager's loadPuzzle.
 */
export function loadPuzzle() {
    debugLog('Connect4 loadPuzzle called.');

    appState.winner = null;
    startTimer();
    if (appState.playerTeam) {
        const team = appState.teams[appState.playerTeam];
        team.gameState = getInitialState(team.difficulty, team.gameMode);
        updateGridForTeam(appState.playerTeam);
    } else if (appState.isInitiator) {
        appState.soloGameState = getInitialState(dom.difficultySelector.value, dom.connect4ModeSelect.value);
        createGrid();
        clearAiScores();
    }
}

export function processMove(moveData) {
    // This function is called by the host to process a move
    const teamName = moveData.team;
    const team = appState.teams[teamName];
    if (!team || team.gameType !== 'connect4' || team.gameState.turn !== teamName) return;

    // --- Standard (Competitive) vs. Sabotage (Co-op) Logic ---
    if (team.gameState.gameMode === 'standard') {
        processStandardMove(moveData);
    } else {
        processSabotageMove(moveData);
    }
}

/**
 * Processes a move for the cooperative "Sabotage" game mode.
 */
function processSabotageMove(moveData) {
    const teamName = moveData.team;
    const team = appState.teams[teamName];
    const board = team.gameState.board;
    const col = moveData.col;
    const row = findNextOpenRow(board, col);

    if (row !== -1) { // If the column is not full
        const playerNumber = team.gameState.players[teamName];
        board[row][col] = playerNumber;
        team.gameState.moves++;

        const line = checkForAnyLine(board, row, col);
        let winner = null; // Sabotage mode doesn't have a "winner", only a loser or co-op win
        let loser = null;
        let nextTurn = null;

        if (line) {
            loser = teamName;
            appState.winner = 'lost';
        } else if (team.gameState.moves === ROWS * COLS) {
            winner = 'all'; // Co-op win
            appState.winner = 'all';
        } else {
            const allTeams = Object.keys(appState.teams).filter(t => appState.teams[t].gameType === 'connect4');
            const currentTurnIndex = allTeams.indexOf(teamName);
            nextTurn = allTeams[(currentTurnIndex + 1) % allTeams.length];
            team.gameState.turn = nextTurn;
        }

        const moveUpdate = {
            type: 'move-update',
            game: 'connect4',
            row: row,
            col: col,
            playerNumber: playerNumber,
            nextTurn: nextTurn,
            winner: winner,
            loser: loser,
            sessionId: moveData.sessionId
        };

        const message = JSON.stringify(moveUpdate);
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') channel.send(message);
        });
        processUIUpdate(moveUpdate);

        if (winner || loser) {
            handleGameOver(line, winner, loser);
        }
    }
}

/**
 * Processes a move for the standard competitive game mode.
 */
function processStandardMove(moveData) {
    const teamName = moveData.team;
    const team = appState.teams[teamName];
    const board = team.gameState.board;
    const col = moveData.col;
    const row = findNextOpenRow(board, col);

    if (row !== -1) { // If the column is not full
        const playerNumber = team.gameState.players[teamName];
        board[row][col] = playerNumber;
        team.gameState.moves++;
        const rules = getGameRules(team.gameState.gameMode);

        const line = checkWinner(board, row, col, playerNumber, rules);
        let winner = null;
        let nextTurn = null;

        if (line) { // A winning line was found
            winner = teamName;
            appState.winner = teamName;
        } else if (team.gameState.moves === ROWS * COLS) {
            winner = 'tie'; // It's a tie
            appState.winner = 'tie';
        } else {
            const allTeams = Object.keys(appState.teams).filter(t => appState.teams[t].gameType === 'connect4');
            const currentTurnIndex = allTeams.indexOf(teamName);
            nextTurn = allTeams[(currentTurnIndex + 1) % allTeams.length];
            team.gameState.turn = nextTurn;
        }

        const moveUpdate = {
            type: 'move-update',
            game: 'connect4',
            row: row,
            col: col,
            playerNumber: playerNumber,
            nextTurn: nextTurn,
            winner: winner,
            sessionId: moveData.sessionId
        };

        const message = JSON.stringify(moveUpdate);
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') channel.send(message);
        });
        processUIUpdate(moveUpdate); // Host updates its own UI

        if (winner) {
            handleGameOver(line, winner, null);
        }
    }
}

export function processUIUpdate(data) {
    const cell = document.getElementById(`cell-${data.row}-${data.col}`);
    if (cell) {
        cell.classList.remove('empty');
        cell.classList.add(`player${data.playerNumber}`);
        if (data.sessionId !== appState.sessionId) {
            playRemoteMoveSound();
        }
    }
    // Update game state for all clients
    const team = appState.teams[appState.playerTeam];
    if (team && team.gameType === 'connect4') {
        team.gameState.turn = data.nextTurn;
        if (data.winner) { // 'all', 'tie', or teamName
            appState.winner = data.winner;
        } else if (data.loser) { // teamName
            appState.winner = 'lost'; // Mark game as over
        }
    }
}

function checkWinner(board, r, c, player, rules) {
    const { rows, cols, connectLength } = rules;
    // Check horizontal, vertical, and both diagonals
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        const line = [{ r, c }];
        // Check in one direction
        for (let i = 1; i < connectLength; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === player) {
                line.push({ r: nr, c: nc });
            } else {
                break;
            }
        }
        // Check in the opposite direction
        for (let i = 1; i < connectLength; i++) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === player) {
                line.push({ r: nr, c: nc });
            } else {
                break;
            }
        }
        if (line.length >= 4) return line;
    }
    return null;
}

/**
 * Executes a move for a player in solo mode and updates the UI.
 * @param {number} col - The column to play in.
 * @param {number} playerNumber - The player making the move (1 for human, 2 for AI).
 * @returns {boolean} - True if the move was successful, false otherwise.
 */
function makeSoloMove(col, playerNumber) {
    const board = appState.soloGameState.board;
    const rules = getGameRules(appState.soloGameState.gameMode);
    const row = findNextOpenRow(board, col);

    if (row !== -1) {
        board[row][col] = playerNumber;
        appState.soloGameState.moveHistory.push({ r: row, c: col });
        appState.soloGameState.moves++;

        const cell = document.getElementById(`cell-${row}-${col}`);
        cell.classList.remove('empty');
        cell.classList.add(`player${playerNumber}`);

        // Check for win/loss in solo mode
        const line = checkWinner(board, row, col, playerNumber, rules);
        if (line) {
            if (playerNumber === 1) {
                handleGameOver(line, 'You', null); // Human wins
            } else {
                handleGameOver(line, null, 'The Computer'); // AI wins
            }
        } else if (appState.soloGameState.moves === rules.rows * rules.cols) {
            clearThreatHighlights(); // Clear any highlights on a tie
            showWinnerScreen('tie'); // It's a tie
        }
        return true; // Move was successful
    }
    return false; // Column was full
}

/**
 * Executes a move for a player in solo Sabotage mode and updates the UI.
 * @param {number} col - The column to play in.
 * @param {number} playerNumber - The player making the move (1 for human, 2 for AI).
 * @returns {boolean} - True if the move was successful, false otherwise.
 */
function makeSoloSabotageMove(col, playerNumber) {
    const board = appState.soloGameState.board;
    const rules = getGameRules(appState.soloGameState.gameMode);
    const row = findNextOpenRow(board, col);

    if (row !== -1) {
        board[row][col] = playerNumber;
        appState.soloGameState.moveHistory.push({ r: row, c: col });
        appState.soloGameState.moves++;

        const cell = document.getElementById(`cell-${row}-${col}`);
        cell.classList.remove('empty');
        cell.classList.add(`player${playerNumber}`);

        const line = checkForAnyLine(board, row, col);
        if (line) {
            const loser = playerNumber === 1 ? 'You' : 'The Computer';
            handleGameOver(line, null, loser);
        } else if (appState.soloGameState.moves === rules.rows * rules.cols) {
            showWinnerScreen('all'); // You both won
        }
        return true;
    }
    return false;
}

/**
 * Reverts the last two moves (player and AI) in a solo game.
 */
function undoLastMoves() {
    // Prevent undoing if the game is already over.
    if (appState.winner) {
        showToast("Cannot undo after the game is over.", "error");
        return;
    }

    const gameState = appState.soloGameState;
    if (!gameState || gameState.moveHistory.length < 2) {
        showToast("Not enough moves to undo.", "info");
        return;
    }

    // Stop any AI move that might be in progress
    dom.sudokuGrid.style.pointerEvents = 'auto';

    // Revert the last two moves
    for (let i = 0; i < 2; i++) {
        const lastMove = gameState.moveHistory.pop();
        if (lastMove) {
            const { r, c } = lastMove;
            // Update the board state
            gameState.board[r][c] = 0;
            gameState.moves--;

            // Update the UI
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell) {
                cell.className = 'grid-cell empty';
            }
        }
    }

    // Clear any win/loss state and threat highlights
    appState.winner = null;
    clearAiScores();
    clearThreatHighlights();
}

/**
 * Finds the next available row in a given column.
 * @param {number[][]} board - The game board.
 * @param {number} col - The column to check.
 * @returns {number} - The row index, or -1 if the column is full.
 */
function findNextOpenRow(board, col) {
    const rows = board.length;
    for (let r = rows - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            return r;
        }
    }
    return -1; // Column is full
}

/**
 * AI logic for Sabotage mode. Finds a valid move that doesn't lose the game.
 * @param {number[][]} board - The current game board.
 * @returns {number|null} - A safe column to play, or null if no safe moves exist.
 */
function findBestSabotageMove(board) {
    const cols = board[0].length;
    const safeMoves = [];
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            // Check if placing a piece here for player 2 (AI) creates a line
            board[r][c] = 2;
            const aiLoses = checkForAnyLine(board, r, c);
            board[r][c] = 0; // Backtrack

            if (!aiLoses) {
                safeMoves.push(c);
            }
        }
    }

    if (safeMoves.length > 0) {
        // Pick a random move from the safe ones
        return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    }

    // If no safe moves, the AI is trapped and will lose. Return any valid move.
    const anyValidMove = findNextOpenRow(board, 0) !== -1 ? 0 : findNextOpenRow(board, 1) !== -1 ? 1 : null; // etc.
    return anyValidMove;
}

/**
 * Checks if the last move at (r, c) created a 4-in-a-row for ANY player.
 * @param {number[][]} board - The game board.
 * @param {number} r - The row of the last move.
 * @param {number} c - The column of the last move.
 * @returns {boolean} - True if a line was formed, false otherwise.
 */
function checkForAnyLine(board, r, c) {
    // This function is only used for Sabotage mode now.
    // Standard mode uses checkWinner which returns the line.
    const rules = getGameRules('standard'); // Sabotage always uses standard 4-in-a-row rules
    const player = board[r][c];
    if (player === 0) return false;

    // We can just reuse checkWinner, as it checks for a line for the specified player.
    return checkWinner(board, r, c, player, rules);
}

/**
 * Handles the end of a game by blinking winning cells and showing the modal.
 * @param {Array<{r: number, c: number}>} line - The array of cells forming the line.
 * @param {string|null} winner - The winning team/player.
 * @param {string|null} loser - The losing team/player.
 */
function handleGameOver(line, winner, loser) {
    // Set the winner state immediately to prevent any further moves (like the AI's turn).
    if (winner) appState.winner = winner;
    if (loser) appState.winner = 'lost'; // A generic state to indicate the game is over.

    // Disable further moves immediately
    const grid = document.getElementById('connect4-grid');
    if (grid) grid.style.pointerEvents = 'none';

    if (line) {
        line.forEach(cell => {
            const domCell = document.getElementById(`cell-${cell.r}-${cell.c}`);
            if (domCell) {
                domCell.classList.add('winning-cell-blink');
            }
        });
    }

    // Wait for the animation to finish before showing the modal
    setTimeout(() => {
        // For team games, the host sends the final game over message
        if (appState.isInitiator && appState.playerTeam) {
            const gameOverMessage = { type: 'game-over', winningTeam: winner, losingTeam: loser };
            // Also send the winning line so clients can blink it
            if (line) {
                gameOverMessage.line = line;
            }
            const messageString = JSON.stringify(gameOverMessage);
            dataChannels.forEach(channel => {
                if (channel.readyState === 'open') channel.send(messageString);
            });
        }

        // All clients (and solo host) show the winner screen
        showWinnerScreen(winner, loser);

        // Clean up the blinking class
        if (line) {
            line.forEach(cell => document.getElementById(`cell-${cell.r}-${cell.c}`)?.classList.remove('winning-cell-blink'));
        }
    }, 3000); // 3 seconds, matching the animation duration
}

/**
 * Finds and highlights unstoppable threats on the board.
 * @param {number[][]} board - The current game board.
 */
function findAndHighlightImminentThreats(board) {
    if (appState.soloGameState.gameMode !== 'standard') return; // Only for standard mode
    clearThreatHighlights();

    // Check for player's imminent victory
    const playerThreats = findWinningThreats(board, 1);
    if (playerThreats.length > 0) {
        playerThreats.forEach(cell => {
            const domCell = document.getElementById(`cell-${cell.r}-${cell.c}`);
            if (domCell) domCell.classList.add('imminent-victory-cell');
        });
    }

    // Check for AI's imminent victory (player's imminent defeat)
    const aiThreats = findWinningThreats(board, 2);
    if (aiThreats.length > 0) {
        aiThreats.forEach(cell => {
            const domCell = document.getElementById(`cell-${cell.r}-${cell.c}`);
            if (domCell) domCell.classList.add('imminent-defeat-cell');
        });
    }
}

/**
 * Finds columns that would result in a win for the given player.
 * @param {number[][]} board - The game board.
 * @param {number} playerNum - The player to check for (1 or 2).
 * @returns {Array<{r: number, c: number}>} - An array of cells that are part of winning threats.
 */
function findWinningThreats(board, playerNum) {
    const rules = getGameRules('standard');
    const cols = board[0].length;
    const winningMoves = [];
    for (let c = 0; c < cols; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = playerNum; // Temporarily make the move
            const line = checkWinner(board, r, c, playerNum, rules);
            if (line) {
                winningMoves.push({ col: c, line: line });
            }
            board[r][c] = 0; // Backtrack
        }
    }

    // If there are 2 or more ways to win, it's an unstoppable threat.
    if (winningMoves.length >= 2) {
        // Return all cells involved in all winning threats.
        const allThreatCells = winningMoves.flatMap(move => move.line);
        return allThreatCells;
    }

    return [];
}

/**
 * Removes all threat-related highlight classes from the grid.
 */
function clearThreatHighlights() {
    document.querySelectorAll('.connect4-grid .grid-cell').forEach(cell => {
        cell.classList.remove('imminent-victory-cell', 'imminent-defeat-cell');
    });
}

/**
 * Gets the board dimensions from the current game state.
 * @returns {{rows: number, cols: number}}
 */
function getBoardDimensions() {
    const board = appState.soloGameState?.board || appState.teams[appState.playerTeam]?.gameState?.board;
    if (board) return { rows: board.length, cols: board[0].length };
    return { rows: 6, cols: 7 }; // Fallback
}

/**
 * Displays the AI's calculated scores for each valid move on the board.
 * @param {Array<{move: number, score: number}>} moveScores - An array of moves and their scores.
 */
function displayAiScores(moveScores) {
    clearAiScores(); // Clear any previous scores
    if (!moveScores || moveScores.length === 0) return;

    const board = appState.soloGameState.board;
    const grid = dom.sudokuGrid;

    moveScores.forEach(({ move, score }) => {
        const col = move;
        const row = findNextOpenRow(board, col);

        if (row !== -1) {
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'ai-score-display';
            scoreDiv.textContent = score.toLocaleString(); // Format large numbers
            
            // Position the score in the top-most empty cell of the column
            scoreDiv.style.gridRowStart = row + 1;
            scoreDiv.style.gridColumnStart = col + 1;

            grid.appendChild(scoreDiv);
        }
    });
}

/**
 * Removes all AI score displays from the board.
 */
function clearAiScores() {
    document.querySelectorAll('.ai-score-display').forEach(el => el.remove());
}