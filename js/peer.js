// peer.js

import { dom, appState } from './scripts.js';
import { removePrefix } from './misc.js';

export const SUDOKU_SERVICE_PEER_PREFIX = 'teamsudoku-';

// Initializes the PeerJS object
export async function initializePeerJs(isHost) {
    appState.isInitiator = isHost;

    // Return a new Promise that will resolve with the PeerJS object
    return new Promise((resolve, reject) => {
        dom.p1PeerStatus.textContent = 'Status: Initializing...';
        dom.p2PeerStatus.textContent = 'Status: Waiting for Host...';

        const peerId = appState.isInitiator ? generateRandomId() : undefined;
        const peerJSObject = new Peer(peerId, {
            host: '0.peerjs.com',
            secure: true,
            port: 443
        });

        // Error handling for PeerJS
        peerJSObject.on('error', (err) => {
            console.error('PeerJS error:', err);
            reject(err); // Reject the Promise on error
        });

        peerJSObject.on('open', (id) => {
            console.log('PeerJS ID:', id);

            if (appState.isInitiator) {
                const publishChallenge = removePrefix(peerId, SUDOKU_SERVICE_PEER_PREFIX);
                updatePeerIdDisplay(isHost, publishChallenge);
                dom.p1PeerStatus.textContent = `Status: Share this ID with Player 2 to connect.`;
                resolve(peerJSObject);
            } else { // 'joiner'
                // For the joiner, we resolve with the peer object itself, as they
                // will use it to initiate a connection to the host.
                resolve(peerJSObject);
            }
        });
    });
}

// Function to send the WebRTC offer over the PeerJS connection
export function sendOffer(peerJSConnection, offer) {
    if (peerJSConnection && peerJSConnection.open) {
        const message = {
            type: 'offer',
            offer: offer
        };
        const jsonData = JSON.stringify(message);
        peerJSConnection.send(jsonData);
    }
}

// Function to send the WebRTC answer over the PeerJS connection
export function sendAnswer(peerJSConnection, answer) {
    if (peerJSConnection && peerJSConnection.open) {
        const message = {
            type: 'answer',
            answer: answer
        };
        const jsonData = JSON.stringify(message);
        peerJSConnection.send(jsonData);
    }
}

// Connects to a specific peer using their ID
export function connectToPeerJS(peerJSObject, joinId) {
    // This is the key change: wrap the function in a Promise
    return new Promise((resolve, reject) => {
    if (!peerJSObject) {
        const err = new Error('PeerJS not initialized.');
        console.error(err);
        reject(err);
        return;
    }

    dom.p2PeerStatus.textContent = `Status: Attempting to connect to Host via PeerJS...`;

    const peerJSConnection = peerJSObject.connect(joinId);

    peerJSConnection.on('open', () => {
        dom.p2PeerStatus.textContent = 'Status: PeerJS signaling channel open. Waiting for offer...';
            // Resolve the promise once the connection is open
            resolve(peerJSConnection);
    });

    peerJSConnection.on('error', (err) => {
        console.error('Joiner: PeerJS connection error:', err);
        dom.p2PeerStatus.textContent = 'Status: Connection failed.';
        reject(err); // Reject the promise on error
    });
    });
}

// Helper function to update the Peer ID in the UI
function updatePeerIdDisplay(isHost, id) {
    if (isHost) {
        dom.p1PeerId.textContent = id;
    } else {
        dom.p2PeerId.textContent = id;
    }
}

// Simple function to generate a random ID for the Host
function generateRandomId() {
    // Generates a random 6-digit number
    const number = Math.floor(100000 + Math.random() * 900000);
    return 'teamsudoku-' + number.toString();
}