//==============================
//UI Logic
//==============================

import { appState, dom, pressTimer, dataChannels, startPressTimer } from './scripts.js';
import { clearAllHighlights, loadPuzzle, checkGridState, highlightMatchingCells } from './game.js';
import { clearTextbox, createQrCodeChunks, playBeepSound } from './misc.js';
import { SUDOKU_SERVICE_PEER_PREFIX, initializePeerJs, connectToPeerJS, sendOffer, sendAnswer } from './peer.js';
import { createOffer, createAnswer } from './webrtc.js';

//Toggles visibility of signaling areas
function toggleSignalingArea() {
    dom.signalingArea.classList.toggle('hidden');
    dom.sudokuGridArea.classList.toggle('hidden');

    // Show or hide the 'Load New Puzzle' area based on the player role
    if (appState.isInitiator) {
        dom.sudokuLoadPuzzleArea.classList.remove('hidden');
    } else {
        dom.sudokuLoadPuzzleArea.classList.add('hidden');
    }

    // Toggle the 'connection-background' class on the body
    document.body.classList.toggle('connection-background');

    if (dom.signalingArea.classList.contains('hidden')) {
        dom.sudokuGridArea.scrollIntoView({ behavior: 'smooth' });
    } else {
        dom.signalingArea.scrollIntoView({ behavior: 'smooth' });
    }
}

//Toggles visibility of specific signaling sections
export function toggleSignalingUI() {
    const signalingMethod = dom.signalingMethodSelect.value;
    const playerRole = dom.playerRoleSelect.value;
    if (signalingMethod === 'none' ||
        playerRole === 'none') {
        return;
    }

    appState.isInitiator = playerRole === 'host';

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
        if (appState.isInitiator) {
            dom.p1PeerArea.classList.remove('hidden');
        } else {
            dom.p2PeerArea.classList.remove('hidden');
        }
    }
}

//Hides the signaling UI completely and shows the game
export function hideSignalingUI() {
    dom.signalingArea.style.display = 'none';
    dom.sudokuGridArea.classList.remove('hidden');
}

// All of your QR-related functions go here...

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

// All of your manual signaling functions go here...

// Global variable for the WebRTC connection object
let rtcConnection = null; // This will hold the native RTCPeerConnection

//=====Manual Connection...
//Handles manual offer creation
async function createOfferManual() {
    rtcConnection = await createOffer();
    rtcConnection.onicegatheringstatechange = () => {
        if (rtcConnection.iceGatheringState === 'complete') {
            dom.offerTextarea.value = JSON.stringify(rtcConnection.localDescription);
        }
    };
}

//Handles adding a manual answer to an offer
async function addAnswerManual() {
    const answer = JSON.parse(dom.receivedAnswerTextarea.value);
    if (rtcConnection.signalingState !== 'stable') {
        await rtcConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
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
//...Manual Connection=====

//=====PeerJS functions...
async function PeerJSInitiate() {
    try {
        // Step 1: Initialize PeerJS. The returned value is the PeerJS 'Peer' object.
        const peerJSObject = await initializePeerJs(true);

        // Step 2: Listen for the 'connection' event to get the actual data connection.
        peerJSObject.on('connection', async (peerJSConnection) => {
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
                    }
                };
            });
        });
    } catch (error) {
        console.error('Failed to initialize PeerJS:', error);
    }
}
//...PeerJS functions=====

//=====QR functions...
let qrScanner = null;
let qrScannerHost = null;

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
//...QR functions=====

export function initializeEventListeners() {
    // This includes all the dom.caching and event listeners
    // Event listeners for drop-downs
    dom.signalingMethodSelect.addEventListener('change', toggleSignalingUI);
    dom.playerRoleSelect.addEventListener('change', toggleSignalingUI);

    // Event listeners for game-related buttons
    dom.newPuzzleButton.addEventListener('click', () => {
        loadPuzzle(appState.selectedDifficulty);
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
        if (dom.signalingMethodSelect.value === 'peerJS') {

            if (appState.isInitiator) {
                await PeerJSInitiate();
            }
        }
    });

    dom.generateNewIDButton.addEventListener('click', async () => {
        if (dom.signalingMethodSelect.value === 'peerJS') {

            if (appState.isInitiator) {
                await PeerJSInitiate();
            }
        }
    });

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

    // Event listener for the theme selector
    dom.themeSelector.addEventListener('change', (event) => {
        const selectedTheme = event.target.value;
        dom.body.classList.remove('default', 'banished', 'unsc', 'forerunner');
        dom.body.classList.add(selectedTheme);
    });

    // Event listener for the theme selector
    dom.difficultySelector.addEventListener('change', (event) => {
        appState.selectedDifficulty = event.target.value;
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

            // Broadcast the move to all other players
            dataChannels.forEach(otherChannel => {
                if (otherChannel.readyState === 'open') {
                    otherChannel.send(JSON.stringify(move));
                }
            });

            // Remove active class from the old cell to avoid confusion
            appState.activeCell.classList.remove('active-cell');

            // Clear all highlights and check grid state after a change
            clearAllHighlights();
            checkGridState();

            // Reset the active cell
            appState.activeCell = null;

            if (value != '') {
                highlightMatchingCells(value);
            }
        }
    });

    dom.showChannelsBtn.addEventListener('click', renderChannelList);
    dom.channelList.addEventListener('click', disconnectChannel);

    dom.instructionsModal.style.display = "block";

    // Hide the intructions after 6 seconds
    setTimeout(() => {
        if (dom.instructionsModal) {
            dom.instructionsModal.style.display = 'none';
        }
    }, 6000);
}

// Function to render the list of channels
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

// Function to handle the disconnect action
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