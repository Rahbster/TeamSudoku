//==============================
//WebRTC and Signaling Logic
//==============================

import { appState, dom, dataChannels } from './scripts.js';
import { loadPuzzle, checkGridState, updateGridForTeam } from './game.js';
import { hideSignalingUI, showTeamSelection, updateTeamList, showWinnerScreen, showToast } from './ui.js';

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

    channel.onmessage = event => {
        const data = JSON.parse(event.data);

        // Host processes all messages and broadcasts updates
        if (appState.isInitiator) {
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
                    const playerChannel = dataChannels.find(c => c.label === channel.label);
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
                    // Update the puzzle for the specific team and broadcast to team members
                    const team = appState.teams[data.team];
                    if (team) {
                        team.puzzle[data.row][data.col] = data.value === '' ? 0 : data.value;
                        const moveUpdate = { type: 'move-update', team: data.team, row: data.row, col: data.col, value: data.value };
                        broadcast(moveUpdate); // Broadcast to all, clients will filter by team
                    }
                    break;
            }
        }

        // All clients (including host) process broadcasted messages
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
                if (data.team === appState.playerTeam) {
                    const cell = document.getElementById(`cell-${data.row}-${data.col}`);
                    if (cell) {
                        cell.querySelector('.cell-value').textContent = data.value;
                        checkGridState();
                    }
                }
                break;
            case 'game-over':
                showWinnerScreen(data.winningTeam);
                break;
            case 'player-joined-team':
                // Show toast only if this client is on the same team and isn't the one who just joined
                if (data.teamName === appState.playerTeam && data.playerId !== appState.playerId) {
                    showToast(`${data.playerId} has joined the team.`);
                }
                break;
            case 'player-left-team':
                if (data.teamName === appState.playerTeam && data.playerId !== appState.playerId) {
                    showToast(`${data.playerId} has left the team.`);
                }
                break;
        }
    };
}

function broadcast(data) {
    const message = JSON.stringify(data);
    dataChannels.forEach(channel => {
        if (channel.readyState === 'open') {
            channel.send(message);
        }
    });
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