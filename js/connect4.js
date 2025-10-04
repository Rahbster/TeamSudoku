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
        if (el.id === 'difficulty-select' || el.id === 'new-puzzle-btn') {
            el.style.display = 'none';
        }
    });
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

function handleCellClick(event) {
    if (appState.winner) return; // Game is over

    const col = parseInt(event.target.dataset.col, 10);
    const team = appState.teams[appState.playerTeam];

    // It must be this team's turn to make a move
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

export function getInitialState() {
    return {
        board: Array(ROWS).fill(null).map(() => Array(COLS).fill(0)),
        turn: null, // Host will set this
        players: {} // Maps teamName to player number (1 or 2)
    };
}

export function processMove(moveData) {
    // This function is called by the host to process a move
    const teamName = moveData.team;
    const team = appState.teams[teamName];
    if (!team || team.gameType !== 'connect4' || team.gameState.turn !== teamName) return;

    const board = team.gameState.board;
    const col = moveData.col;

    // Find the first empty row in the column
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) {
            row = r;
            break;
        }
    }

    if (row !== -1) { // If the column is not full
        const playerNumber = team.gameState.players[teamName];
        board[row][col] = playerNumber;

        // Check for a winner
        const winner = checkWinner(board, row, col, playerNumber);

        // Determine next turn (find the other team)
        const allTeams = Object.keys(appState.teams).filter(t => appState.teams[t].gameType === 'connect4');
        const currentTurnIndex = allTeams.indexOf(teamName);
        const nextTurnIndex = (currentTurnIndex + 1) % allTeams.length;
        team.gameState.turn = allTeams[nextTurnIndex];

        const moveUpdate = {
            type: 'move-update',
            game: 'connect4',
            team: teamName,
            row: row,
            col: col,
            playerNumber: playerNumber,
            nextTurn: team.gameState.turn,
            winner: winner ? teamName : null,
            sessionId: moveData.sessionId
        };

        const message = JSON.stringify(moveUpdate);
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') channel.send(message);
        });
        processUIUpdate(moveUpdate); // Host updates its own UI

        if (winner) {
            const gameOverMessage = { type: 'game-over', winningTeam: teamName };
            const messageString = JSON.stringify(gameOverMessage);
            dataChannels.forEach(channel => {
                if (channel.readyState === 'open') channel.send(messageString);
            });
            showWinnerScreen(teamName);
        }
    }
}

export function processUIUpdate(data) {
    const cell = document.getElementById(`cell-${data.row}-${data.col}`);
    if (cell) {
        cell.classList.remove('empty');
        cell.classList.add(data.playerNumber === 1 ? 'player1' : 'player2');
        if (data.sessionId !== appState.sessionId) {
            playRemoteMoveSound();
        }
    }
    // Update game state for all clients
    const team = appState.teams[appState.playerTeam];
    if (team && team.gameType === 'connect4') {
        team.gameState.turn = data.nextTurn;
        if (data.winner) {
            appState.winner = data.winner;
        }
    }
}

function checkWinner(board, r, c, player) {
    // Check horizontal, vertical, and both diagonals
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
        let count = 1;
        // Check in one direction
        for (let i = 1; i < 4; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === player) {
                count++;
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
            } else {
                break;
            }
        }
        if (count >= 4) return true;
    }
    return false;
}