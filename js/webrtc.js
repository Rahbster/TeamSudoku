//==============================
//WebRTC and Signaling Logic
//==============================

import { appState, dom, dataChannels } from './scripts.js';
import { loadPuzzle, checkGridState, updateGridForTeam } from './game.js';
import { hideSignalingUI, showTeamSelection, updateTeamList, showWinnerScreen } from './ui.js';

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
                hideSignalingUI(); //Hide all signaling UI when connected
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
    channel.onopen = () => {
        console.log('Data Channel is open!');
        dom.p1Status.textContent = 'Status: Connected!';
        dom.p2Status.textContent = 'Status: Connected!';
        dom.p1QrStatus.textContent = 'Status: Connected!';
        dom.p2QrStatus.textContent = 'Status: Connected!';
        dataChannels.push(channel); // Store the new channel
        if (appState.isInitiator) {
            showTeamSelection();
        }
    };

    channel.onmessage = event => {
        const data = JSON.parse(event.data);

        // Host processes all messages and broadcasts updates
        if (appState.isInitiator) {
            switch (data.type) {
                case 'create-team':
                    if (!appState.teams[data.teamName]) {
                        appState.teams[data.teamName] = { puzzle: JSON.parse(JSON.stringify(appState.initialSudokuState)), members: [] };
                        broadcast({ type: 'team-list-update', teams: Object.keys(appState.teams) });
                    }
                    break;
                case 'join-team':
                    // Add player to team and send them the current team puzzle state
                    const playerChannel = dataChannels.find(c => c.label === channel.label);
                    if (playerChannel) {
                        appState.teams[data.teamName].members.push(channel.label);
                        const teamStateMessage = {
                            type: 'team-state-update',
                            teamName: data.teamName,
                            puzzle: appState.teams[data.teamName].puzzle
                        };
                        playerChannel.send(JSON.stringify(teamStateMessage));
                    }
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