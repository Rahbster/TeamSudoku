//==============================
// Main Script
//==============================
// This script serves as the entry point for the application. It imports necessary modules,
// defines global state and variables, and initializes the application when the DOM is ready.

import {
    createGrid,
    loadGame
} from './game_manager.js';

import {
    toggleSignalingUI,
    initializeEventListeners,
    handleLongPress,
    showScreen,    
    initializeSoloGame
} from './ui.js';

//==============================
// Global Variables and State
//==============================

export const dom = {}; // Object to cache DOM elements for faster access.
export let dataChannels = []; // Array to hold all active WebRTC data channels.


// Global state object to manage the application's state throughout its lifecycle.
export const appState = {
    isInitiator: false, // Is this client the host (Player 1)?
    isAnswer: false, // Is the current QR code generation for an answer SDP?
    initialSudokuState: [], // Stores the initial state of the puzzle for resets or reference.
    activeCell: null, // The currently selected cell in the Sudoku grid.
    pressTimer: null, // Timer for handling long-press events on the grid.
    //QR state
    offerChunks: [],
    currentOfferChunkIndex: 0,
    answerChunks: [],
    currentAnswerChunkIndex: 0,
    scannedChunks: [],
    totalChunksToScan: 0,
    //Input state
    isLongPressActive: false, // Flag to track if a long-press action is active.
    lastEventTimestamp: 0, // Timestamp to help debounce rapid click/tap events.
    // Game state
    isPencilMode: false,
    // Team state
    playerTeam: null, // The team this player has joined.
    playerId: `Player ${Math.floor(100 + Math.random() * 900)}`, // A simple random ID for now
    sessionId: Math.random().toString(36).substring(2, 15), // A unique ID for this browser session
    teams: {}, // Object to hold the state for each team. e.g., { teamName: { puzzle: [...] } }
    gameInProgress: false, // Is a game currently being played?
    winner: null, // Which team won?
    soloGameState: null // Holds the game state when the host is playing alone.
};

// Copies the offer or answer to the clipboard
export async function copyToClipboard(elementId) {
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
// Initial Setup
//==============================
// This event listener fires when the initial HTML document has been completely loaded and parsed.
document.addEventListener('DOMContentLoaded', async () => {
    // Set initial application state. Default to the first option in the dropdown.
    appState.selectedDifficulty = 'very-easy';
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
    dom.hostButton = document.getElementById('host-btn');
    dom.configBtn = document.getElementById('config-btn');
    dom.instructionsModal = document.getElementById('instructions-modal');
    dom.backToGameBtn = document.getElementById('back-to-game-btn');
    dom.numberPad = document.getElementById('number-pad');
    dom.themeSelector = document.getElementById('theme-select');
    dom.themeSelectorConfig = document.getElementById('theme-select-config');
    dom.difficultySelector = document.getElementById('difficulty-select');
    dom.gameSelector = document.getElementById('game-select');
    dom.connect4ModeContainer = document.getElementById('connect4-mode-container');
    dom.connect4ModeSelect = document.getElementById('connect4-mode-select');
    dom.pencilButton = document.getElementById('pencil-btn');
    dom.wordSearchListArea = document.getElementById('word-search-list-area');
    dom.wordsearchConfigContainer = document.getElementById('wordsearch-config-container');
    dom.customWordListInput = document.getElementById('custom-word-list-input');
    dom.spellingBeeArea = document.getElementById('spelling-bee-area');
    dom.spellingBeeControls = document.getElementById('spelling-bee-controls');
    dom.spellingBeeAnswerArea = document.getElementById('spelling-bee-answer-area');
    dom.spellingbeeConfigContainer = document.getElementById('spellingbee-config-container');
    dom.spellingbeeModeSelect = document.getElementById('spellingbee-mode-select');
    dom.blackjackArea = document.getElementById('blackjack-area');
    dom.dealerHand = document.getElementById('dealer-hand');
    dom.playerHand = document.getElementById('player-hand');
    dom.blackjackActions = document.getElementById('blackjack-actions');
    dom.bettingControls = document.getElementById('betting-controls');
    dom.blackjackConfigContainer = document.getElementById('blackjack-config-container');
    dom.deckCountSelect = document.getElementById('deck-count-select');
    dom.memorymatchConfigContainer = document.getElementById('memorymatch-config-container');
    dom.memorymatchModeSelect = document.getElementById('memorymatch-mode-select');
    dom.voiceSelect = document.getElementById('voice-select');
    dom.spellingBeeWordListInput = document.getElementById('spelling-bee-word-list-input');
    dom.wordCountInput = document.getElementById('word-count-input');
    dom.wordList = document.getElementById('word-list');
    dom.body = document.body;
    //Manual signaling buttons
    dom.teamSelectionArea = document.getElementById('team-selection-area');
    dom.teamNameInput = document.getElementById('team-name-input');
    dom.createTeamBtn = document.getElementById('create-team-btn');
    dom.teamDisplayArea = document.getElementById('team-display-area');
    dom.teamNameDisplay = document.getElementById('team-name-display');
    dom.playerNameDisplay = document.getElementById('player-name-display');
    dom.teamList = document.getElementById('team-list');
    dom.playerNameInput = document.getElementById('player-name-input');
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
    dom.gameScreen = document.getElementById('game-screen');
    dom.configScreen = document.getElementById('config-screen');
    dom.showChannelsBtn = document.getElementById('show-channels-btn');
    dom.hardResetBtn = document.getElementById('hard-reset-btn');

    // Set the initial state for UI elements.
    dom.winnerModal = document.getElementById('winner-modal');
    dom.winnerText = document.getElementById('winner-text');
    dom.newPuzzleWinnerBtn = document.getElementById('new-puzzle-winner-btn');
    dom.prevQrBtn.disabled = true;
    dom.nextQrBtn.disabled = true;
    dom.prevQrAnswerBtn.disabled = true;
    dom.nextQrAnswerBtn.disabled = true;

    // Expose dom object globally for access from other modules (e.g., generator.js)
    window.dom = dom;

    // Load saved theme from localStorage, or default to 'default'
    const savedTheme = localStorage.getItem('sudokuTheme') || 'default';
    dom.body.classList.add(savedTheme);
    dom.themeSelector.value = savedTheme;
    dom.themeSelectorConfig.value = savedTheme;

    // Load saved connection method and role from localStorage BEFORE initializing the UI
    const savedConnectionMethod = localStorage.getItem('sudokuConnectionMethod');
    if (savedConnectionMethod) {
        dom.signalingMethodSelect.value = savedConnectionMethod;
    }
    const savedPlayerRole = localStorage.getItem('sudokuPlayerRole');
    if (savedPlayerRole) {
        dom.playerRoleSelect.value = savedPlayerRole;
    } else {
        // Default to Host if no role is saved
        dom.playerRoleSelect.value = 'host';
    }

    // Load saved game type and mode
    const savedGameType = localStorage.getItem('sudokuGameType');
    if (savedGameType) {
        dom.gameSelector.value = savedGameType;
    }
    const savedConnect4Mode = localStorage.getItem('sudokuConnect4Mode');
    if (savedConnect4Mode) {
        dom.connect4ModeSelect.value = savedConnect4Mode;
    }

    // Load saved custom word list
    const savedWordList = localStorage.getItem('sudokuWordSearchList');
    if (savedWordList) {
        dom.customWordListInput.value = savedWordList;
    }

    // Load saved word count
    const savedWordCount = localStorage.getItem('sudokuWordSearchCount');
    if (savedWordCount) {
        dom.wordCountInput.value = savedWordCount;
    }

    // Load saved spelling bee mode
    const savedSpellingBeeMode = localStorage.getItem('sudokuSpellingBeeMode');
    if (savedSpellingBeeMode) {
        dom.spellingbeeModeSelect.value = savedSpellingBeeMode;
    }

    // Load saved memory match mode
    const savedMemoryMatchMode = localStorage.getItem('sudokuMemoryMatchMode');
    if (savedMemoryMatchMode) {
        dom.memorymatchModeSelect.value = savedMemoryMatchMode;
    }

    // Load saved deck count
    const savedDeckCount = localStorage.getItem('sudokuDeckCount');
    if (savedDeckCount) {
        dom.deckCountSelect.value = savedDeckCount;
    }

    // Saved voice preference will be loaded by the populateVoiceList function
    // once the voices are available from the browser.
    // const savedVoice = localStorage.getItem('sudokuVoice');
    // if (savedVoice) {
    //     dom.voiceSelect.value = savedVoice;
    // }

    // Load saved spelling bee word list
    const savedSpellingBeeWordList = localStorage.getItem('sudokuSpellingBeeWordList');
    if (savedSpellingBeeWordList) {
        dom.spellingBeeWordListInput.value = savedSpellingBeeWordList;
    }

    // Load saved player name or generate a default one
    appState.playerId = localStorage.getItem('sudokuPlayerName') || `Player ${Math.floor(100 + Math.random() * 900)}`;
    dom.playerNameInput.value = appState.playerId;

    // Initialize UI visibility and event listeners.
    initializeEventListeners();

    showScreen('game'); // Start on the game screen

    // Manually trigger the UI update to reflect any loaded preferences.
    toggleSignalingUI();
    dom.gameSelector.dispatchEvent(new Event('change'));

    // After all preferences are loaded and UI is toggled, initialize the solo game view.
    await initializeSoloGame();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Register the service worker for Progressive Web App (PWA) capabilities like offline access.
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker registered! Scope: ', registration.scope);
            })
            .catch((err) => {
                console.log('Service Worker registration failed: ', err);
            });
    });
}