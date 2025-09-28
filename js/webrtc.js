//==============================
//WebRTC and Signaling Logic
//==============================

import { appState, dom, dataChannels } from './scripts.js';
import { loadPuzzle, checkGridState, updateGridForTeam } from './game.js';
import { hideSignalingUI, showTeamSelection, updateTeamList, showWinnerScreen, showToast } from './ui.js';
import { playRemoteMoveSound } from './misc.js';

//Initializes the WebRTC PeerConnection
export function initializeWebRTC() {
    const connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    connection.onicecandidate = event => {
        if (event.candidate) {
            console.log('New ICE candidate:', event.candidate);
        }
    };

    connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') {
            console.log('WebRTC connection established!');
            if (!appState.isInitiator) {
                // Don't hide the entire signaling area, just show the team selection part.
                showTeamSelection();
            }
        }
    };

    connection.ondatachannel = event => {
        const channel = event.channel;
        setupDataChannel(channel);
    };

    return connection;
}

//Sets up the event handlers for the data channel
function setupDataChannel(channel) {
    channel.onopen = async () => {
        console.log('Data Channel is open!');
        dom.p1Status.textContent = 'Status: Connected!';
        dom.p2Status.textContent = 'Status: Connected!';
        dom.p1QrStatus.textContent = 'Status: Connected!';
        dom.p2QrStatus.textContent = 'Status: Connected!';
        dataChannels.push(channel); // Store the new channel
        if (appState.isInitiator) {
            showTeamSelection();
            let currentPuzzleState = appState.initialSudokuState;
            // If this is the first connection, the host should load the puzzle.
            if (dataChannels.length === 1) {
                currentPuzzleState = await loadPuzzle(appState.selectedDifficulty); // Await the puzzle generation
            }

            // When a new player connects, send them the initial puzzle state and the current list of teams.
            const puzzleMessage = {
                type: 'initial-state',
                state: currentPuzzleState // Use the generated puzzle directly
            };
            channel.send(JSON.stringify(puzzleMessage));

            // Also send the current list of teams to the new player.
            const teamListMessage = {
                type: 'team-list-update',
                teams: Object.keys(appState.teams)
            };
            channel.send(JSON.stringify(teamListMessage));
        }
    };

    channel.onmessage = handleIncomingMessage;
}

/**
 * Broadcasts a message to all connected joiners and processes the message for the host's own UI.
 * @param {object} data - The data object to be stringified and sent.
 */
function broadcast(data) {
    const message = JSON.stringify(data);
    
    // Send to all connected joiners
    dataChannels.forEach(channel => {
        if (channel.readyState === 'open') {
            channel.send(message);
        }
    });

    // The host must also process the event for its own UI.
    if (appState.isInitiator) {
        if (data) processBroadcastForUI(data);
    }
}

/**
 * Processes a move, updates the host's state, and broadcasts the update.
 * This is the authoritative function for all moves.
 * @param {object} moveData - The move data object.
 */
export function processAndBroadcastMove(moveData) {
    if (!appState.isInitiator) return;

    const team = appState.teams[moveData.team];
    if (team) {
        // 1. Update the authoritative state
        team.puzzle[moveData.row][moveData.col] = moveData.value === '' ? 0 : moveData.value;

        // 2. Broadcast the update to all clients (including the host)
        const moveUpdate = { type: 'move-update', team: moveData.team, row: moveData.row, col: moveData.col, value: moveData.value, playerId: moveData.playerId, sessionId: moveData.sessionId };
        broadcast(moveUpdate);
    }
}

/**
 * Broadcasts a cell selection to all clients.
 * @param {object} selectData - The cell selection data.
 */
export function broadcastCellSelection(selectData) {
    if (!appState.isInitiator) return;

    // The data is already in the correct format, just broadcast it.
    const message = { type: 'cell-select', team: selectData.team, row: selectData.row, col: selectData.col, playerId: selectData.playerId, sessionId: selectData.sessionId };
    broadcast(message);
}

/**
 * Handles incoming messages from Joiners. This function is only executed by the Host.
 * @param {MessageEvent} event - The message event from a data channel.
 */
export function handleIncomingMessage(event) {
    const data = JSON.parse(event.data);

    // If this client is a joiner, it only needs to process UI updates.
    if (!appState.isInitiator) {
        processBroadcastForUI(data);
        return;
    }

    // The rest of this function is HOST-ONLY logic for processing requests.
    switch (data.type) {
        case 'create-team':
            if (!appState.teams[data.teamName]) {
                broadcast({ type: 'team-list-update', teams: Object.keys(appState.teams) });
            }
            break;
        case 'join-team':
            // Add player to team and send them the current team puzzle state
            const joiningPlayerId = data.playerId;
            const newTeamName = data.teamName;

            // Check if the player was on a different team before
            let oldTeamName = null;
            for (const team in appState.teams) {
                const memberIndex = appState.teams[team].members.indexOf(joiningPlayerId);
                if (memberIndex > -1) {
                    oldTeamName = team;
                    appState.teams[team].members.splice(memberIndex, 1); // Remove from old team
                    break;
                }
            }

            // Notify the old team that the player has left
            if (oldTeamName && oldTeamName !== newTeamName) {
                broadcast({ type: 'player-left-team', teamName: oldTeamName, playerId: joiningPlayerId });
            }

            // Add player to the new team
            if (appState.teams[newTeamName] && !appState.teams[newTeamName].members.includes(joiningPlayerId)) {
                appState.teams[newTeamName].members.push(joiningPlayerId);
            }

            // Send the puzzle state to the joining player
            const playerChannel = dataChannels.find(c => c.label === event.target.label);
            if (playerChannel) {
                const teamStateMessage = {
                    type: 'team-state-update',
                    teamName: newTeamName,
                    puzzle: appState.teams[newTeamName].puzzle
                };
                playerChannel.send(JSON.stringify(teamStateMessage));
            }
            broadcast({ type: 'player-joined-team', teamName: newTeamName, playerId: joiningPlayerId });
            break;
        case 'move':
            // The host processes the move received from a joiner.
            processAndBroadcastMove(data);
            break;
        case 'cell-select':
            // Host receives a cell selection and broadcasts it.
            broadcastCellSelection(data);
            break;
    }
}

/**
 * Processes broadcast messages to update the local client's UI.
 * This function is run by ALL clients, including the Host.
 * @param {object} data - The parsed message data.
 */
function processBroadcastForUI(data) {
    switch (data.type) {
        case 'initial-state':
            loadPuzzle(appState.selectedDifficulty, data.state);
            if (!appState.isInitiator) {
                appState.gameInProgress = true;
            }
            break;
        case 'team-list-update':
            updateTeamList(data.teams);
            break;
        case 'team-state-update':
            appState.playerTeam = data.teamName;
            appState.teams[data.teamName] = { puzzle: data.puzzle };
            updateGridForTeam(data.teamName);
            document.getElementById('team-selection-area').classList.add('hidden');
            document.getElementById('sudoku-grid-area').classList.remove('hidden');
            break;
        case 'move-update':
            // All team members receive this message.
            if (data.team === appState.playerTeam) {
                const cell = document.getElementById(`cell-${data.row}-${data.col}`);
                if (cell) {
                    cell.querySelector('.cell-value').textContent = data.value;
                }
                // If this is a move from another player, add visual/audio feedback.
                if (data.sessionId !== appState.sessionId) {
                    playRemoteMoveSound();
                    if (cell) {
                        cell.classList.add('blink');
                        setTimeout(() => cell.classList.remove('blink'), 2000);
                    }
                }
            }
            break;
        case 'game-over':
            showWinnerScreen(data.winningTeam);
            break;
        case 'player-joined-team':
            if (data.teamName === appState.playerTeam && data.sessionId !== appState.sessionId) {
                showToast(`${data.playerId} has joined the team.`);
            }
            break;
        case 'player-left-team':
            if (data.teamName === appState.playerTeam && data.sessionId !== appState.sessionId) {
                showToast(`${data.playerId} has left the team.`);
            }
            break;
        case 'cell-select':
            if (data.team === appState.playerTeam && data.sessionId !== appState.sessionId) {
                const cell = document.getElementById(`cell-${data.row}-${data.col}`);
                if (cell) {
                    cell.classList.add('blink');
                    setTimeout(() => cell.classList.remove('blink'), 1500);
                }
            }
            break;
    }
}

//The createOffer code should be used by all the connection methods
//We should avoid code duplication
export async function createOffer() {
    appState.isInitiator = true;
    appState.isAnswer = false;
    const connection = initializeWebRTC();
    const channel = connection.createDataChannel('sudoku-game');
    setupDataChannel(channel);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    return connection;
}

export async function createAnswer(offerText) {
    let connection = initializeWebRTC();
    await connection.setRemoteDescription(new RTCSessionDescription(offerText));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    // Wait until ICE gathering is complete before returning the connection
    await waitForIceGathering(connection);
    return connection;
}

// A helper function to ensure ICE gathering is complete
async function waitForIceGathering(connection) {
    return new Promise(resolve => {
        if (connection.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (connection.iceGatheringState === 'complete') {
                    connection.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            connection.addEventListener('icegatheringstatechange', checkState);
        }
    });
}