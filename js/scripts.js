import {
    createGrid,
} from './game.js';

import {
    toggleSignalingUI,
    initializeEventListeners
} from './ui.js';

//==============================
//Global Variables and DOM Elements
//==============================
//Cache DOM elements for faster access
export const dom = {};

export let dataChannels = []; // This will hold the WebRTC data channels
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

//Starts the timer for a long press
export function startPressTimer(event) {
    clearTimeout(pressTimer);
    appState.isLongPressActive = false;
    const cell = event.target;

    pressTimer = setTimeout(() => {
        handleLongPress(cell);
    }, 500);
}

//==============================
//Initial Setup
//==============================
document.addEventListener('DOMContentLoaded', () => {
    // APP State
    appState.selectedDifficulty = 'easy';
    // DOM setup
    dom.offerTextarea = document.getElementById('offer-text');
    dom.receivedOfferTextarea = document.getElementById('received-offer-text');
    dom.answerTextarea = document.getElementById('answer-text');
    dom.receivedAnswerTextarea = document.getElementById('received-answer-text');
    dom.p1Status = document.getElementById('p1-status');
    dom.p2Status = document.getElementById('p2-status');
    dom.p1QrStatus = document.getElementById('p1-qr-status');
    dom.p2QrStatus = document.getElementById('p2-qr-status');
    dom.sudokuGrid = document.getElementById('sudoku-grid');
    dom.sudokuGridArea = document.getElementById('sudoku-grid-area');
    dom.signalingArea = document.getElementById('signaling-area');
    dom.manualSignalingArea = document.getElementById('manual-signaling-area');
    dom.qrSignalingArea = document.getElementById('qr-signaling-area');
    dom.p1ManualArea = document.getElementById('p1-manual-area');
    dom.p2ManualArea = document.getElementById('p2-manual-area');
    dom.p1QrArea = document.getElementById('p1-qr-area');
    dom.p2QrArea = document.getElementById('p2-qr-area');
    dom.qrCodeDisplay = document.getElementById('qr-code-display');
    dom.qrCodeAnswerDisplay = document.getElementById('qr-code-display-answer');
    dom.chunkStatus = document.getElementById('chunk-status');
    dom.prevQrBtn = document.getElementById('prev-qr-btn');
    dom.nextQrBtn = document.getElementById('next-qr-btn');
    dom.prevQrAnswerBtn = document.getElementById('prev-qr-answer-btn');
    dom.nextQrAnswerBtn = document.getElementById('next-qr-answer-btn');
    dom.scannerStatus = document.getElementById('scanner-status');
    dom.scannerStatusHost = document.getElementById('scanner-status-host');
    dom.scanOverlayMessage = document.getElementById('scan-overlay-message');
    dom.playerRoleSelect = document.getElementById('player-role');
    dom.signalingMethodSelect = document.getElementById('signaling-method');
    dom.newPuzzleButton = document.getElementById('new-puzzle-btn');
    dom.sudokuLoadPuzzleArea = document.getElementById('sudoku-loadpuzzle-area');
    dom.hostButton = document.getElementById('host-btn');
    dom.instructions = document.getElementById('instructions');
    dom.numberPad = document.getElementById('number-pad');
    dom.themeSelector = document.getElementById('theme-select');
    dom.difficultySelector = document.getElementById('difficulty-select');
    dom.body = document.body;
    //Manual signaling buttons
    dom.createOfferManualBtn = document.getElementById('create-offer-manual-btn');
    dom.copyOfferBtn = document.getElementById('copy-offer-btn');
    dom.clearOfferBtn = document.getElementById('clear-offer-btn');
    dom.addAnswerManualBtn = document.getElementById('add-answer-manual-btn');
    dom.clearReceivedAnswerBtn = document.getElementById('clear-received-answer-btn');
    dom.createAnswerManualBtn = document.getElementById('create-answer-manual-btn');
    dom.clearReceivedOfferBtn = document.getElementById('clear-received-offer-btn');
    dom.copyAnswerBtn = document.getElementById('copy-answer-btn');
    dom.clearAnswerBtn = document.getElementById('clear-answer-btn');
    //QR signaling buttons
    dom.createQrBtn = document.getElementById('create-qr-btn');
    dom.startQrHostBtn = document.getElementById('start-qr-host-btn');
    dom.startQrBtn = document.getElementById('start-qr-btn');
    //PeerJS signaling buttons
    dom.peerSignalingArea = document.getElementById('peer-signaling-area');
    dom.p1PeerArea = document.getElementById('p1-peer-area');
    dom.p2PeerArea = document.getElementById('p2-peer-area');
    dom.p1PeerId = document.getElementById('p1-peer-id');
    dom.p2JoinId = document.getElementById('p2-join-id');
    dom.connectToPeerBtn = document.getElementById('connect-to-peer-btn');
    dom.p1PeerStatus = document.getElementById('p1-peer-status');
    dom.p2PeerStatus = document.getElementById('p2-peer-status');
    dom.generateNewIDButton = document.getElementById('generate-new-id-btn');
    dom.channelList = document.getElementById('channel-list');
    dom.showChannelsBtn = document.getElementById('show-channels-btn');

    // Initial UI setup
    dom.prevQrBtn.disabled = true;
    dom.nextQrBtn.disabled = true;
    dom.prevQrAnswerBtn.disabled = true;
    dom.nextQrAnswerBtn.disabled = true;

    toggleSignalingUI();
    createGrid();

    // Call the initialization function from the UI file
    initializeEventListeners();
});