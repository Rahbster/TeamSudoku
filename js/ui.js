//==============================
//UI Logic
//==============================
// This module handles all user interface interactions, from button clicks to dynamic UI updates.
import { appState, dom, dataChannels } from './scripts.js';
import { clearAllHighlights, loadPuzzle, checkGridState, highlightMatchingCells, isMoveValid, highlightConflictingCells, updateGridForTeam, validatePuzzle } from './game.js';
import { clearTextbox, createQrCodeChunks, playBeepSound, playRemoteMoveSound } from './misc.js';
import { SUDOKU_SERVICE_PEER_PREFIX, initializePeerJs, connectToPeerJS, sendOffer, sendAnswer } from './peer.js';
import { createOffer, createAnswer, processAndBroadcastMove } from './webrtc.js';


/**
 * Manages the visibility of the main application screens.
 * @param {'config' | 'game'} screenName - The name of the screen to show.
 */
export function showScreen(screenName) {
    dom.gameScreen.classList.add('hidden');
    dom.configScreen.classList.add('hidden');
    document.body.classList.remove('connection-background');

    if (screenName === 'config') {
        dom.configScreen.classList.remove('hidden');
        document.body.classList.add('connection-background');
        dom.backToGameBtn.classList.remove('hidden'); // Always show the back button
    } else if (screenName === 'game') {
        dom.gameScreen.classList.remove('hidden');
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
        teams.sort(); // Sort the team names alphabetically
        teams.forEach(teamName => {
            const li = document.createElement('li');
            // The remove button is only visible to the host, controlled by the .host-only class in CSS
            li.innerHTML = `<span>${teamName}</span>
                            <div class="team-buttons">
                                <button class="remove-team-btn host-only" data-team-name="${teamName}">Remove</button>
                                <button class="join-team-btn" data-team-name="${teamName}">Join</button>
                            </div>`;
            dom.teamList.appendChild(li);
        });
    }
}

/**
 * Displays a winner screen when a team solves the puzzle.
 * @param {string} winningTeam - The name of the team that won.
 */
export function showWinnerScreen(winningTeam) {
    if (appState.winner) return; // Already showing

    appState.winner = winningTeam;
    appState.gameInProgress = false;

    dom.winnerModal.classList.remove('hidden');
    
    if (winningTeam) {
        dom.winnerText.textContent = `Team "${winningTeam}" has won the game!`;
    } else {
        dom.winnerText.textContent = 'You have won the game!';
    }

    // Highlight the solved puzzle for the winning team
    if (appState.playerTeam === winningTeam) {
        document.querySelectorAll('.grid-cell').forEach(cell => cell.classList.add('solved-puzzle'));
    } else {
        // For other teams, just show the modal without the green solved effect
        dom.sudokuGridArea.classList.add('hidden');
        dom.numberPad.classList.add('hidden');
    }
}

/**
 * Displays a short-lived toast notification at the bottom of the screen.
 * @param {string} message - The message to display in the toast.
 */
export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;

    document.body.appendChild(toast);

    // The animation will handle the fade-in and fade-out, but we remove the element after.
    setTimeout(() => {
        toast.remove();
    }, 4000); // Matches the animation duration
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
    qrScanner.render(onScanSuccess, onScanFailure);
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
    qrScannerHost.render(onHostScanSuccess, onHostScanFailure);
}

/**
 * Callback function for a successful QR code scan by the joiner (Player 2).
 * It collects scanned chunks and, once all are received, assembles the offer and creates an answer.
 * @param {string} decodedText - The text decoded from the QR code.
 */
async function onScanSuccess(decodedText) {
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

    // If all chunks have been scanned, assemble the SDP and create an answer.
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

/**
 * Callback for a failed QR code scan attempt. Logs a warning to the console.
 * @param {string} error - The error message from the scanner.
 */
function onScanFailure(error) {
    console.warn(`QR code scan error: ${error}`);
}

/**
 * Callback function for a successful QR code scan by the host (Player 1).
 * It collects scanned chunks and, once all are received, assembles the answer and completes the connection.
 * @param {string} decodedText - The text decoded from the QR code.
 */
async function onHostScanSuccess(decodedText) {
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

    // If all chunks are scanned, assemble the SDP and set it as the remote description.
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

/**
 * Callback for a failed QR code scan attempt by the host. Logs a warning to the console.
 * @param {string} error - The error message from the scanner.
 */
function onHostScanFailure(error) {
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
//...QR functions=====

/**
 * Initializes all primary event listeners for the application's UI elements.
 */
export function initializeEventListeners() {
    // Event listeners for drop-downs
    dom.signalingMethodSelect.addEventListener('change', toggleSignalingUI);
    dom.playerRoleSelect.addEventListener('change', toggleSignalingUI);

    // Event listeners for game-related buttons
    dom.newPuzzleButton.addEventListener('click', () => {
        loadPuzzle(appState.selectedDifficulty, null, false); // Do not reset teams
        dom.winnerModal.classList.add('hidden'); // Hide winner modal on new puzzle
    });
    dom.newPuzzleWinnerBtn.addEventListener('click', () => {
        loadPuzzle(appState.selectedDifficulty, null, false); // Do not reset teams
        dom.winnerModal.classList.add('hidden'); // Hide winner modal
    });

    // Event listener for the theme selector
    dom.themeSelector.addEventListener('change', handleThemeChange);
    dom.themeSelectorConfig.addEventListener('change', handleThemeChange);

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
    dom.configBtn.addEventListener('click', () => showScreen('config'));
    dom.backToGameBtn.addEventListener('click', () => showScreen('game'));


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

    // Event listener for the pencil mode button
    dom.pencilButton.addEventListener('click', () => {
        appState.isPencilMode = !appState.isPencilMode;
        document.getElementById('pencil-status').textContent = appState.isPencilMode ? 'ON' : 'OFF';
        dom.pencilButton.classList.toggle('pencil-active', appState.isPencilMode);
    });

    // Event listener to the number pad
    dom.numberPad.addEventListener('click', (event) => {
        // Check if a number button or the empty button was clicked and if a cell is active
        if (event.target.classList.contains('number-btn') && appState.activeCell) {
            // Check if the cell is a preloaded cell (you should not be able to change it)
            if (appState.activeCell.classList.contains('preloaded-cell')) {
                return;
            }

            if (appState.isPencilMode) {
                // PENCIL MODE LOGIC
                if (event.target.id !== 'empty-btn') {
                    const digit = parseInt(event.target.textContent, 10);
                    const [_, row, col] = appState.activeCell.id.split('-');

                    // Create a board representation from the DOM
                    const board = [];
                    for (let r = 0; r < 9; r++) {
                        board[r] = [];
                        for (let c = 0; c < 9; c++) {
                            const cell = document.getElementById(`cell-${r}-${c}`);
                            const value = cell.querySelector('.cell-value').textContent.trim();
                            board[r][c] = value === '' ? 0 : parseInt(value, 10);
                        }
                    }

                    // Check if the move is valid before adding the scratch mark
                    if (isMoveValid(board, parseInt(row, 10), parseInt(col, 10), digit)) {
                        const scratchDigit = appState.activeCell.querySelector(`.scratch-pad-digit[data-digit="${digit}"]`);
                        if (scratchDigit) {
                            scratchDigit.style.visibility = scratchDigit.style.visibility === 'visible' ? 'hidden' : 'visible';
                        }
                    } else {
                        // Optionally, provide feedback that the number is invalid
                        highlightConflictingCells(parseInt(row, 10), parseInt(col, 10), digit.toString());
                        playBeepSound();
                        // Clear the highlights after a short delay
                        setTimeout(() => {
                            document.querySelectorAll('.invalid-cell').forEach(c => c.classList.remove('invalid-cell'));
                            validatePuzzle(); // Re-validate to restore any legitimate invalid cells
                        }, 1000);
                    }
                } else {
                    // Clear all scratch marks in the cell
                    appState.activeCell.querySelectorAll('.scratch-pad-digit').forEach(d => d.style.visibility = 'hidden');
                }
            } else {
                // NORMAL MODE LOGIC
                let value;
                if (event.target.id === 'empty-btn') {
                    value = ''; // Allow clearing the cell
                } else {
                    value = parseInt(event.target.textContent, 10);
                }

                const [_, row, col] = appState.activeCell.id.split('-');
                const board = [];
                for (let r = 0; r < 9; r++) {
                    board[r] = [];
                    for (let c = 0; c < 9; c++) {
                        const cell = document.getElementById(`cell-${r}-${c}`);
                        const cellVal = cell.querySelector('.cell-value').textContent.trim();
                        board[r][c] = cellVal === '' ? 0 : parseInt(cellVal, 10);
                    }
                }

                // Only proceed if the move is valid or if clearing the cell
                if (value === '' || isMoveValid(board, parseInt(row, 10), parseInt(col, 10), value)) {
                    // Clear scratchpad when a final number is entered
                    appState.activeCell.querySelectorAll('.scratch-pad-digit').forEach(d => d.style.visibility = 'hidden');
                    appState.activeCell.querySelector('.cell-value').textContent = value;

                    const move = {
                        type: 'move',
                        team: appState.playerTeam,
                        row: parseInt(row, 10),
                        col: parseInt(col, 10),
                        value: value,
                        playerId: appState.playerId, // The user-configurable name
                        sessionId: appState.sessionId // The unique session ID
                    };

                    if (appState.isInitiator) {
                        // Host processes its own move directly.
                        processAndBroadcastMove(move);
                    } else {
                        // Joiner sends the move to the host for processing.
                        if (dataChannels.length > 0 && dataChannels[0].readyState === 'open') {
                            dataChannels[0].send(JSON.stringify(move));
                        }
                    }

                    // The move is valid, so update highlights for the new value.
                    clearAllHighlights();
                    if (value !== '') {
                        highlightMatchingCells(value);
                    }
                    checkGridState();
                } else {
                    highlightConflictingCells(parseInt(row, 10), parseInt(col, 10), value.toString());
                    playBeepSound(); // Play sound for invalid move
                    // Clear the highlights after a short delay
                    setTimeout(() => {
                        document.querySelectorAll('.invalid-cell').forEach(c => c.classList.remove('invalid-cell'));
                        validatePuzzle(); // Re-validate to restore any legitimate invalid cells
                    }, 1000);
                }
            }
        }
    });

    dom.showChannelsBtn.addEventListener('click', toggleChannelList);
    dom.channelList.addEventListener('click', disconnectChannel);
    dom.hardResetBtn.addEventListener('click', performHardReset);


    // Event listeners for team selection
    dom.createTeamBtn.addEventListener('click', () => {
        const teamName = dom.teamNameInput.value.trim();
        if (teamName) {
            // Host creates the team locally
            if (!appState.teams[teamName]) {
                appState.teams[teamName] = { puzzle: JSON.parse(JSON.stringify(appState.initialSudokuState)), members: [] };
                updateTeamList(Object.keys(appState.teams)); // Update host's own list

                // Broadcast the new team list to all joiners
                const teamListUpdateMsg = { type: 'team-list-update', teams: Object.keys(appState.teams) };
                const messageString = JSON.stringify(teamListUpdateMsg);
                dataChannels.forEach(c => c.send(messageString));

                // Save the updated team list to localStorage
                const teamNames = Object.keys(appState.teams);
                localStorage.setItem('sudokuTeams', JSON.stringify(teamNames));
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

                // Update localStorage
                const teamNames = Object.keys(appState.teams);
                localStorage.setItem('sudokuTeams', JSON.stringify(teamNames));

                // Update UI for host and broadcast to joiners
                updateTeamList(teamNames);
                const teamListUpdateMsg = { type: 'team-list-update', teams: teamNames };
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

    dom.instructionsModal.classList.remove('hidden');

    // Hide the instructions after 3 seconds
    setTimeout(() => {
        if (dom.instructionsModal) {
            dom.instructionsModal.classList.add('hidden');
        }
    }, 3000); // Set to 3 seconds as you originally intended
}

/**
 * Processes a team join action locally for the host and broadcasts the result.
 * This prevents the host from having to send a message to itself.
 * @param {object} joinData - The data for the join event.
 */
function processLocalTeamJoin(joinData) {
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

    // Add player to the new team
    if (appState.teams[newTeamName] && !appState.teams[newTeamName].members.includes(joiningPlayerId)) {
        appState.teams[newTeamName].members.push(joiningPlayerId);
    }

    // Update the host's own grid
    updateGridForTeam(newTeamName);

    showScreen('game');
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
    // Sync both dropdowns
    dom.themeSelector.value = selectedTheme;
    dom.themeSelectorConfig.value = selectedTheme;
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