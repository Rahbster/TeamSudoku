//==============================
//UI Logic
//==============================
// This module handles all user interface interactions, from button clicks to dynamic UI updates.
import { appState, dom, dataChannels, copyToClipboard } from './scripts.js';
import { loadGame, updateGridForTeam, loadPuzzle, createGrid } from './game_manager.js';
import { stopTimer } from './timer.js';
import { clearTextbox, createQrCodeChunks, playBeepSound, playRemoteMoveSound, debugLog } from './misc.js';
import { SUDOKU_SERVICE_PEER_PREFIX, initializePeerJs, connectToPeerJS, sendOffer, sendAnswer } from './peer.js';
import { createOffer, createAnswer, processAndBroadcastMove } from './webrtc.js';
import { checkGridState, clearAllHighlights, highlightConflictingCells, highlightMatchingCells, isMoveValid, validatePuzzle } from './games/sudoku.js';


/**
 * Manages the visibility of the main application screens.
 * @param {'config' | 'game'} screenName - The name of the screen to show.
 */
export function showScreen(screenName) {
    debugLog(`Showing screen: ${screenName}`);
    dom.gameScreen.classList.add('hidden');
    dom.configScreen.classList.add('hidden');
    document.body.classList.remove('connection-background');

    if (screenName === 'config') {
        closeHamburgerMenu(); // Ensure hamburger is closed when going to config
        dom.configScreen.classList.remove('hidden');
        document.body.classList.add('connection-background');
        dom.backToGameBtn.classList.remove('hidden'); // Always show the back button
    } else if (screenName === 'game') {
        dom.gameScreen.classList.remove('hidden');
        // Move controls into the hamburger menu
        const menu = dom.hamburgerMenu;
        if (menu.children.length <= 1) { // Only move them once
            menu.appendChild(dom.gameSelector.parentElement.parentElement);
            menu.appendChild(dom.difficultySelector.parentElement.parentElement);
            menu.appendChild(dom.themeSelectorConfig.parentElement.parentElement);
            menu.appendChild(dom.newPuzzleButton.parentElement);
            menu.appendChild(dom.cosmicbalanceConfigContainer);
            menu.appendChild(dom.configBtn.parentElement);
            menu.appendChild(dom.teamDisplayArea);
        }
        showInstructions(); // Show instructions every time the game screen is shown.
    }
}

function openHamburgerMenu() {
    // Check if the menu is already open
    if (dom.hamburgerMenu.style.transform === "translateX(0%)") return;

    dom.hamburgerMenu.style.transform = "translateX(0%)";
    // Add a listener to the document to detect clicks outside the menu
    // Use a timeout to ensure this listener is added after the current click event is processed
    setTimeout(() => {
        document.addEventListener('click', handleClickOutsideMenu);
    }, 0);
}

function closeHamburgerMenu() {
    dom.hamburgerMenu.style.transform = "translateX(100%)";
    // Clean up the listener when the menu is closed
    document.removeEventListener('click', handleClickOutsideMenu);
}

/**
 * Closes the hamburger menu if a click is detected outside of it.
 * @param {Event} event The click event.
 */
function handleClickOutsideMenu(event) {
    if (!dom.hamburgerMenu.contains(event.target) && !dom.hamburgerIcon.contains(event.target)) {
        closeHamburgerMenu();
    }
}

/**
 * Toggles the visibility of specific UI sections based on the selected signaling method
 * (Manual, QR, PeerJS) and player role (Host, Joiner).
 */
export function toggleSignalingUI() {
    const signalingMethod = dom.signalingMethodSelect.value;
    localStorage.setItem('sudokuConnectionMethod', signalingMethod); // Save the connection method
    const playerRole = dom.playerRoleSelect.value;
    localStorage.setItem('sudokuPlayerRole', playerRole); // Save the player role

    appState.isInitiator = playerRole === 'host';
    // Add a 'host' class to the body if this client is the host
    // This is used by CSS to show/hide host-only controls
    if (appState.isInitiator) {
        document.body.classList.add('host');
    } else {
        document.body.classList.remove('host');
    }

    // Hide all signaling areas first
    [dom.manualSignalingArea, dom.qrSignalingArea, dom.peerSignalingArea,
     dom.p1ManualArea, dom.p2ManualArea, dom.p1QrArea, dom.p2QrArea,
     dom.p1PeerArea, dom.p2PeerArea].forEach(el => el.classList.add('hidden'));

    // If the user is the host, always show the team selection area on the config screen
    dom.teamSelectionArea.classList.toggle('hidden', !appState.isInitiator);

    if (signalingMethod === 'manual') {
        dom.manualSignalingArea.classList.remove('hidden');
        if (appState.isInitiator) {
            dom.p1ManualArea.classList.remove('hidden');
        } else {
            dom.p2ManualArea.classList.remove('hidden');
        }
    } else if (signalingMethod === 'qr') {
        dom.qrSignalingArea.classList.remove('hidden');
        if (appState.isInitiator) {
            dom.p1QrArea.classList.remove('hidden');
        } else {
            dom.p2QrArea.classList.remove('hidden');
        }
    } else if (signalingMethod === 'peerJS') {
        dom.peerSignalingArea.classList.remove('hidden');
        // The PeerJSInitiate function will handle showing the correct sub-area
        PeerJSInitiate(); // This should be called for both Host and Joiner
    }
}

/**
 * Handles a long-press event on a grid cell, highlighting matching numbers.
 * @param {HTMLElement} cell - The cell that was long-pressed.
 */
export function handleLongPress(cell) {
    appState.isLongPressActive = true;
    const value = cell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

/**
 * Hides the signaling UI completely, typically called once a P2P connection is established,
 * to focus the user on the game grid.
 */
export function hideSignalingUI() {
    showScreen('game');
}

/**
 * Shows the team selection area and hides the main game grid.
 */
export function showTeamSelection() {
    // Set the header text based on the player's role
    const header = document.getElementById('team-selection-header');
    if (appState.isInitiator) {
        header.textContent = 'Join or Create a Team';
    } else {
        header.textContent = 'Join a Team';
    }
    dom.teamSelectionArea.classList.remove('hidden');
    // The parent screen is already handling visibility of the grid
}

/**
 * Updates the list of available teams in the UI.
 * @param {string[]} teams - An array of team names.
 */
export function updateTeamList(teams) {
    dom.teamList.innerHTML = '';
    if (teams.length === 0) {
        dom.teamList.innerHTML = '<li>No teams created yet.</li>';
    } else {
        teams.sort((a, b) => a.name.localeCompare(b.name)); // Sort by team name
        teams.forEach(team => {
            const li = document.createElement('li');
            const gameName = team.gameType === 'connect4' ? 'Connect 4' : 'Sudoku';
            // The remove button is only visible to the host, controlled by the .host-only class in CSS
            li.innerHTML = `<span>${team.name} <em class="game-type">(${gameName})</em></span>
                            <div class="team-buttons">
                                <button class="remove-team-btn host-only" data-team-name="${team.name}">Remove</button>
                                <button class="join-team-btn" data-team-name="${team.name}">Join</button>
                            </div>`;
            dom.teamList.appendChild(li);
        });
    }
}

/**
 * Displays a winner screen when a team solves the puzzle.
 * @param {string} [winningTeam] - The name of the team that won, or 'all' for co-op win.
 * @param {string} [losingTeam] - The name of the team that caused a co-op loss.
 */
export function showWinnerScreen(winningTeam, losingTeam) {
    if (appState.winner && winningTeam !== 'tie') return; // Already showing, allow tie to override

    appState.winner = winningTeam;
    appState.gameInProgress = false;
    stopTimer(); // Stop the timer when the game ends.

    dom.winnerModal.classList.remove('hidden');

    if (winningTeam === 'all') {
        dom.winnerText.textContent = 'Congratulations! All teams win!';
    } else if (winningTeam === 'tie') {
        dom.winnerText.textContent = "It's a tie!";
    } else if (losingTeam) {
        // Check for solo Connect 4 loss
        if (dom.gameSelector.value === 'connect4' && !appState.playerTeam) {
            dom.winnerText.textContent = `${losingTeam} has won the game!`;
        } else {
            dom.winnerText.textContent = `Game Over! Team "${losingTeam}" made a move that created a line.`;
        }
    } else if (winningTeam === 'You' && appState.soloGameState?.gameMode) {
        // Check if it's a spelling bee game to show the score
        if (dom.gameSelector.value === 'spellingbee') {
            dom.winnerText.textContent = `You got ${appState.soloGameState.score} of ${appState.soloGameState.words.length} words correct!`;
        } else {
            dom.winnerText.textContent = 'You have won the game!';
        }
    } else if (winningTeam === 'You') {
        dom.winnerText.textContent = 'You have won the game!';
    } else if (winningTeam) {
        dom.winnerText.textContent = `Team "${winningTeam}" has won the game!`;
    } else {
        dom.winnerText.textContent = 'You have won the game!';
    }

    // Highlight the solved puzzle for the winning team
    if (appState.playerTeam === winningTeam) {
        document.querySelectorAll('.grid-cell').forEach(cell => cell.classList.add('solved-puzzle'));
    }
}

/**
 * Returns the HTML string for the timer component.
 * This allows any game module to create a consistent timer.
 * @returns {string}
 */
export function createTimerHTML() {
    return `<div id="timer-area" class="glass-panel">
                <h2>Time: <span id="timer-display">00:00</span></h2>
            </div>`;
}

/**
 * Displays a short-lived toast notification at the bottom of the screen.
 * @param {string} message - The message to display in the toast.
 * @param {'info' | 'error'} [type='info'] - The type of toast to display.
 */
export function showToast(message, type = 'info') {    
    const container = document.getElementById('toast-container') || createToastContainer();

    // Check if an identical toast already exists
    const existingToast = findExistingToast(container, message);

    if (existingToast) {
        // If it exists, update the badge and reset its timer
        updateToastBadge(existingToast);
        resetToastTimer(existingToast);
    } else {
        // Otherwise, create a new toast
        createNewToast(container, message, type);
    }
}

/** Helper Functions for Toast Management **/

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function findExistingToast(container, message) {
    return Array.from(container.children).find(toast => toast.querySelector('.toast-message')?.textContent === message);
}

function updateToastBadge(toast) {
    let badge = toast.querySelector('.toast-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'toast-badge';
        badge.dataset.count = 1; // First duplicate
        toast.appendChild(badge);
    }
    const newCount = parseInt(badge.dataset.count, 10) + 1;
    badge.dataset.count = newCount;
    badge.textContent = newCount;
    badge.classList.remove('hidden');
}

function resetToastTimer(toast) {
    // Clear the old timer and set a new one
    clearTimeout(toast.dataset.timerId);
    toast.dataset.timerId = setTimeout(() => {
        toast.remove();
    }, 4000);
}

function createNewToast(container, message, type) {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    container.prepend(toast);
    void toast.offsetWidth; // Force reflow for animation
    toast.classList.add('show');
    resetToastTimer(toast); // Set its initial removal timer
}

/**
 * Displays a single QR code chunk from an array of chunks and updates the navigation button states.
 * @param {string[]} chunks - The array of QR code data chunks.
 * @param {number} index - The index of the chunk to display.
 */
function displayQrChunk(chunks, index) {
    dom.qrCodeDisplay.innerHTML = '';
    dom.qrCodeAnswerDisplay.innerHTML = '';

    const displayTarget = appState.isAnswer ? dom.qrCodeAnswerDisplay : dom.qrCodeDisplay;
    const textToEncode = chunks[index];

    // Generate the QR code in the appropriate display area.
    try {
        new QRCode(displayTarget, {
            text: textToEncode,
            width: 320,
            height: 320
        });
    } catch (error) {
        alert("An error occurred:" + error.message);
    }

    // Update UI elements based on whether it's an offer or an answer QR code.
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

/**
 * Navigates to and displays the next QR code chunk for the WebRTC offer.
 */
function showNextChunk() {
    const chunks = appState.offerChunks;
    let currentIndex = appState.currentOfferChunkIndex;

    if (currentIndex < chunks.length - 1) {
        currentIndex++;
        appState.currentOfferChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

/**
 * Navigates to and displays the previous QR code chunk for the WebRTC offer.
 */
function showPrevChunk() {
    const chunks = appState.offerChunks;
    let currentIndex = appState.currentOfferChunkIndex;

    if (currentIndex > 0) {
        currentIndex--;
        appState.currentOfferChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

/**
 * Navigates to and displays the next QR code chunk for the WebRTC answer.
 */
function showNextAnswerChunk() {
    const chunks = appState.answerChunks;
    let currentIndex = appState.currentAnswerChunkIndex;

    if (currentIndex < chunks.length - 1) {
        currentIndex++;
        appState.currentAnswerChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

/**
 * Navigates to and displays the previous QR code chunk for the WebRTC answer.
 */
function showPrevAnswerChunk() {
    const chunks = appState.answerChunks;
    let currentIndex = appState.currentAnswerChunkIndex;

    if (currentIndex > 0) {
        currentIndex--;
        appState.currentAnswerChunkIndex = currentIndex;
        displayQrChunk(chunks, currentIndex);
    }
}

// This will hold the native RTCPeerConnection object.
let rtcConnection = null;

//=====Manual Connection...
/**
 * Creates a WebRTC offer and displays it in a textarea for manual copy-pasting.
 */
async function createOfferManual() {
    // createOffer() initializes the connection and returns it.
    rtcConnection = await createOffer();
    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            dom.offerTextarea.value = JSON.stringify(rtcConnection.localDescription);
        }
    };
}

/**
 * Sets the remote description on the host's connection using the answer received from the joiner.
 */
async function addAnswerManual() {
    const answer = JSON.parse(dom.receivedAnswerTextarea.value);
    if (rtcConnection.signalingState !== 'stable') {
        await rtcConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

/**
 * Creates a WebRTC answer based on the offer received from the host via manual copy-paste.
 */
async function createAnswerManual() {
    const offerText = JSON.parse(dom.receivedOfferTextarea.value);
    rtcConnection = await createAnswer(offerText);

    // Wait for ICE gathering to complete before displaying the answer.
    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            dom.answerTextarea.value = JSON.stringify(rtcConnection.localDescription);
        }
    };
}
//...Manual Connection=====

//=====PeerJS functions...

/**
 * Initiates the PeerJS connection for the host. It creates a unique peer ID,
 * waits for a joiner to connect, and then orchestrates the WebRTC offer/answer exchange.
 */
async function PeerJSInitiate() {
    if (appState.isInitiator) {
        await setupPeerHost();
    } else {
        await setupPeerJoiner();
    }
}

/**
 * Sets up the host's PeerJS instance and listeners.
 */
async function setupPeerHost() {
    try {
        // Step 1: Initialize PeerJS for the Host.
        dom.p1PeerArea.classList.remove('hidden');
        dom.p2PeerArea.classList.add('hidden');
        const peerJSObject = await initializePeerJs(true);

        // Step 2: Listen for a connection from a Joiner.
        peerJSObject.on('connection', async (peerJSConnection) => {
            dom.p1PeerStatus.textContent = 'Status: PeerJS connection received. Starting WebRTC signaling...';

            // Step 3: Wait for the PeerJS data channel to open.
            peerJSConnection.on('open', async () => {
                rtcConnection = await createOffer();

                rtcConnection.onicegatheringstatechange = () => {
                    if (rtcConnection.iceGatheringState === 'complete') {
                        const offerData = JSON.stringify(rtcConnection.localDescription);
                        // Step 4: Send the WebRTC offer to the Joiner.
                        sendOffer(peerJSConnection, offerData);
                        dom.p1PeerStatus.textContent = 'Status: Offer sent. Waiting for answer...';

                        // Step 5: Listen for the WebRTC answer from the Joiner.
                        peerJSConnection.on('data', async (data) => {
                            const message = JSON.parse(data);
                            if (message.type === 'answer') {
                                dom.p1PeerStatus.textContent = 'Status: Answer received. WebRTC connection established.';
                                await rtcConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(message.answer)));
                                peerJSConnection.close();
                                peerJSObject.destroy();
                            }
                        });
                    }
                };
            });
        });
    } catch (error) {
        console.error('Host: Failed to initialize PeerJS:', error);
        dom.p1PeerStatus.textContent = `Error: ${error.message}`;
    }
}

/**
 * Sets up the joiner's PeerJS instance.
 */
async function setupPeerJoiner() {
    try {
        // For the Joiner, we just need to initialize their PeerJS object.
        dom.p1PeerArea.classList.add('hidden');
        dom.p2PeerArea.classList.remove('hidden');
        // The actual connection logic is handled when they click the "Connect" button.
        await initializePeerJs(false);
        dom.p2PeerStatus.textContent = 'Status: Ready. Enter Host ID and connect.';
    } catch (error) {
        console.error('Joiner: Failed to initialize PeerJS:', error);
        dom.p2PeerStatus.textContent = `Error: ${error.message}`;
    }
}

//...PeerJS functions=====

//=====QR functions...
let qrScanner = null;
let qrScannerHost = null;
/**
 * Initializes and starts the QR code scanner for the joiner to scan the host's offer codes.
 */
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
    qrScanner.render((decodedText) => onQrScanSuccess(decodedText, 'joiner'), onScanFailure);
}

/**
 * Initializes and starts the QR code scanner for the host to scan the joiner's answer codes.
 */
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
    qrScannerHost.render((decodedText) => onQrScanSuccess(decodedText, 'host'), onHostScanFailure);
}

/**
 * Generic callback for a successful QR code scan.
 * It collects scanned chunks and, once all are received, assembles the SDP and processes it.
 * @param {string} decodedText - The text decoded from the QR code.
 * @param {'host' | 'joiner'} scannerType - The type of scanner that produced the result.
 */
async function onQrScanSuccess(decodedText, scannerType) {
    const regex = /^\[(\d+)\/(\d+)\]:(.*)$/;
    const match = decodedText.match(regex);

    if (!match) {
        return; // Ignore invalid QR codes
    }

    const chunkIndex = parseInt(match[1], 10);
    const totalChunks = parseInt(match[2], 10);
    const chunkData = match[3];

    // Prevent processing the same chunk multiple times.
    if (appState.scannedChunks.some(chunk => chunk.index === chunkIndex)) {
        return; // Ignore duplicate scans
    }

    appState.scannedChunks.push({ index: chunkIndex, data: chunkData });

    // Update the correct status element based on who is scanning
    if (scannerType === 'host') {
        dom.scannerStatusHost.textContent = `Status: Scanned chunk ${appState.scannedChunks.length} of ${totalChunks}.`;
    } else {
        dom.scannerStatus.textContent = `Status: Scanned chunk ${appState.scannedChunks.length} of ${totalChunks}.`;
    }

    // Play a beep and display the status for 2 seconds
    playBeepSound();

    // Display the new overlay message
    dom.scanOverlayMessage.textContent = `${appState.scannedChunks.length} of ${totalChunks}`;
    dom.scanOverlayMessage.classList.remove('hidden');

    // Hide the overlay message after 2 seconds
    setTimeout(() => {
        dom.scanOverlayMessage.classList.add('hidden');
    }, 2000);

    // If all chunks have been scanned, assemble the SDP and create an answer.
    if (appState.scannedChunks.length === totalChunks) {
        const activeScanner = scannerType === 'host' ? qrScannerHost : qrScanner;
        if (activeScanner) activeScanner.clear();

        appState.scannedChunks.sort((a, b) => a.index - b.index);
        const fullSdp = atob(appState.scannedChunks.map(chunk => chunk.data).join(''));
        const sdp = JSON.parse(fullSdp);

        if (scannerType === 'joiner' && sdp.type === 'offer') {
            // Joiner has scanned the host's offer
            rtcConnection = await createAnswer(sdp); // createAnswer now handles initialization
            await createAnswerQr(rtcConnection); // Pass the connection object
            dom.p2QrStatus.textContent = 'Status: All chunks scanned. Answer created.';
        } else if (scannerType === 'host' && sdp.type === 'answer') {
            // Host has scanned the joiner's answer
            if (rtcConnection) {
                await rtcConnection.setRemoteDescription(new RTCSessionDescription(sdp));
                dom.p1QrStatus.textContent = 'Status: Answer received. Connecting...';
            }
        }
    }
}

/**
 * Callback for a failed QR code scan attempt. Logs a warning to the console.
 * @param {string} error - The error message from the scanner.
 */
function onScanFailure(error) {
    console.warn(`QR code scan error: ${error}`);
}

/**
 * Creates a WebRTC offer, waits for ICE gathering to complete, and then splits the
 * resulting SDP into multiple chunks to be displayed as QR codes.
 */
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

/**
 * Creates a WebRTC answer, waits for ICE gathering, and then splits the resulting
 * SDP into multiple chunks to be displayed as QR codes for the host to scan.
 */
async function createAnswerQr(connection) {
    appState.isAnswer = true;
    // The local description is already set by the createAnswer function.
    // We just need to wait for ICE gathering to finish.
    connection.onicegatheringstatechange = () => {
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
//...QR functions=====

/**
 * Initializes all primary event listeners for the application's UI elements.
 */
export function initializeEventListeners() {
    // Hamburger Menu Listeners
    dom.hamburgerIcon.addEventListener('click', openHamburgerMenu);
    dom.closeHamburgerBtn.addEventListener('click', closeHamburgerMenu);

    // Event listeners for configuration drop-downs
    dom.signalingMethodSelect.addEventListener('change', (event) => {
        toggleSignalingUI();
        showToast(`Connection Method: ${event.target.options[event.target.selectedIndex].text}`);
    });
    dom.playerRoleSelect.addEventListener('change', (event) => {
        toggleSignalingUI();
        showToast(`Player Role: ${event.target.options[event.target.selectedIndex].text}`);
    });
    dom.gameSelector.addEventListener('change', (event) => {
        const selectedGame = event.target.value;
        localStorage.setItem('sudokuGameType', selectedGame);
        showToast(`Game changed to: ${event.target.options[event.target.selectedIndex].text}`);
        debugLog(`Game selection changed to: ${selectedGame}. Re-initializing solo game view.`);
        // Show the Connect 4 mode selector only when Connect 4 is chosen
        const isConnect4 = selectedGame === 'connect4';
        const isWordSearch = selectedGame === 'wordsearch';
        const isBlackjack = selectedGame === 'blackjack';
        const isMemoryMatch = selectedGame === 'memorymatch';
        const isSpellingBee = selectedGame === 'spellingbee';
        const isCosmicBalance = selectedGame === 'cosmicbalance';
        const isSudoku = selectedGame === 'sudoku';
        dom.connect4ModeContainer.style.display = isConnect4 ? '' : 'none';
        dom.wordsearchConfigContainer.style.display = isWordSearch ? '' : 'none';
        dom.spellingbeeConfigContainer.style.display = isSpellingBee ? '' : 'none';
        dom.blackjackConfigContainer.style.display = isBlackjack ? '' : 'none';
        dom.memorymatchConfigContainer.style.display = isMemoryMatch ? '' : 'none';
        dom.cosmicbalanceConfigContainer.style.display = isCosmicBalance ? '' : 'none';

        // Re-initialize the solo game view to reflect the new game choice immediately.
        initializeSoloGame();
    });

    // Event listener for the theme selector in the config/hamburger menu
    dom.themeSelectorConfig.addEventListener('change', handleThemeChange);

    // Event listeners for sub-game mode selectors
    dom.connect4ModeSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuConnect4Mode', event.target.value);
    });
    dom.spellingbeeModeSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuSpellingBeeMode', event.target.value);
    });
    dom.memorymatchModeSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuMemoryMatchMode', event.target.value);
    });
    dom.deckCountSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuDeckCount', event.target.value);
    });
    dom.aiPlayerCountSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuAiPlayerCount', event.target.value);
    });
    dom.cbAiPlayerCountSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuCbAiPlayerCount', event.target.value);
    });

    // Event listener for the voice selector
    dom.voiceSelect.addEventListener('change', (event) => {
        localStorage.setItem('sudokuVoice', event.target.value);
    });

    // Event listener for the word search word list to auto-format on blur
    dom.customWordListInput.addEventListener('blur', () => {
        const input = dom.customWordListInput;
        const words = input.value.trim()
            .split(/[\n, ]+/) // Split by newlines, commas, or spaces
            .map(word => word.trim().toUpperCase()) // Trim and convert to uppercase
            .filter(word => word.length > 0); // Filter out any empty strings

        // Sort alphabetically and join back with newlines for readability
        words.sort();
        input.value = '\n' + words.join('\n');
        localStorage.setItem('sudokuWordSearchWordList', input.value);
    });

    // Event listener for the spelling bee word list to auto-format on blur
    dom.spellingBeeWordListInput.addEventListener('blur', () => {
        const input = dom.spellingBeeWordListInput;
        const words = input.value.trim()
            .split(/[\n, ]+/) // Split by newlines, commas, or spaces
            .map(word => word.trim().toUpperCase()) // Trim and convert to uppercase
            .filter(word => word.length > 0); // Filter out any empty strings

        // Sort alphabetically and join back with newlines for readability
        words.sort();
        input.value = '\n' + words.join('\n');
        localStorage.setItem('sudokuSpellingBeeWordList', input.value);
    });


    // Event listener for the player name input
    dom.playerNameInput.addEventListener('change', (event) => {
        const newName = event.target.value.trim();
        if (newName) {
            appState.playerId = newName;
            localStorage.setItem('sudokuPlayerName', newName);
            showToast(`Name set to: ${newName}`);
        }
    });

    // Event listeners for the "Toggle P2P Configuration" button
    dom.configBtn.addEventListener('click', () => {
        // Reset winner state when going back to config to allow starting a new game.
        debugLog(`Config button clicked. Winner state reset. Showing 'config' screen.`);
        appState.winner = null;
        showScreen('config');
    });
    dom.backToGameBtn.addEventListener('click', async () => {
        // If the user is a host and hasn't joined a team,
        // load the selected game so they can see it on the game screen.
        await initializeSoloGame();
        debugLog(`Back to Game button clicked. Solo game re-initialized. Showing 'game' screen.`);
        showScreen('game');
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

    // Event listener for generating a new PeerJS ID for the host.
    dom.generateNewIDButton.addEventListener('click', async () => {
        if (dom.signalingMethodSelect.value === 'peerJS') {

            // Re-initialize for the host to get a new ID
            if (appState.isInitiator) {
                await setupPeerHost();
            }
        }
    });

    // Event listener for the joiner to connect to a host via PeerJS.
    dom.connectToPeerBtn.addEventListener('click', async () => {
        const peerId = SUDOKU_SERVICE_PEER_PREFIX + dom.p2JoinId.value;
        if (peerId) {
            try {
                // Step 1: Initialize PeerJS. The returned value is the PeerJS object.
                const peerJSObject = await initializePeerJs(false);

                // Step 2: Use the PeerJS 'peerJR' object to establish the data connection.
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


    // Event listener for the "New Game" button on the winner modal
    dom.newPuzzleWinnerBtn.addEventListener('click', () => {
        dom.winnerModal.classList.add('hidden');
        // Programmatically click the main "New Game" button to start a new puzzle
        loadPuzzle(); // Call the game_manager's loadPuzzle function
    });

    dom.showChannelsBtn.addEventListener('click', toggleChannelList);
    dom.channelList.addEventListener('click', disconnectChannel);
    dom.hardResetBtn.addEventListener('click', () => dom.resetModal.classList.remove('hidden'));
    dom.fullResetBtn.addEventListener('click', performHardReset);
    dom.preserveConfigResetBtn.addEventListener('click', performSoftReset);
    dom.cancelResetBtn.addEventListener('click', () => dom.resetModal.classList.add('hidden'));


    // Wire the main "New Game" button to the game manager's loadPuzzle function.
    dom.newPuzzleButton.addEventListener('click', loadPuzzle);

    // Event listeners for team selection
    dom.createTeamBtn.addEventListener('click', () => {
        const teamName = dom.teamNameInput.value.trim();
        if (teamName) {
            // Host creates the team locally
            if (!appState.teams[teamName]) {
                const gameType = dom.gameSelector.value;
                const difficulty = dom.difficultySelector.value;
                const gameMode = dom.connect4ModeSelect.value;

                appState.teams[teamName] = { 
                    gameType: gameType,
                    difficulty: difficulty,
                    gameState: null, // Will be initialized by the game-specific logic
                    gameMode: gameMode, // Store the selected mode
                    members: [] 
                };
                
                const teamList = Object.entries(appState.teams).map(([name, data]) => ({ name, gameType: data.gameType }));
                updateTeamList(teamList); // Update host's own list

                // Broadcast the new team list to all joiners
                const teamListUpdateMsg = { type: 'team-list-update', teams: teamList };
                const messageString = JSON.stringify(teamListUpdateMsg);
                dataChannels.forEach(c => c.send(messageString));
            }

            dom.teamNameInput.value = '';
        }
    });

    dom.teamList.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-team-btn')) {
            if (!appState.isInitiator) return; // Safety check

            const teamName = event.target.dataset.teamName;
            if (confirm(`Are you sure you want to remove the team "${teamName}"?`)) {
                // Remove from state
                delete appState.teams[teamName];

                // Update UI for host and broadcast to joiners
                const teamList = Object.entries(appState.teams).map(([name, data]) => ({ name, gameType: data.gameType }));
                updateTeamList(teamList);
                const teamListUpdateMsg = { type: 'team-list-update', teams: teamList };
                const messageString = JSON.stringify(teamListUpdateMsg);
                dataChannels.forEach(c => c.send(messageString));
            }
        }
        if (event.target.classList.contains('join-team-btn')) {
            const teamName = event.target.dataset.teamName;
            const joinTeamMsg = { type: 'join-team', teamName: teamName, playerId: appState.playerId, sessionId: appState.sessionId };
            
            appState.playerTeam = teamName;
            dom.teamDisplayArea.classList.remove('hidden');
            dom.playerNameDisplay.textContent = appState.playerId;
            dom.teamNameDisplay.textContent = teamName;

            if (appState.isInitiator) {
                processLocalTeamJoin(joinTeamMsg); // Host processes their own join
            } else {
                // Ensure the data channel is open before sending
                if (dataChannels.length > 0 && dataChannels[0].readyState === 'open') {
                    dataChannels[0].send(JSON.stringify(joinTeamMsg)); // Joiner sends request to host
                }
                showScreen('game'); // Transition for the joiner
            }
        }
    });

}

/**
 * Processes a team join action locally for the host and broadcasts the result.
 * This prevents the host from having to send a message to itself.
 * @param {object} joinData - The data for the join event.
 */
async function processLocalTeamJoin(joinData) {
    const joiningPlayerId = joinData.playerId;
    const newTeamName = joinData.teamName;

    // Set the team for the local player (the host)
    appState.playerTeam = newTeamName;

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
        const message = { type: 'player-left-team', teamName: oldTeamName, playerId: joiningPlayerId };
        const messageString = JSON.stringify(message);
        dataChannels.forEach(c => c.send(messageString));
    }

    const team = appState.teams[newTeamName];
    // Add player to the new team
    if (team && !team.members.includes(joiningPlayerId)) {
        team.members.push(joiningPlayerId);

        // If this is the first member, initialize the game state for the host
        if (team.members.length === 1 && !team.gameState) {
            const gameModule = await import(`./games/${team.gameType}.js`);
            team.gameState = gameModule.getInitialState(team.difficulty, team.gameMode);

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
    }

    // Update the host's own grid
    await loadGame(team.gameType);
    await updateGridForTeam(newTeamName);

    showScreen('game');
}

/**
 * Loads the correct game board for a host who is playing solo (not on a team).
 * This is used on initial page load and when returning from the config screen.
 */
export async function initializeSoloGame() {
    if (appState.isInitiator && !appState.playerTeam) {
        const selectedGame = dom.gameSelector.value;

        // Now that state is guaranteed to exist, load the game's UI.
        await loadGame(selectedGame);
    }
}

/**
 * Displays the instructions modal with text relevant to the current game.
 */
function showInstructions() {
    const instructionsP = document.getElementById('instructions');
    const selectedGame = dom.gameSelector.value;

    let instructionText = '';
    switch (selectedGame) {
        case 'sudoku':
            instructionText = 'Click on a grid cell to change its value. Use the number pad to enter a number. Use the pencil button to make notes.';
            break;
        case 'connect4':
            const gameMode = dom.connect4ModeSelect.value;
            if (gameMode === 'standard') {
                instructionText = 'You are Player 1 (Yellow/Theme Color 1). Play against the computer or a connected friend and try to get four of your pieces in a row.';
            } else if (gameMode === 'five-in-a-row') {
                instructionText = 'You are Player 1 (Yellow/Theme Color 1). Play against the computer or a friend to get five of your pieces in a row on a larger 9x6 board.';
            } else {
                instructionText = 'Work with your teammates to fill the entire board without anyone getting four-in-a-row. A single line of four by any team results in a loss for everyone!';
            }
            break;
        case 'wordsearch':
            instructionText = 'Click and drag to highlight words in the grid. Find all the words in the list to win. This is a cooperative game!';
            break;
        case 'spellingbee':
            const spellingBeeMode = dom.spellingbeeModeSelect.value;
            if (spellingBeeMode === 'multiple-choice') {
                instructionText = 'Listen to the word, then select the correct spelling from the options provided.';
            } else if (spellingBeeMode === 'type-it-out') {
                instructionText = 'Listen to the word, then type the correct spelling and press Enter or click Submit.';
            } else if (spellingBeeMode === 'anagram') {
                instructionText = 'Listen to the word, then drag the letters into the correct order to spell it.';
            } else {
                instructionText = 'Listen to the word, then drag the correct letters into the correct order. There are extra letters!';
            }
            break;
        case 'memorymatch':
            instructionText = 'Click on cards to flip them over. Work with your team to find all the matching pairs!';
            break;
        case 'blackjack':
            instructionText = 'Place your bet, then try to get a hand value closer to 21 than the dealer without going over. Good luck!';
            break;
        default:
            instructionText = 'Select a game and start playing!';
    }

    instructionsP.textContent = instructionText;
    dom.instructionsModal.classList.remove('hidden');

    // Hide the instructions after 4 seconds
    setTimeout(() => {
        dom.instructionsModal.classList.add('hidden');
    }, 4000);
}

/**
 * Performs a "soft reset" of the application by unregistering service workers
 * and clearing caches, but preserving localStorage before reloading the page.
 */
async function performSoftReset() {
    if (!confirm('Are you sure you want to reset? This will clear caches and service workers but preserve your settings.')) {
        return;
    }

    try {
        // 1. Unregister all service workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
                console.log('Service Worker unregistered:', registration);
            }
        }

        // 2. Clear all caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            console.log('All caches cleared.');
        }

        alert('Application has been reset. The page will now reload.');
        window.location.reload();
    } catch (error) {
        console.error('Error during soft reset:', error);
        alert('An error occurred during the reset. Please try clearing your browser cache manually.');
    }
}

/**
 * Toggles the visibility of the data channel list and updates the button text.
 */
function toggleChannelList() {
    const isHidden = dom.channelList.classList.contains('hidden');

    if (isHidden) {
        // If hidden, render the list, show it, and update button text
        renderChannelList();
        dom.channelList.classList.remove('hidden');
        dom.showChannelsBtn.textContent = 'Hide Channels';
    } else {
        // If visible, hide it and revert button text
        dom.channelList.classList.add('hidden');
        dom.showChannelsBtn.textContent = 'Show Channels';
    }
}

/**
 * Performs a "hard reset" of the application by unregistering service workers,
 * clearing caches, and clearing local storage before reloading the page.
 */
async function performHardReset() {
    if (!confirm('Are you sure you want to perform a hard reset? This will clear all saved data and reload the application.')) {
        return;
    }

    try {
        // 1. Unregister all service workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
                console.log('Service Worker unregistered:', registration);
            }
        }

        // 2. Clear all caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            console.log('All caches cleared.');
        }

        // 3. Clear localStorage for this site
        localStorage.clear();
        console.log('localStorage cleared.');

        // 4. Inform the user and reload
        alert('Application has been reset. The page will now reload.');
        window.location.reload();
    } catch (error) {
        console.error('Error during hard reset:', error);
        alert('An error occurred during the reset. Please try clearing your browser cache manually.');
    }
}

/**
 * Handles a change in the theme selection from either dropdown.
 * Updates the body class, saves the choice to localStorage, and syncs both dropdowns.
 * @param {Event} event - The change event from the select element.
 */
function handleThemeChange(event) {
    const selectedTheme = event.target.value;
    dom.body.classList.remove('default', 'dark-mode', 'banished', 'unsc', 'forerunner');
    dom.body.classList.add(selectedTheme);
    localStorage.setItem('sudokuTheme', selectedTheme); // Save the theme choice
    // No need to sync dropdowns anymore as there is only one
}

/**
 * Renders the list of currently active WebRTC data channels in the UI,
 * including a "Disconnect" button for each.
 */
function renderChannelList() {
    const channelList = document.getElementById('channel-list');
    channelList.innerHTML = ''; // Clear the existing list

    if (dataChannels.length === 0) {
        channelList.innerHTML = '<li>No active channels.</li>';
        return;
    }

    dataChannels.forEach((channel, index) => {
        // Create a list item for each channel
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <span>Channel ${index + 1}: ${channel.label}</span>
            <button class="disconnect-btn" data-channel-index="${index}">Disconnect</button>
        `;
        channelList.appendChild(listItem);
    });
}

/**
 * Handles the click event on a 'disconnect' button to close a specific data channel.
 * @param {Event} event - The click event from the channel list.
 */
function disconnectChannel(event) {
    if (event.target.classList.contains('disconnect-btn')) {
        const index = event.target.getAttribute('data-channel-index');
        const channelToDisconnect = dataChannels[index];

        if (channelToDisconnect && channelToDisconnect.readyState === 'open') {
            channelToDisconnect.close();
            // Remove the channel from the array
            dataChannels.splice(index, 1);
            console.log(`Channel ${channelToDisconnect.label} disconnected.`);
            renderChannelList(); // Re-render the list
        }
    }
}