//==============================
//WebRTC and Signaling Logic
//==============================

import { appState, dom, dataChannels } from './scripts.js';
import { loadGame, updateGridForTeam, processMove } from './game_manager.js';
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

            // Also send the current list of teams to the new player.
            const teamList = Object.entries(appState.teams).map(([name, data]) => ({
                name,
                gameType: data.gameType
            }));
            const teamListMessage = {
                type: 'team-list-update',
                teams: teamList
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
    if (!appState.isInitiator) {
        // Joiners just send their move to the host
        if (dataChannels.length > 0 && dataChannels[0].readyState === 'open') {
            dataChannels[0].send(JSON.stringify(moveData));
        }
    } else {
        // Host processes the move using the game manager
        // The game-specific module will handle broadcasting.
        processMove(moveData);
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
export async function handleIncomingMessage(event) {
    const data = JSON.parse(event.data);

    // If this client is a joiner, it only needs to process UI updates.
    if (!appState.isInitiator) {
        processBroadcastForUI(data);
        return;
    }

    // The rest of this function is HOST-ONLY logic for processing requests.
    switch (data.type) {
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

            const team = appState.teams[newTeamName];
            // Add player to the new team
            if (team && !team.members.includes(joiningPlayerId)) {
                team.members.push(joiningPlayerId);

                // If this is the first member, initialize the game state
                if (team.members.length === 1 && !team.gameState) {
                    const gameModule = await import(`./games/${team.gameType}.js`);
                    team.gameState = gameModule.getInitialState(team.difficulty);
                }

                // For Connect 4, assign player numbers as teams join
                if (team.gameType === 'connect4') {
                    const connect4Teams = Object.keys(appState.teams).filter(t => appState.teams[t].gameType === 'connect4');
                    if (!team.gameState.players[newTeamName]) {
                        const playerNumber = connect4Teams.indexOf(newTeamName) + 1;
                        team.gameState.players[newTeamName] = playerNumber;
                        if (connect4Teams.length === 1) { // First team sets the turn
                            team.gameState.turn = newTeamName;
                        }
                    }
                }
            }

            // Send the puzzle state to the joining player
            const playerChannel = dataChannels.find(c => c.label === event.target.label);
            if (playerChannel) {
                const teamStateMessage = {
                    type: 'team-state-update',
                    teamName: newTeamName,
                    teamState: appState.teams[newTeamName]
                };
                playerChannel.send(JSON.stringify(teamStateMessage));
            }
            broadcast({ type: 'player-joined-team', teamName: newTeamName, playerId: joiningPlayerId });
            break;
        case 'move':
            // The host processes the move received from a joiner.
            processMove(data);
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
        case 'team-list-update':
            updateTeamList(data.teams);
            break;
        case 'team-state-update':
            appState.playerTeam = data.teamName;
            appState.teams[data.teamName] = data.teamState;
            loadGame(data.teamState.gameType).then(() => {
                updateGridForTeam(data.teamName);
            });
            dom.teamSelectionArea.classList.add('hidden');
            dom.sudokuGridArea.classList.remove('hidden');
            break;
        case 'move-update':
            // Dynamically call the correct UI processor
            import(`./games/${data.game}.js`).then(module => {
                if (module && typeof module.processUIUpdate === 'function') {
                    module.processUIUpdate(data);
                }
            });
            break;
        case 'game-over':
            // If the game over message includes a winning line, blink it.
            if (data.line) {
                dom.sudokuGrid.style.pointerEvents = 'none';
                data.line.forEach(cell => {
                    const domCell = document.getElementById(`cell-${cell.r}-${cell.c}`);
                    if (domCell) domCell.classList.add('winning-cell-blink');
                });
                // The timeout in handleGameOver on the host is the authority.
                // The UI will just show the modal when the final message arrives.
            }
            showWinnerScreen(data.winningTeam, data.losingTeam);
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
    const connection = initializeWebRTC();
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