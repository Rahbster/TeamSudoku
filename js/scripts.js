import {
    createGrid,
    startPressTimer,
    clearAllHighlights,
    loadPuzzle,
    checkGridState
} from './game.js';

import {
    initializePeerJs,
    connectToPeerJS,
    sendOffer,
    sendAnswer,
    SUDOKU_SERVICE_PEER_PREFIX
} from './peer.js';

import {
    playBeepSound,
    createQrCodeChunks,
    clearTextbox
} from './misc.js';

//==============================
//Global Variables and DOM Elements
//==============================
//Cache DOM elements for faster access
export const dom = {
    offerTextarea: document.getElementById('offer-text'),
    receivedOfferTextarea: document.getElementById('received-offer-text'),
    answerTextarea: document.getElementById('answer-text'),
    receivedAnswerTextarea: document.getElementById('received-answer-text'),
    p1Status: document.getElementById('p1-status'),
    p2Status: document.getElementById('p2-status'),
    p1QrStatus: document.getElementById('p1-qr-status'),
    p2QrStatus: document.getElementById('p2-qr-status'),
    sudokuGrid: document.getElementById('sudoku-grid'),
    sudokuGridArea: document.getElementById('sudoku-grid-area'),
    signalingArea: document.getElementById('signaling-area'),
    manualSignalingArea: document.getElementById('manual-signaling-area'),
    qrSignalingArea: document.getElementById('qr-signaling-area'),
    p1ManualArea: document.getElementById('p1-manual-area'),
    p2ManualArea: document.getElementById('p2-manual-area'),
    p1QrArea: document.getElementById('p1-qr-area'),
    p2QrArea: document.getElementById('p2-qr-area'),
    qrCodeDisplay: document.getElementById('qr-code-display'),
    qrCodeAnswerDisplay: document.getElementById('qr-code-display-answer'),
    chunkStatus: document.getElementById('chunk-status'),
    prevQrBtn: document.getElementById('prev-qr-btn'),
    nextQrBtn: document.getElementById('next-qr-btn'),
    prevQrAnswerBtn: document.getElementById('prev-qr-answer-btn'),
    nextQrAnswerBtn: document.getElementById('next-qr-answer-btn'),
    scannerStatus: document.getElementById('scanner-status'),
    scannerStatusHost: document.getElementById('scanner-status-host'),
    scanOverlayMessage: document.getElementById('scan-overlay-message'),
    playerRoleSelect: document.getElementById('player-role'),
    signalingMethodSelect: document.getElementById('signaling-method'),
    newPuzzleButton: document.getElementById('new-puzzle-btn'),
    hostButton: document.getElementById('host-btn'),
    numberPad: document.getElementById('number-pad'),
    themeSelector: document.getElementById('theme-select'),
    body: document.body,
    //Manual signaling buttons
    createOfferManualBtn: document.getElementById('create-offer-manual-btn'),
    copyOfferBtn: document.getElementById('copy-offer-btn'),
    clearOfferBtn: document.getElementById('clear-offer-btn'),
    addAnswerManualBtn: document.getElementById('add-answer-manual-btn'),
    clearReceivedAnswerBtn: document.getElementById('clear-received-answer-btn'),
    createAnswerManualBtn: document.getElementById('create-answer-manual-btn'),
    clearReceivedOfferBtn: document.getElementById('clear-received-offer-btn'),
    copyAnswerBtn: document.getElementById('copy-answer-btn'),
    clearAnswerBtn: document.getElementById('clear-answer-btn'),

    //QR signaling buttons
    createQrBtn: document.getElementById('create-qr-btn'),
    startQrHostBtn: document.getElementById('start-qr-host-btn'),
    startQrBtn: document.getElementById('start-qr-btn'),

    //PeerJS signaling buttons
    peerSignalingArea: document.getElementById('peer-signaling-area'),
    p1PeerArea: document.getElementById('p1-peer-area'),
    p2PeerArea: document.getElementById('p2-peer-area'),
    p1PeerId: document.getElementById('p1-peer-id'),
    p2PeerId: document.getElementById('p2-peer-id'),
    p2JoinId: document.getElementById('p2-join-id'),
    connectToPeerBtn: document.getElementById('connect-to-peer-btn'),
    p1PeerStatus: document.getElementById('p1-peer-status'),
    p2PeerStatus: document.getElementById('p2-peer-status')
};

export let dataChannel; // This will hold the WebRTC data channel
export let qrScanner = null;
export let qrScannerHost = null;
export let pressTimer = null;

// Global variable for the WebRTC connection object
let rtcConnection = null; // This will hold the native RTCPeerConnection


//State object to manage application state
export const appState = {
    isInitiator: false,
    isAnswer: false,
    initialSudokuState: [],
    activeCell: null,
    //QR state
    offerChunks: [],
    currentOfferChunkIndex: 0,
    answerChunks: [],
    currentAnswerChunkIndex: 0,
    scannedChunks: [],
    totalChunksToScan: 0,
    //Input state
    isLongPressActive: false,
    lastEventTimestamp: 0
};

//==============================
//WebRTC and Signaling Logic
//==============================

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
            hideSignalingUI(); //Hide all signaling UI when connected
        }
    };

    connection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
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
        toggleSignalingArea();
    };

    channel.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'move') {
            const cell = document.getElementById(`cell-${data.row}-${data.col}`);
            if (cell) {
                cell.textContent = data.value;
            }
            checkGridState();
        } else if (data.type === 'initial-state') {
            loadPuzzle(data.state);
        }
    };
}

//Handles manual offer creation
async function createOfferManual() {
    rtcConnection = await createOffer();
    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            dom.offerTextarea.value = JSON.stringify(rtcConnection.localDescription);
        }
    };
}

//The createOffer code should be used by all the connection methods
//We should avoid code duplication
async function createOffer() {
    appState.isInitiator = true;
    appState.isAnswer = false;
    const connection = initializeWebRTC();
    dataChannel = connection.createDataChannel('sudoku-game');
    setupDataChannel(dataChannel);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    return connection;
}

//Handles manual answer creation
async function createAnswerManual() {
    const offerText = JSON.parse(dom.receivedOfferTextarea.value);
    rtcConnection = await createAnswer(offerText);

    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            dom.answerTextarea.value = JSON.stringify(rtcConnection.localDescription);
        }
    };
}

export async function createAnswer(offerText) {
    let connection = initializeWebRTC();
    await connection.setRemoteDescription(new RTCSessionDescription(offerText));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    return connection;
}

//Handles adding a manual answer to an offer
async function addAnswerManual() {
    const answer = JSON.parse(dom.receivedAnswerTextarea.value);
    if (rtcConnection.signalingState !== 'stable') {
        await rtcConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

//Handles QR code offer creation
async function createOfferQr() {
    rtcConnection = await createOffer();

    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            const sdpString = JSON.stringify(rtcConnection.localDescription);
            const base64Sdp = btoa(sdpString);
            appState.offerChunks = createQrCodeChunks(base64Sdp);
            appState.currentOfferChunkIndex = 0;
            displayQrChunk(appState.offerChunks, appState.currentOfferChunkIndex);
            dom.p1QrStatus.textContent = 'Status: Offer created. Show codes to Player 2.';
        }
    };
}

//Handles QR code answer creation
async function createAnswerQr() {
    appState.isAnswer = true;
    const answer = await rtcConnection.createAnswer();
    await rtcConnection.setLocalDescription(answer);

    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            const answerSdp = JSON.stringify(rtcConnection.localDescription);
            const base64Sdp = btoa(answerSdp);
            appState.answerChunks = createQrCodeChunks(base64Sdp);
            appState.currentAnswerChunkIndex = 0;
            displayQrChunk(appState.answerChunks, appState.currentAnswerChunkIndex);
            dom.p2QrStatus.textContent = 'Status: Answer created. Show QR code(s) to Player 1.';
        }
    };
}

//Starts the Joiner's QR code scanner
function startQrScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner = null;
        });
    }

    appState.scannedChunks = [];
    appState.totalChunksToScan = 0;
    dom.scannerStatus.textContent = 'Status: Scanning first QR code...';

    qrScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } });
    qrScanner.render(onScanSuccess, onScanFailure);
}

//Starts the Host QR code scanner
function startQrScannerHost() {
    if (qrScannerHost) {
        qrScannerHost.stop().then(() => {
            qrScannerHost = null;
        });
    }

    appState.scannedChunks = [];
    appState.totalChunksToScan = 0;
    dom.scannerStatusHost.textContent = 'Status: Scanning first QR code...';

    qrScannerHost = new Html5QrcodeScanner("qr-reader-host", { fps: 10, qrbox: { width: 250, height: 250 } });
    qrScannerHost.render(onHostScanSuccess, onHostScanFailure);
}

//Handles successful QR code scan for the Joiner
async function onScanSuccess(decodedText) {
    const regex = /^\[(\d+)\/(\d+)\]:(.*)$/;
    const match = decodedText.match(regex);

    if (!match) {
        return; // Ignore invalid QR codes
    }

    const chunkIndex = parseInt(match[1], 10);
    const totalChunks = parseInt(match[2], 10);
    const chunkData = match[3];

    if (appState.scannedChunks.some(chunk => chunk.index === chunkIndex)) {
        return; // Ignore duplicate scans
    }

    appState.scannedChunks.push({ index: chunkIndex, data: chunkData });
    dom.scannerStatus.textContent = `Status: Scanned chunk ${appState.scannedChunks.length} of ${totalChunks}.`;

    // Play a beep and display the status for 2 seconds
    playBeepSound();

    // Display the new overlay message
    dom.scanOverlayMessage.textContent = `${appState.scannedChunks.length} of ${totalChunks}`;
    dom.scanOverlayMessage.classList.remove('hidden');

    // Hide the overlay message after 2 seconds
    setTimeout(() => {
        dom.scanOverlayMessage.classList.add('hidden');
    }, 2000);

    if (appState.scannedChunks.length === totalChunks) {
        if (qrScanner) {
            qrScanner.clear();
        }

        appState.scannedChunks.sort((a, b) => a.index - b.index);
        const fullSdp = atob(appState.scannedChunks.map(chunk => chunk.data).join(''));
        const sdp = JSON.parse(fullSdp);

        if (sdp.type === 'offer') {
            rtcConnection = initializeWebRTC();
            await rtcConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            await createAnswerQr();
            dom.p2QrStatus.textContent = 'Status: All chunks scanned. Answer created.';
        }
    }
}

//Handles QR code scan failures for the Joiner
function onScanFailure(error) {
    console.warn(`QR code scan error: ${error}`);
}

//Handles successful QR code scan for the Host
async function onHostScanSuccess(decodedText) {
    const regex = /^\[(\d+)\/(\d+)\]:(.*)$/;
    const match = decodedText.match(regex);

    if (!match) {
        return; // Ignore invalid QR codes
    }

    const chunkIndex = parseInt(match[1], 10);
    const totalChunks = parseInt(match[2], 10);
    const chunkData = match[3];

    if (appState.scannedChunks.some(chunk => chunk.index === chunkIndex)) {
        return; // Ignore duplicate scans
    }

    appState.scannedChunks.push({ index: chunkIndex, data: chunkData });
    dom.scannerStatusHost.textContent = `Status: Scanned chunk ${appState.scannedChunks.length} of ${totalChunks}.`;

    // Play a beep and display the status for 2 seconds
    playBeepSound();

    // Display the new overlay message
    dom.scanOverlayMessage.textContent = `${appState.scannedChunks.length} of ${totalChunks}`;
    dom.scanOverlayMessage.classList.remove('hidden');

    // Hide the overlay message after 2 seconds
    setTimeout(() => {
        dom.scanOverlayMessage.classList.add('hidden');
    }, 2000);

    if (appState.scannedChunks.length === totalChunks) {
        if (qrScannerHost) {
            qrScannerHost.clear();
        }

        appState.scannedChunks.sort((a, b) => a.index - b.index);
        const fullSdp = atob(appState.scannedChunks.map(chunk => chunk.data).join(''));
        const sdp = JSON.parse(fullSdp);

        if (sdp.type === 'answer' && appState.isInitiator) {
            await rtcConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            dom.p1QrStatus.textContent = 'Status: Answer received. Connecting...';
        }
    }
}

//Handles QR code scan failures for the Host
function onHostScanFailure(error) {
    console.warn(`QR code scan error: ${error}`);
}

//Displays a single QR code chunk and updates navigation button states.
function displayQrChunk(chunks, index) {
    dom.qrCodeDisplay.innerHTML = '';
    dom.qrCodeAnswerDisplay.innerHTML = '';

    const displayTarget = appState.isAnswer ? dom.qrCodeAnswerDisplay : dom.qrCodeDisplay;
    const textToEncode = chunks[index];

    try {
        new QRCode(displayTarget, {
            text: textToEncode,
            width: 320,
            height: 320
        });
    } catch (error) {
        alert("An error occurred:" + error.message);
    }

    if (appState.isAnswer) {
        dom.chunkStatus.textContent = ''; // Clear Host's status text
        dom.prevQrAnswerBtn.disabled = (index === 0);
        dom.nextQrAnswerBtn.disabled = (index === chunks.length - 1);
    } else {
        dom.chunkStatus.textContent = `Chunk ${index + 1} of ${chunks.length}`;
        dom.prevQrBtn.disabled = (index === 0);
        dom.nextQrBtn.disabled = (index === chunks.length - 1);
    }
}

//Shows the next QR code chunk for the Host or Joiner
function showNextChunk() {
    const chunks = appState.offerChunks;
    let currentIndex = appState.currentOfferChunkIndex;

    if (currentIndex < chunks.length - 1) {
        currentIndex++;
        appState.currentOfferChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

//Shows the previous QR code chunk for the Host or Joiner
function showPrevChunk() {
    const chunks = appState.offerChunks;
    let currentIndex = appState.currentOfferChunkIndex;

    if (currentIndex > 0) {
        currentIndex--;
        appState.currentOfferChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

//Shows the next Answer QR code chunk for the Joiner
function showNextAnswerChunk() {
    const chunks = appState.answerChunks;
    let currentIndex = appState.currentAnswerChunkIndex;

    if (currentIndex < chunks.length - 1) {
        currentIndex++;
        appState.currentAnswerChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

//Shows the previous Answer QR code chunk for the Joiner
function showPrevAnswerChunk() {
    const chunks = appState.answerChunks;
    let currentIndex = appState.currentAnswerChunkIndex;

    if (currentIndex > 0) {
        currentIndex--;
        appState.currentAnswerChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

//==============================
//UI State Management
//==============================

//Toggles visibility of signaling areas
function toggleSignalingArea() {
    dom.signalingArea.classList.toggle('hidden');
    dom.sudokuGridArea.classList.toggle('hidden');

    // Toggle the 'connection-background' class on the body
    document.body.classList.toggle('connection-background');

    if (dom.signalingArea.classList.contains('hidden')) {
        dom.sudokuGridArea.scrollIntoView({ behavior: 'smooth' });
    } else {
        dom.signalingArea.scrollIntoView({ behavior: 'smooth' });
    }
}

//Toggles visibility of specific signaling sections
function toggleSignalingUI() {
    const signalingMethod = dom.signalingMethodSelect.value;
    const playerRole = dom.playerRoleSelect.value;

    dom.manualSignalingArea.classList.add('hidden');
    dom.qrSignalingArea.classList.add('hidden');
    dom.p1ManualArea.classList.add('hidden');
    dom.p2ManualArea.classList.add('hidden');
    dom.p1QrArea.classList.add('hidden');
    dom.p2QrArea.classList.add('hidden');
    dom.peerSignalingArea.classList.add('hidden');
    dom.p1PeerArea.classList.add('hidden');
    dom.p2PeerArea.classList.add('hidden');

    if (signalingMethod === 'manual') {
        dom.manualSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            dom.p1ManualArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            dom.p2ManualArea.classList.remove('hidden');
        }
    } else if (signalingMethod === 'qr') {
        dom.qrSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            dom.p1QrArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            dom.p2QrArea.classList.remove('hidden');
        }
    } else if (signalingMethod === 'peer') {
        dom.peerSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            dom.p1PeerArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            dom.p2PeerArea.classList.remove('hidden');
        }
    }
}

//Hides the signaling UI completely and shows the game
export function hideSignalingUI() {
    dom.signalingArea.style.display = 'none';
    dom.sudokuGridArea.classList.remove('hidden');
}

// Copies the offer or answer to the clipboard
async function copyToClipboard(elementId) {
    const textToCopy = document.getElementById(elementId).value;
    try {
        await navigator.clipboard.writeText(textToCopy);
        console.log('Content copied to clipboard!');
        alert('Text copied to clipboard!'); // Provide user feedback
    } catch (err) {
        console.error('Failed to copy text: ', err);
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed'; // Prevents scrolling
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            alert('Text copied to clipboard!');
        } catch (execErr) {
            console.error('Fallback copy failed: ', execErr);
            alert('Failed to copy. Please copy manually.');
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

//==============================
//Initial Setup
//==============================

document.addEventListener('DOMContentLoaded', () => {
    // Initial UI setup
    dom.prevQrBtn.disabled = true;
    dom.nextQrBtn.disabled = true;
    dom.prevQrAnswerBtn.disabled = true;
    dom.nextQrAnswerBtn.disabled = true;

    toggleSignalingUI();
    createGrid();
    loadPuzzle();

    // Event listeners for drop-downs
    dom.signalingMethodSelect.addEventListener('change', toggleSignalingUI);
    dom.playerRoleSelect.addEventListener('change', toggleSignalingUI);

    // Event listeners for game-related buttons
    dom.newPuzzleButton.addEventListener('click', () => {
        loadPuzzle();
    });

    // Event listeners for the "Toggle P2P Configuration" button
    dom.hostButton.addEventListener('click', () => {
        toggleSignalingArea();
    });

    // Event listeners for the manual signaling buttons
    dom.createOfferManualBtn.addEventListener('click', createOfferManual);
    dom.copyOfferBtn.addEventListener('click', () => copyToClipboard('offer-text'));
    dom.clearOfferBtn.addEventListener('click', () => clearTextbox('offer-text'));
    dom.addAnswerManualBtn.addEventListener('click', addAnswerManual);
    dom.clearReceivedAnswerBtn.addEventListener('click', () => clearTextbox('received-answer-text'));
    dom.createAnswerManualBtn.addEventListener('click', createAnswerManual);
    dom.clearReceivedOfferBtn.addEventListener('click', () => clearTextbox('received-offer-text'));
    dom.copyAnswerBtn.addEventListener('click', () => copyToClipboard('answer-text'));
    dom.clearAnswerBtn.addEventListener('click', () => clearTextbox('answer-text'));

    // Event listeners for the QR signaling buttons
    dom.createQrBtn.addEventListener('click', createOfferQr);
    dom.startQrHostBtn.addEventListener('click', startQrScannerHost);
    dom.startQrBtn.addEventListener('click', startQrScanner);
    dom.prevQrBtn.addEventListener('click', showPrevChunk);
    dom.nextQrBtn.addEventListener('click', showNextChunk);
    dom.prevQrAnswerBtn.addEventListener('click', showPrevAnswerChunk);
    dom.nextQrAnswerBtn.addEventListener('click', showNextAnswerChunk);

    dom.playerRoleSelect.addEventListener('change', async (event) => {
        if (dom.signalingMethodSelect.value === 'peer') {
            const playerRole = event.target.value;
            if (playerRole === 'host') {
                try {
                    // Step 1: Initialize PeerJS. The returned value is the PeerJS 'Peer' object.
                    const peerJSObject = await initializePeerJs('host');

                    // Step 2: Listen for the 'connection' event to get the actual data connection.
                    peerJSObject.on('connection', async (peerJSConnection) => {
                        console.log('PeerJS connection received from:', conn.peer);
                        dom.p1PeerStatus.textContent = 'Status: PeerJS connection received. Starting WebRTC signaling...';

                        dom.p1PeerStatus.textContent = 'Status: PeerJS connection received. Creating offer...';

                        // Step 3: Create the WebRTC offer once the PeerJS connection is open.
                        // You must wait for the 'open' event before sending data.
                        peerJSConnection.on('open', async () => {

                            rtcConnection = await createOffer();

                            rtcConnection.onicegatheringstatechange = () => {
                                if (rtcConnection.iceGatheringState === 'complete') {
                                    const offerData = JSON.stringify(rtcConnection.localDescription);
                                    // Step 4: Send the offer over the PeerJS connection.
                                    sendOffer(peerJSConnection, offerData);
                                    dom.p1PeerStatus.textContent = 'Status: Offer sent to joiner. Waiting for answer...';
                                }
                            };

                            // Step 5: Listen for the answer from the joiner.
                            peerJSConnection.on('data', async (data) => {
                                const message = JSON.parse(data);
                                if (message.type === 'answer') {
                                    dom.p1PeerStatus.textContent = 'Status: Answer received. WebRTC connection established.';
                                    await rtcConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.answer)));

                                   // Close the PeerJS connection and object as they are no longer needed.
                                    peerJSConnection.close();
                                    peerJSObject.destroy();
                                }
                            });
                        });
                    });
                } catch (error) {
                    console.error('Failed to initialize PeerJS:', error);
                }
            }
        }
    });

    dom.connectToPeerBtn.addEventListener('click', async () => {
        const peerId = SUDOKU_SERVICE_PEER_PREFIX + dom.p2JoinId.value;
        if (peerId) {
            try {
                // Step 1: Initialize PeerJS. The returned value is the PeerJS object.
                const peerJSObject = await initializePeerJs('joiner');

                // Step 2: Use the PeerJS 'peer' object to establish the data connection.
                // This function now returns a Promise that resolves with PeerJS connection.
                const peerJSConnection = await connectToPeerJS(peerJSObject, peerId);

                // Step 3: Listen for the offer from the host via the PeerJS connection.
                peerJSConnection.on('data', async (data) => {
                    const message = JSON.parse(data);
                    if (message.type === 'offer') {
                        dom.p2PeerStatus.textContent = 'Status: Offer received. Creating answer...';

                        // Use the corrected function to create the answer
                        const offerText = JSON.parse(message.offer);
                        rtcConnection = await createAnswer(offerText);

                        // Step 4: Send the answer back to the host via the PeerJS connection
                        sendAnswer(peerJSConnection, JSON.stringify(rtcConnection.localDescription));
                        dom.p2PeerStatus.textContent = 'Status: Answer sent. WebRTC connection established.';

                        peerJSConnection.close();
                        peerJSObject.destroy();
                    }
                });
                console.log('PeerJS signaling connection is ready!');
            } catch (error) {
                console.error('Failed to establish WebRTC connection:', error);
            }
        }
    });

    // Event listener for the theme selector
    dom.themeSelector.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        dom.body.classList.remove('banished', 'unsc', 'forerunner');
        if (selectedTheme !== 'default') {
            dom.body.classList.add(selectedTheme);
        }
    });

    // Event listeners for cell interactions (click and long-press)
    dom.sudokuGrid.addEventListener('mousedown', (e) => startPressTimer(e));
    dom.sudokuGrid.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
        appState.isLongPressActive = false; // Reset the state
    });
    dom.sudokuGrid.addEventListener('mouseleave', () => {
        clearTimeout(pressTimer);
        appState.isLongPressActive = false; // Reset the state
    });

    // For mobile devices
    dom.sudokuGrid.addEventListener('touchstart', (e) => startPressTimer(e));
    dom.sudokuGrid.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        appState.isLongPressActive = false; // Reset the state
    });

    // Event listener to the number pad
    dom.numberPad.addEventListener('click', (event) => {
        // Check if a number button or the empty button was clicked and if a cell is active
        if (event.target.classList.contains('number-btn') && appState.activeCell) {
            // Check if the cell is a preloaded cell (you should not be able to change it)
            if (appState.activeCell.classList.contains('preloaded-cell')) {
                return;
            }

            let value;
            // Check if the empty button was clicked
            if (event.target.id === 'empty-btn') {
                value = '';
            } else {
                value = event.target.textContent;
            }

            // Set the content of the active cell to the determined value
            appState.activeCell.textContent = value;

            // Create the message object to send to the other player
            const move = {
                type: 'move',
                row: appState.activeCell.id.split('-')[1],
                col: appState.activeCell.id.split('-')[2],
                value: value
            };
            // Check if the data channel is open and send the message
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(JSON.stringify(move));
            }

            // Remove active class from the old cell to avoid confusion
            appState.activeCell.classList.remove('active-cell');

            // Clear all highlights and check grid state after a change
            clearAllHighlights();
            checkGridState();

            // Reset the active cell
            appState.activeCell = null;
        }
    });
});