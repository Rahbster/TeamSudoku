//==============================
// Connect 4 Game Logic
//==============================

import { dom, appState, dataChannels } from '../scripts.js';
import { showWinnerScreen } from '../ui.js';
import { playRemoteMoveSound } from '../misc.js';

const ROWS = 6;
const COLS = 7;

export function initialize() {
    console.log("Connect 4 Initialized");
    // Hide UI elements not used by Connect 4
    dom.numberPad.classList.add('hidden');
    dom.pencilButton.classList.add('hidden');
    document.querySelectorAll('.host-only').forEach(el => {
        if (el.id === 'difficulty-select') {
            el.style.display = 'none';
        }
        if (el.id === 'new-puzzle-btn') {
            el.style.display = ''; // Show the button
        }
    });

    // Set the button text for Connect 4
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Game';
}

/**
 * Cleans up UI elements specific to Connect 4 when switching games.
 */
export function cleanup() {
    console.log("Connect 4 Cleanup");
    // Nothing to clean up for Connect 4 at the moment.
}

export function createGrid() {
    dom.sudokuGrid.innerHTML = '';
    dom.sudokuGrid.className = 'connect4-grid'; // Set class for Connect 4 styling

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell empty';
            cell.id = `cell-${r}-${c}`;
            cell.dataset.col = c;
            cell.addEventListener('click', handleCellClick);
            dom.sudokuGrid.appendChild(cell);
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
            const playerMoveSuccessful = makeSoloMove(col, 1); // Player is always 1

            // If player's move was valid and the game isn't over, let the AI take a turn.
            if (playerMoveSuccessful && !appState.winner) {
                dom.sudokuGrid.style.pointerEvents = 'none';
                setTimeout(() => {
                    const aiColumn = findBestMove(appState.soloGameState.board);
                    if (aiColumn !== null) {
                        makeSoloMove(aiColumn, 2); // AI is always 2
                    }
                    dom.sudokuGrid.style.pointerEvents = 'auto';                    
                }, 500);
            }
        } else {
            // --- Cooperative Sabotage Logic (Solo) ---
            const board = appState.soloGameState.board;
            const row = findNextOpenRow(board, col);
            if (row !== -1) {
                board[row][col] = 1; // Player is always 1
                appState.soloGameState.moves++;
                const cell = document.getElementById(`cell-${row}-${col}`);
                cell.classList.remove('empty');
                cell.classList.add('player1');

                const line = checkForAnyLine(board, row, col);
                if (line) {
                    handleGameOver(line, null, 'You'); // You lost
                } else if (appState.soloGameState.moves === ROWS * COLS) {
                    showWinnerScreen('all'); // You won
                }
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

export function getInitialState(difficulty, gameMode) {
    return {
        board: Array(ROWS).fill(null).map(() => Array(COLS).fill(0)),
        moves: 0,
        gameMode: gameMode || 'standard', // Default to standard
        turn: null, // Host will set this
        players: {} // Maps teamName to player number (1 or 2)
    };
}

/**
 * Resets the Connect 4 game board.
 * This function is called by the game_manager's loadPuzzle.
 */
export function loadPuzzle() {
    appState.winner = null;
    if (appState.playerTeam) {
        const team = appState.teams[appState.playerTeam];
        team.gameState = getInitialState(team.difficulty, team.gameMode);
        updateGridForTeam(appState.playerTeam);
    } else if (appState.isInitiator) {
        appState.soloGameState = getInitialState(null, dom.connect4ModeSelect.value);
        createGrid();
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
        let winner = null;
        let loser = null;
        let nextTurn = null;

        if (line) {
            loser = teamName;
            appState.winner = 'lost';
        } else if (team.gameState.moves === ROWS * COLS) {
            winner = 'all';
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

        const line = checkWinner(board, row, col, playerNumber);
        let winner = null;
        let nextTurn = null;

        if (line) {
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

function checkWinner(board, r, c, player) {
    // Check horizontal, vertical, and both diagonals
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        let count = 1;
        const line = [{ r, c }];
        // Check in one direction
        for (let i = 1; i < 4; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                count++;
                line.push({ r: nr, c: nc });
            } else {
                break;
            }
        }
        // Check in the opposite direction
        for (let i = 1; i < 4; i++) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                count++;
                line.push({ r: nr, c: nc });
            } else {
                break;
            }
        }
        if (count >= 4) return line;
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
    const row = findNextOpenRow(board, col);

    if (row !== -1) {
        board[row][col] = playerNumber;
        appState.soloGameState.moves++;

        const cell = document.getElementById(`cell-${row}-${col}`);
        cell.classList.remove('empty');
        cell.classList.add(`player${playerNumber}`);

        // Check for win/loss in solo mode
        const line = checkWinner(board, row, col, playerNumber);
        if (line) {
            if (playerNumber === 1) {
                handleGameOver(line, 'You', null); // Human wins
            } else {
                handleGameOver(line, null, 'The Computer'); // AI wins
            }
        } else if (appState.soloGameState.moves === ROWS * COLS) {
            clearThreatHighlights(); // Clear any highlights on a tie
            showWinnerScreen('tie'); // It's a tie
        }
        return true; // Move was successful
    }
    return false; // Column was full
}

/**
 * Finds the next available row in a given column.
 * @param {number[][]} board - The game board.
 * @param {number} col - The column to check.
 * @returns {number} - The row index, or -1 if the column is full.
 */
function findNextOpenRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            return r;
        }
    }
    return -1; // Column is full
}

/**
 * Simple AI logic to determine the best move.
 * 1. Check for a winning move.
 * 2. Check to block the player's winning move.
 * 3. Pick a random valid column.
 * @param {number[][]} board - The current game board.
 * @returns {number|null} - The best column to play, or null if no moves are possible.
 */
function findBestMove(board) {
    // 1. Check if AI (Player 2) can win in the next move
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = 2; // Temporarily make the move
            if (checkWinner(board, r, c, 2)) {
                board[r][c] = 0; // Backtrack
                return c; // Winning move
            }
            board[r][c] = 0; // Backtrack
        }
    }

    // 2. Check if Player 1 can win in the next move, and block them
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = 1; // Temporarily make the move for the player
            if (checkWinner(board, r, c, 1)) {
                board[r][c] = 0; // Backtrack
                return c; // Blocking move
            }
            board[r][c] = 0; // Backtrack
        }
    }

    // 3. Fallback: pick a random valid column
    const validMoves = [];
    for (let c = 0; c < COLS; c++) {
        if (board[0][c] === 0) { // Check if column is not full
            validMoves.push(c);
        }
    }

    if (validMoves.length > 0) {
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    return null; // No possible moves
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
    const player = board[r][c];
    if (player === 0) return false;

    // We can just reuse checkWinner, as it checks for a line for the specified player.
    return checkWinner(board, r, c, player);
}

/**
 * Handles the end of a game by blinking winning cells and showing the modal.
 * @param {Array<{r: number, c: number}>} line - The array of cells forming the line.
 * @param {string|null} winner - The winning team/player.
 * @param {string|null} loser - The losing team/player.
 */
function handleGameOver(line, winner, loser) {
    // Disable further moves immediately
    // Set the winner state immediately to prevent any further moves (like the AI's turn).
    if (winner) {
        appState.winner = winner;
    } else if (loser) {
        appState.winner = 'lost'; // A generic state to indicate the game is over.
    }

    dom.sudokuGrid.style.pointerEvents = 'none';

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
        if (line) line.forEach(cell => document.getElementById(`cell-${cell.r}-${cell.c}`)?.classList.remove('winning-cell-blink'));
        // Re-enable clicks for a new game, but only if the modal isn't up.
        // The 'New Game' button will handle pointer events from here.
        if (!document.querySelector('.modal:not(.hidden)')) {
            dom.sudokuGrid.style.pointerEvents = 'auto';
        }
    }, 3000); // 3 seconds, matching the animation duration
}

/**
 * Finds and highlights unstoppable threats on the board.
 * @param {number[][]} board - The current game board.
 */
function findAndHighlightImminentThreats(board) {
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
    const winningMoves = [];
    for (let c = 0; c < COLS; c++) {
        const r = findNextOpenRow(board, c);
        if (r !== -1) {
            board[r][c] = playerNum; // Temporarily make the move
            const line = checkWinner(board, r, c, playerNum);
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