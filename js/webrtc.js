//==============================
//WebRTC and Signaling Logic
//==============================

import { appState, dom, dataChannels } from './scripts.js';
import { loadPuzzle, checkGridState } from './game.js';
import { hideSignalingUI } from './ui.js';

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
    };

    channel.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'move') {
            const cell = document.getElementById(`cell-${data.row}-${data.col}`);
            if (cell) {
                cell.textContent = data.value;

                // Add the blink class to the cell
                cell.classList.add('blink');

                // Set a timer to remove the blink class after 3 seconds
                setTimeout(() => {
                    cell.classList.remove('blink');
                }, 3000);
            }
            checkGridState();

            // Broadcast the move to all other players
            dataChannels.forEach(otherChannel => {
                if (otherChannel.readyState === 'open' && otherChannel !== channel) {
                    otherChannel.send(event.data);
                }
            });
        } else if (data.type === 'initial-state') {
            loadPuzzle(appState.selectedDifficulty, data.state);
        }
    };
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