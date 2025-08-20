import {
    createGrid,
    startPressTimer,
    handleCellClick,
    handleLongPress,
    highlightMatchingCells,
    clearAllHighlights,
    loadPuzzle,
    validatePuzzle,
    checkGridState,
    updateNumberPadState
} from './game.js';

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
    bluetoothSignalingArea: document.getElementById('bluetooth-signaling-area'),
    p1ManualArea: document.getElementById('p1-manual-area'),
    p2ManualArea: document.getElementById('p2-manual-area'),
    p1QrArea: document.getElementById('p1-qr-area'),
    p2QrArea: document.getElementById('p2-qr-area'),
    p1BluetoothArea: document.getElementById('p1-bluetooth-area'),
    p2BluetoothArea: document.getElementById('p2-bluetooth-area'),
    p1BluetoothStatus: document.getElementById('p1-bluetooth-status'),
    p2BluetoothStatus: document.getElementById('p2-bluetooth-status'),
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
    // NEW: Manual signaling buttons
    createOfferManualBtn: document.getElementById('create-offer-manual-btn'),
    copyOfferBtn: document.getElementById('copy-offer-btn'),
    clearOfferBtn: document.getElementById('clear-offer-btn'),
    addAnswerManualBtn: document.getElementById('add-answer-manual-btn'),
    clearReceivedAnswerBtn: document.getElementById('clear-received-answer-btn'),
    createAnswerManualBtn: document.getElementById('create-answer-manual-btn'),
    clearReceivedOfferBtn: document.getElementById('clear-received-offer-btn'),
    copyAnswerBtn: document.getElementById('copy-answer-btn'),
    clearAnswerBtn: document.getElementById('clear-answer-btn'),
    // NEW: QR signaling buttons
    createQrBtn: document.getElementById('create-qr-btn'),
    startQrHostBtn: document.getElementById('start-qr-host-btn'),
    startQrBtn: document.getElementById('start-qr-btn'),
    // NEW: Bluetooth signaling buttons
    createBluetoothOfferBtn: document.getElementById('create-bluetooth-offer-btn'),
    joinBluetoothOfferBtn: document.getElementById('join-bluetooth-offer-btn')
};

export let peerConnection;
export let dataChannel;
export let qrScanner = null;
export let qrScannerHost = null;
export let pressTimer = null;

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
//Bluetooth Constants
//==============================
// Define a unique UUID for the custom Sudoku service and characteristics
// These are not official UUIDs, but are for demonstration purposes
const SUDOKU_SERVICE_UUID = '00001815-0000-1000-8000-00805f9b34fb';
const SUDOKU_OFFER_CHARACTERISTIC_UUID = '00002a5c-0000-1000-8000-00805f9b34fb';
const SUDOKU_ANSWER_CHARACTERISTIC_UUID = '00002a46-0000-1000-8000-00805f9b34fb';

//==============================
//WebRTC and Signaling Logic
//==============================

//Initializes the WebRTC PeerConnection
function initializeWebRTC() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log('New ICE candidate:', event.candidate);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            console.log('WebRTC connection established!');
            hideSignalingUI(); //Hide all signaling UI when connected
        }
    };

    peerConnection.ondatachannel = event => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
}

//Sets up the event handlers for the data channel
function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data Channel is open!');
        dom.p1Status.textContent = 'Status: Connected!';
        dom.p2Status.textContent = 'Status: Connected!';
        dom.p1QrStatus.textContent = 'Status: Connected!';
        dom.p2QrStatus.textContent = 'Status: Connected!';
        dom.p1BluetoothStatus.textContent = 'Status: Connected!';
        dom.p2BluetoothStatus.textContent = 'Status: Connected!';
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
    appState.isInitiator = true;
    initializeWebRTC();
    dataChannel = peerConnection.createDataChannel('sudoku-game');
    setupDataChannel(dataChannel);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            dom.offerTextarea.value = JSON.stringify(peerConnection.localDescription);
        }
    };
}

//Handles manual answer creation
async function createAnswerManual() {
    initializeWebRTC();
    const offer = JSON.parse(dom.receivedOfferTextarea.value);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            dom.answerTextarea.value = JSON.stringify(peerConnection.localDescription);
        }
    };
}

//Handles adding a manual answer to an offer
async function addAnswerManual() {
    const answer = JSON.parse(dom.receivedAnswerTextarea.value);
    if (peerConnection.signalingState !== 'stable') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

//Handles QR code offer creation
async function createOfferQr() {
    appState.isInitiator = true;
    appState.isAnswer = false;
    initializeWebRTC();
    dataChannel = peerConnection.createDataChannel('sudoku-game');
    setupDataChannel(dataChannel);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            const sdpString = JSON.stringify(peerConnection.localDescription);
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
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            const answerSdp = JSON.stringify(peerConnection.localDescription);
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
            initializeWebRTC();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
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
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            dom.p1QrStatus.textContent = 'Status: Answer received. Connecting...';
        }
    }
}

//Handles QR code scan failures for the Host
function onHostScanFailure(error) {
    console.warn(`QR code scan error: ${error}`);
}

//Creates QR code chunks with embedded index and total count.
function createQrCodeChunks(data) {
    const MAX_CHUNK_SIZE = 128;
    const chunks = [];
    const totalChunks = Math.ceil(data.length / MAX_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
        const chunkData = data.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
        chunks.push(`[${i + 1}/${totalChunks}]:${chunkData}`);
    }
    return chunks;
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
            width: 256,
            height: 256
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
//NEW: Bluetooth Connection Logic
//==============================

/**
 * Creates a Bluetooth GATT server, sets up the Sudoku service, and broadcasts
 * the WebRTC offer. This is for the Host.
 */
async function createOfferBluetooth() {
    dom.p1BluetoothStatus.textContent = 'Status: Preparing offer...';
    appState.isInitiator = true;
    initializeWebRTC();
    dataChannel = peerConnection.createDataChannel('sudoku-game');
    setupDataChannel(dataChannel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpString = JSON.stringify(offer);
    const sdpBuffer = new TextEncoder().encode(sdpString);

    // This is a mock implementation as a browser cannot act as a BLE peripheral.
    // In a real-world scenario, you would use a noble library in Node.js
    // or a native app to create a GATT server.
    // The following code is illustrative of the ideal flow.
    try {
        // Mock a GATT server creation and writing the offer.
        // This part would be handled by a native app or a service on a different device.
        dom.p1BluetoothStatus.textContent = 'Status: Offer created and awaiting a Bluetooth connection...';

        // We'll simulate the "answer received" part with a simple message.
        // This would be replaced by a listener on the BLE characteristic.
        peerConnection.onicecandidate = event => {
            if (event.candidate && peerConnection.iceGatheringState === 'complete') {
                dom.p1BluetoothStatus.textContent = 'Status: Offer sent. Waiting for answer via Bluetooth.';
            }
        };

        // For this example, we'll just log the offer.
        console.log('Mock Bluetooth Offer:', sdpString);

    } catch (error) {
        console.error('Bluetooth error:', error);
        dom.p1BluetoothStatus.textContent = 'Status: Failed to create Bluetooth offer. See console.';
    }
}

/**
 * Scans for a Bluetooth device, connects, reads the offer, and sends back
 * the answer. This is for the Joiner.
 */
async function joinOfferBluetooth() {
    dom.p2BluetoothStatus.textContent = 'Status: Scanning for devices...';
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SUDOKU_SERVICE_UUID] }]
        });

        dom.p2BluetoothStatus.textContent = `Status: Found "${device.name}". Connecting...`;

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SUDOKU_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(SUDOKU_OFFER_CHARACTERISTIC_UUID);

        dom.p2BluetoothStatus.textContent = 'Status: Connected. Reading offer...';

        // Read the offer from the characteristic
        const value = await characteristic.readValue();
        const offerString = new TextDecoder().decode(value);
        const offer = JSON.parse(offerString);

        initializeWebRTC();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        dom.p2BluetoothStatus.textContent = 'Status: Offer received. Creating answer...';

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // This is a mock implementation. A real implementation would write
        // the answer to a different characteristic and the host would read it.
        const answerString = JSON.stringify(answer);
        console.log('Mock Bluetooth Answer:', answerString);

        dom.p2BluetoothStatus.textContent = 'Status: Answer created. Connection process complete.';

    } catch (error) {
        console.error('Bluetooth error:', error);
        dom.p2BluetoothStatus.textContent = 'Status: Bluetooth connection failed. See console.';
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
    dom.bluetoothSignalingArea.classList.add('hidden');
    dom.p1ManualArea.classList.add('hidden');
    dom.p2ManualArea.classList.add('hidden');
    dom.p1QrArea.classList.add('hidden');
    dom.p2QrArea.classList.add('hidden');
    dom.p1BluetoothArea.classList.add('hidden');
    dom.p2BluetoothArea.classList.add('hidden');

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
    } else if (signalingMethod === 'bluetooth') {
        dom.bluetoothSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            dom.p1BluetoothArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            dom.p2BluetoothArea.classList.remove('hidden');
        }
    }
}

//Hides the signaling UI completely and shows the game
function hideSignalingUI() {
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

// Function to clear the content of a specific textarea
function clearTextbox(id) {
    const textarea = document.getElementById(id);
    if (textarea) {
        textarea.value = '';
    }
}

// Function to play a simple beep sound
function playBeepSound() {
    const audioContext = new(window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Connect the nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set the tone and duration
    oscillator.type = 'sine'; // A smooth tone
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz is A4
    gainNode.gain.setValueAtTime(1, audioContext.currentTime); // Start at full volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1); // Fade out quickly

    // Start and stop the oscillator
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
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

    // Event listeners for the Bluetooth signaling buttons
    dom.createBluetoothOfferBtn.addEventListener('click', createOfferBluetooth);
    dom.joinBluetoothOfferBtn.addEventListener('click', joinOfferBluetooth);

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