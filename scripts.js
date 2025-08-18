//==============================
//Global Variables and DOM Elements
//==============================
let peerConnection;
let dataChannel;
let qrScanner = null;
let qrScannerHost = null;
let pressTimer = null; // Declare pressTimer globally

//State object to manage application state
const appState = {
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

//Cache DOM elements for faster access
const dom = {
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
    prevQrBtn: document.getElementById('prev-qr'),
    nextQrBtn: document.getElementById('next-qr'),
    prevQrAnswerBtn: document.getElementById('prev-qr-answer'),
    nextQrAnswerBtn: document.getElementById('next-qr-answer'),
    scannerStatus: document.getElementById('scanner-status'),
    scannerStatusHost: document.getElementById('scanner-status-host'),
    playerRoleSelect: document.getElementById('player-role'),
    signalingMethodSelect: document.getElementById('signaling-method')
};

const themeSelector = document.getElementById('theme-select');
const body = document.body;

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
    
    qrScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250} });
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
    
    qrScannerHost = new Html5QrcodeScanner("qr-reader-host", { fps: 10, qrbox: {width: 250, height: 250} });
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
//Game UI and Logic
//==============================

//Creates the Sudoku grid
function createGrid() {
    if (dom.sudokuGrid.firstChild) {
        while (dom.sudokuGrid.firstChild) {
            dom.sudokuGrid.removeChild(dom.sudokuGrid.firstChild);
        }
    }
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.id = `cell-${row}-${col}`;
            cell.textContent = '';
            
            if ((col + 1) % 3 === 0 && col < 8) {
                cell.classList.add('subgrid-border-right');
            }
            if ((row + 1) % 3 === 0 && row < 8) {
                cell.classList.add('subgrid-border-bottom');
            }
            
            cell.addEventListener('mousedown', startPressTimer);
            cell.addEventListener('touchstart', startPressTimer);
            cell.addEventListener('mouseup', handleCellClick);
            cell.addEventListener('touchend', handleCellClick);
            cell.addEventListener('mouseleave', () => clearTimeout(pressTimer));

            dom.sudokuGrid.appendChild(cell);
        }
    }
}

//Starts the timer for a long press
function startPressTimer(event) {
    clearTimeout(pressTimer);
    appState.isLongPressActive = false;
    const cell = event.currentTarget;
    pressTimer = setTimeout(() => {
        handleLongPress(cell);
    }, 500);
}

//Handles a cell click or tap
function handleCellClick(event) {
    clearTimeout(pressTimer);
    const currentTime = new Date().getTime();
    if (currentTime - appState.lastEventTimestamp < 100) {
        appState.lastEventTimestamp = 0;
        return;
    }
    appState.lastEventTimestamp = currentTime;

    if (appState.isLongPressActive) {
        appState.isLongPressActive = false;
        return;
    }
    const cell = event.currentTarget;
    if (cell.classList.contains('preloaded-cell')) {
        const value = cell.textContent.trim();
        if (value !== '') {
            clearAllHighlights();
            highlightMatchingCells(value);
        }
        return;
    }
    if (appState.activeCell === cell) {
        const currentValue = cell.textContent.trim();
        let newValue;
        if (currentValue === '9') {
            newValue = '';
        } else if (currentValue === '') {
            newValue = 1;
        } else {
            newValue = parseInt(currentValue, 10) + 1;
        }
        
        cell.textContent = newValue;
        const move = {
            type: 'move',
            row: cell.id.split('-')[1],
            col: cell.id.split('-')[2],
            value: newValue
        };
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(move));
        }
        clearAllHighlights();
        highlightMatchingCells(newValue.toString());
        checkGridState();
        
    } else {
        if (appState.activeCell) {
            appState.activeCell.classList.remove('active-cell');
        }
        appState.activeCell = cell;
        cell.classList.add('active-cell');
        clearAllHighlights();
        const value = cell.textContent.trim();
        if (value !== '') {
            highlightMatchingCells(value);
        }
    }
}

//Handles a cell long-press
function handleLongPress(cell) {
    appState.isLongPressActive = true;
    const value = cell.textContent.trim();
    if (value !== '') {
        clearAllHighlights();
        highlightMatchingCells(value);
    }
}

//Highlights all cells with a matching value
function highlightMatchingCells(value) {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        if (cell.textContent.trim() === value && !cell.classList.contains('invalid-cell') && !cell.classList.contains('solved-puzzle')) {
            cell.classList.add('highlight-cell');
        }
    });
}

//Removes all highlight classes
function clearAllHighlights() {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        cell.classList.remove('highlight-cell');
    });
}

//Fetches and loads a new puzzle
async function loadPuzzle(puzzleData) {
    createGrid();
    let puzzle = puzzleData;
    let isRemoteLoad = !!puzzleData;
    
    if (!isRemoteLoad) {
        try {
            const response = await fetch('https://sugoku.onrender.com/board?difficulty=easy');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            puzzle = data.board;
            appState.initialSudokuState = puzzle;
        } catch (error) {
            console.error('Failed to load puzzle:', error);
            alert('Failed to load puzzle. Please ensure you are running a local web server to avoid CORS issues.');
            return;
        }
    }
    
    for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            const value = puzzle[row][col];
            cell.textContent = value === 0 ? '' : value;
            if (value !== 0) {
                cell.classList.add('preloaded-cell');
            }
        }
    }
    
    checkGridState();
    if (!isRemoteLoad && dataChannel && dataChannel.readyState === 'open') {
        const puzzleMessage = { type: 'initial-state', state: puzzle };
        dataChannel.send(JSON.stringify(puzzleMessage));
    }
}

//Validates the entire puzzle grid for conflicts and completeness
function validatePuzzle() {
    const invalidCells = new Set();
    let isComplete = true;
    const gridValues = [];

    for (let row = 0; row < 9; row++) {
        const rowValues = [];
        for (let col = 0; col < 9; col++) {
            const cellValue = document.getElementById(`cell-${row}-${col}`).textContent.trim();
            rowValues.push(cellValue);
            if (cellValue === '') {
                isComplete = false;
            }
        }
        gridValues.push(rowValues);
    }
    
    const checkConflicts = (arr) => {
        const seen = new Set();
        for (const num of arr) {
            if (num !== '' && seen.has(num)) {
                return true;
            }
            if (num !== '') {
                seen.add(num);
            }
        }
        return false;
    };

    // Check rows, columns, and subgrids
    for (let i = 0; i < 9; i++) {
        const rowValues = gridValues[i];
        const colValues = [];
        for (let j = 0; j < 9; j++) {
            colValues.push(gridValues[j][i]);
        }
        
        if (checkConflicts(rowValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[i][j] !== '') invalidCells.add(`cell-${i}-${j}`);
            }
        }
        if (checkConflicts(colValues)) {
            for (let j = 0; j < 9; j++) {
                if (gridValues[j][i] !== '') invalidCells.add(`cell-${j}-${i}`);
            }
        }

        const subgridValues = [];
        const startRow = Math.floor(i / 3) * 3;
        const startCol = (i % 3) * 3;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                subgridValues.push(gridValues[startRow + row][startCol + col]);
            }
        }
        if (checkConflicts(subgridValues)) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    if (gridValues[startRow + row][startCol + col] !== '') invalidCells.add(`cell-${startRow + row}-${startCol + col}`);
                }
            }
        }
    }

    document.querySelectorAll('.grid-cell').forEach(cell => {
        const isPreloaded = cell.classList.contains('preloaded-cell');
        if (!isPreloaded) {
            cell.classList.remove('invalid-cell', 'solved-puzzle');
            if (invalidCells.has(cell.id)) {
                cell.classList.add('invalid-cell');
            }
        }
    });
    return { isValid: invalidCells.size === 0, isComplete: isComplete };
}

//Checks the current state of the grid for a win condition
function checkGridState() {
    const { isValid, isComplete } = validatePuzzle();
    if (isComplete && isValid) {
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.add('solved-puzzle');
        });
        alert("Congratulations! The puzzle is solved!");
    }
}

//==============================
//UI State Management
//==============================

//Toggles visibility of signaling areas
function toggleSignalingArea() {
    dom.signalingArea.classList.toggle('hidden');
    dom.sudokuGridArea.classList.toggle('hidden');
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
    }
}

//Hides the signaling UI completely and shows the game
function hideSignalingUI() {
    dom.signalingArea.style.display = 'none';
    dom.sudokuGridArea.classList.remove('hidden');
}

//==============================
//Initial Setup
//==============================

document.addEventListener('DOMContentLoaded', () => {
    dom.prevQrBtn.disabled = true;
    dom.nextQrBtn.disabled = true;
    dom.prevQrAnswerBtn.disabled = true;
    dom.nextQrAnswerBtn.disabled = true;
    
    createGrid();
    loadPuzzle();
    
    dom.signalingMethodSelect.addEventListener('change', toggleSignalingUI);
    dom.playerRoleSelect.addEventListener('change', toggleSignalingUI);
    
    toggleSignalingUI();
});

// Add an event listener to the theme selector
themeSelector.addEventListener('change', (event) => {
    // Get the selected theme from the dropdown
    const selectedTheme = event.target.value;
    
    // Remove any existing theme classes
    body.classList.remove('banished', 'unsc', 'forerunner');
    
    // Add the new theme class if it's not the default
    if (selectedTheme !== 'default') {
        body.classList.add(selectedTheme);
    }
});
