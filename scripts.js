
    

        let peerConnection;
        let dataChannel;
        let isInitiator = false;
        let initialSudokuState = [];
        let activeCell = null;
        let qrScanner = null;

        // New global variables for chunking
        let offerChunks = [];
        let currentChunkIndex = 0;
        let scannedChunks = [];
        let totalChunksToScan = 0;
        let isAnswer = false;

        const offerTextarea = document.getElementById('offer-text');
        const receivedOfferTextarea = document.getElementById('received-offer-text');
        const answerTextarea = document.getElementById('answer-text');
        const receivedAnswerTextarea = document.getElementById('received-answer-text');
        const p1Status = document.getElementById('p1-status');
        const p2Status = document.getElementById('p2-status');
        const p1QrStatus = document.getElementById('p1-qr-status');
        const p2QrStatus = document.getElementById('p2-qr-status');
        const sudokuGrid = document.getElementById('sudoku-grid');
        const sudokuGridArea = document.getElementById('sudoku-grid-area');
        const signalingArea = document.getElementById('signaling-area');
        const manualSignalingArea = document.getElementById('manual-signaling-area');
        const qrSignalingArea = document.getElementById('qr-signaling-area');
        const p1ManualArea = document.getElementById('p1-manual-area');
        const p2ManualArea = document.getElementById('p2-manual-area');
        const p1QrArea = document.getElementById('p1-qr-area');
        const p2QrArea = document.getElementById('p2-qr-area');
        const qrCodeDisplay = document.getElementById('qr-code-display');
        const qrCodeAnswerDisplay = document.getElementById('qr-code-display-answer');
        const chunkStatus = document.getElementById('chunk-status');
        const prevQrBtn = document.getElementById('prev-qr');
        const nextQrBtn = document.getElementById('next-qr');
        const scannerStatus = document.getElementById('scanner-status');

        let pressTimer;
        let isLongPressActive = false; // New global flag
        let lastEventTimestamp = 0;

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
            
            peerConnection.ondatachannel = event => {
                dataChannel = event.channel;
                setupDataChannel(dataChannel);
            };
        }

        function setupDataChannel(channel) {
            channel.onopen = () => {
                console.log('Data Channel is open!');
                p1Status.textContent = 'Status: Connected!';
                p2Status.textContent = 'Status: Connected!';
                p1QrStatus.textContent = 'Status: Connected!';
                p2QrStatus.textContent = 'Status: Connected!';
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

        // --- Signaling Functions (Manual Copy/Paste) ---
        async function createOfferManual() {
            isInitiator = true;
            initializeWebRTC();
            
            dataChannel = peerConnection.createDataChannel('sudoku-game');
            setupDataChannel(dataChannel);

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    offerTextarea.value = JSON.stringify(peerConnection.localDescription);
                }
            };
        }

        async function createAnswerManual() {
            initializeWebRTC();
            const offer = JSON.parse(receivedOfferTextarea.value);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    answerTextarea.value = JSON.stringify(peerConnection.localDescription);
                }
            };
        }

        async function addAnswerManual() {
            const answer = JSON.parse(receivedAnswerTextarea.value);
            if (peerConnection.signalingState !== 'stable') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        }

        // --- Signaling Functions (QR Code) ---
        async function createOfferQr() {
            isInitiator = true;
            isAnswer = false;
            initializeWebRTC();
            
            dataChannel = peerConnection.createDataChannel('sudoku-game');
            setupDataChannel(dataChannel);

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    const sdpString = JSON.stringify(peerConnection.localDescription);
                    const base64Sdp = btoa(sdpString);
                    offerChunks = createQrCodeChunks(base64Sdp);
                    currentChunkIndex = 0;
                    displayCurrentChunk();
                    p1QrStatus.textContent = 'Status: Offer created. Show codes to Player 2.';
                }
            };
        }
        
async function createAnswerQr() {
    isAnswer = true;
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    peerConnection.onicegatheringstatechange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
            const answerSdp = JSON.stringify(peerConnection.localDescription);
            const answerChunks = createQrCodeChunks(answerSdp);

            // Display all answer chunks and navigation for Player 1 to scan
            qrCodeAnswerDisplay.innerHTML = '';
            let currentAnswerChunkIndex = 0;

            const displayAnswerChunk = () => {
                qrCodeAnswerDisplay.innerHTML = '';
                new QRCode(qrCodeAnswerDisplay, {
                    text: answerChunks[currentAnswerChunkIndex],
                    width: 256,
                    height: 256
                });
                p2QrStatus.textContent = `Status: Showing chunk ${currentAnswerChunkIndex + 1} of ${answerChunks.length}.`;
            };

            // This is a temporary way to show the first QR. A proper solution would use navigation buttons like the offer.
            displayAnswerChunk();

            p2QrStatus.textContent = 'Status: Answer created. Show QR code(s) to Player 1.';
        }
    };
}
        function startQrScanner() {
            //Destroy any previous scanner to prevent multiple camera feeds
            if (qrScanner) {
                qrScanner.stop();
                qrScanner = null;
            }
            
            scannedChunks = [];
            totalChunksToScan = 0;
            scannerStatus.textContent = 'Status: Scanning first QR code...';
            
            qrScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250} });
            qrScanner.render(onScanSuccess, onScanFailure);
        }

async function onScanSuccess(decodedText) {
    console.log(`QR code detected: ${decodedText}`);

    // Regular expression to parse the new chunk format: [INDEX/TOTAL]:DATA
    const regex = /^\[(\d+)\/(\d+)\]:(.*)$/;
    const match = decodedText.match(regex);

    if (!match) {
        console.warn('Scanned text does not match expected QR chunk format.');
        return; // Ignore invalid QR codes
    }

    const chunkIndex = parseInt(match[1], 10);
    const totalChunks = parseInt(match[2], 10);
    const chunkData = match[3];

    // Check if we've already scanned this chunk
    if (scannedChunks.some(chunk => chunk.index === chunkIndex)) {
        console.log(`Ignoring duplicate scan for chunk ${chunkIndex}.`);
        return;
    }

    // Add the new chunk to our list
    scannedChunks.push({ index: chunkIndex, data: chunkData });
    scannerStatus.textContent = `Status: Scanned chunk ${scannedChunks.length} of ${totalChunks}.`;

    // Check if all chunks have been scanned
    if (scannedChunks.length === totalChunks) {
        // Stop the scanner
        if (qrScanner) {
            qrScanner.stop().then(() => {
                document.getElementById('qr-reader').innerHTML = '';
                document.getElementById('qr-reader').style.display = 'none';
            }).catch(err => console.error(err));
        }

        // Sort the chunks by index and reconstruct the original data
        scannedChunks.sort((a, b) => a.index - b.index);
        const fullSdp = scannedChunks.map(chunk => chunk.data).join('');
        const sdp = JSON.parse(fullSdp);

        if (sdp.type === 'offer') {
            // This is Player 2. Process the full offer and create an answer.
            initializeWebRTC();
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            await createAnswerQr();
            p2QrStatus.textContent = 'Status: All chunks scanned. Answer created.';
        } else if (sdp.type === 'answer' && isInitiator) {
            // This is Player 1. Process the full answer and connect.
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            p1QrStatus.textContent = 'Status: Answer received. Connecting...';
        }
    }
}
        
        function onScanFailure(error) {
            console.warn(`QR code scan error: ${error}`);
        }

        // New functions for navigating chunks
        function showNextChunk() {
            if (currentChunkIndex < offerChunks.length - 1) {
                currentChunkIndex++;
                displayCurrentChunk();
            }
        }

        function showPrevChunk() {
            if (currentChunkIndex > 0) {
                currentChunkIndex--;
                displayCurrentChunk();
            }
        }

        function displayCurrentChunk() {
            // Clear old QR code
            qrCodeDisplay.innerHTML = '';
            
            // Check if this is a QR code for the answer.
            //This is a comment.
            const textToEncode = offerChunks[currentChunkIndex];
            
            try {
                new QRCode(qrCodeDisplay, {
                           text: textToEncode,
                           width: 256,
                           height: 256
                });
            } catch (error) {
              // Code to handle the error
              alert("An error occurred:" + error.message);
            }
            chunkStatus.textContent = `Chunk ${currentChunkIndex + 1} of ${offerChunks.length}`;
            
            // Enable/disable navigation buttons
            prevQrBtn.disabled = (currentChunkIndex === 0);
            nextQrBtn.disabled = (currentChunkIndex === offerChunks.length - 1);
        }

//This function is now more robust.
//It embeds the chunk index and total number of chunks into each QR code.
function createQrCodeChunks(data) {
    const MAX_CHUNK_SIZE = 128; // A safe value for a single QR code
    const chunks = [];
    const fullChunks = Math.ceil(data.length / MAX_CHUNK_SIZE);
    
    for (let i = 0; i < fullChunks; i++) {
        const chunkData = data.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
        // Format each chunk as "[INDEX/TOTAL]:DATA"
        chunks.push(`[${i + 1}/${fullChunks}]:${chunkData}`);
    }
    return chunks;
}

        /**
         * Reconstructs the original data from an array of scanned chunks.
         * @param {string[]} scannedChunks The array of chunk strings, including the metadata chunk.
         * @returns {string} The reconstructed full data string.
         */
        function reconstructFromChunks(scannedChunks) {
            // The first chunk contains the metadata; we slice it off before joining
            return scannedChunks.slice(1).join('');
        }

        // --- Clipboard Functions ---
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            element.select();
            document.execCommand('copy');
            alert('Copied to clipboard!');
        }
        
        // --- Game Logic (Sudoku Grid) ---
        function createGrid() {
            if (sudokuGrid.firstChild) {
                while (sudokuGrid.firstChild) {
                    sudokuGrid.removeChild(sudokuGrid.firstChild);
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
                    
                    // --- New Long-Press and Click Logic ---
                    cell.addEventListener('mousedown', startPressTimer);
                    cell.addEventListener('touchstart', startPressTimer);
                    cell.addEventListener('mouseup', handleCellClick);
                    cell.addEventListener('touchend', handleCellClick);
                    cell.addEventListener('mouseleave', () => clearTimeout(pressTimer));

                    sudokuGrid.appendChild(cell);
                }
            }
        }
        
        function startPressTimer(event) {
            clearTimeout(pressTimer); // Clear any existing timer
            isLongPressActive = false; // Reset the flag
            
            const cell = event.currentTarget;
            pressTimer = setTimeout(() => {
                handleLongPress(cell);
            }, 500); // 500ms for a long press
        }
        
        function handleCellClick(event) {
            clearTimeout(pressTimer);
            const currentTime = new Date().getTime();
            if (currentTime - lastEventTimestamp < 100) {
                lastEventTimestamp = 0;
                return;
            }
            lastEventTimestamp = currentTime;

            if (isLongPressActive) {
                isLongPressActive = false;
                return;
            }
            const cell = event.currentTarget;
            // Handle clicks on a preloaded cell.
            if (cell.classList.contains('preloaded-cell')) {
                const value = cell.textContent.trim();
                if (value !== '') {
                    clearAllHighlights();
                    highlightMatchingCells(value);
                }
                return;
            }
            // NEW LOGIC: Check if the clicked cell is already active
            if (activeCell === cell) {
                // If the cell is already active, toggle its value
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
                    console.log(`Sent move: Row ${move.row}, Col ${move.col}, Value ${move.value}`);
                }
                
                // After changing the value, update highlights and state
                clearAllHighlights();
                highlightMatchingCells(newValue.toString());
                checkGridState();
                
            } else {
                // If a different cell is clicked, make it the active one
                if (activeCell) {
                    activeCell.classList.remove('active-cell');
                }
                activeCell = cell;
                cell.classList.add('active-cell');
                // Clear all previous highlights and apply new ones
                clearAllHighlights();
                const value = cell.textContent.trim();
                if (value !== '') {
                    highlightMatchingCells(value);
                }
            }
        }
        
        function handleLongPress(cell) {
            isLongPressActive = true; // Set the flag
            const value = cell.textContent.trim();
            if (value !== '') {
                clearAllHighlights();
                highlightMatchingCells(value);
            }
        }
        
        function highlightMatchingCells(value) {
            const allCells = document.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                if (cell.textContent.trim() === value && !cell.classList.contains('invalid-cell') && !cell.classList.contains('solved-puzzle')) {
                    cell.classList.add('highlight-cell');
                }
            });
        }
        
        function clearAllHighlights() {
            const allCells = document.querySelectorAll('.grid-cell');
            allCells.forEach(cell => {
                cell.classList.remove('highlight-cell');
            });
        }

        async function loadPuzzle(puzzleData) {
            createGrid();

            let puzzle = puzzleData;
            let isRemoteLoad = false;
            
            if (puzzleData) {
                isRemoteLoad = true;
            } else {
                try {
                    const response = await fetch('https://sugoku.onrender.com/board?difficulty=easy');
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    puzzle = data.board;
                    initialSudokuState = puzzle;
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
                    // NEW LOGIC: Add the preloaded-cell class to non-empty cells
                    if (value !== 0) {
                        cell.classList.add('preloaded-cell');
                    }
                }
            }
            
            checkGridState();
            if (!isRemoteLoad && dataChannel && dataChannel.readyState === 'open') {
                const puzzleMessage = { type: 'initial-state', state: puzzle };
                dataChannel.send(JSON.stringify(puzzleMessage));
                console.log('Sent new puzzle to connected peer.');
            }
        }
        
        // New function to show/hide the signaling area
        function toggleSignalingArea() {
            signalingArea.classList.toggle('hidden');
            sudokuGridArea.classList.toggle('hidden');

            if (signalingArea.classList.contains('hidden')) {
                sudokuGridArea.scrollIntoView({ behavior: 'smooth' });
            }
            else {
                signalingArea.scrollIntoView({ behavior: 'smooth' });
            }
        }

        // Function to handle the change event on both dropdowns
function toggleSignalingUI() {
    const signalingMethod = document.getElementById('signaling-method').value;
    const playerRole = document.getElementById('player-role').value;

    // Hide all possible sections first
    manualSignalingArea.classList.add('hidden');
    qrSignalingArea.classList.add('hidden');
    p1ManualArea.classList.add('hidden');
    p2ManualArea.classList.add('hidden');
    p1QrArea.classList.add('hidden');
    p2QrArea.classList.add('hidden');

    // Then, show only the correct one based on the combination
    if (signalingMethod === 'manual') {
        manualSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            p1ManualArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            p2ManualArea.classList.remove('hidden');
        }
    } else if (signalingMethod === 'qr') {
        qrSignalingArea.classList.remove('hidden');
        if (playerRole === 'host') {
            p1QrArea.classList.remove('hidden');
        } else if (playerRole === 'joiner') {
            p2QrArea.classList.remove('hidden');
        }
    }

    //This is a comment
}

// Initial setup to correctly set the UI state on page load
// The function must be called after the HTML and all JavaScript is loaded.
document.addEventListener('DOMContentLoaded', () => {
    // Other setup functions can be called here if needed
    toggleSignalingUI(); 

    // Disable the navigation buttons on page load
    document.getElementById('prev-qr').disabled = true;
    document.getElementById('next-qr').disabled = true;
});

        // New validation functions
        function checkForConflicts(arr) {
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
        }

        function validatePuzzle() {
            const invalidCells = new Set();
            let isComplete = true;
            const gridValues = [];

            // Get current grid state and check for completeness
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

            // Check rows
            for (let row = 0; row < 9; row++) {
                if (checkForConflicts(gridValues[row])) {
                    for (let col = 0; col < 9; col++) {
                        if (gridValues[row][col] !== '') {
                            invalidCells.add(`cell-${row}-${col}`);
                        }
                    }
                }
            }

            // Check columns
            for (let col = 0; col < 9; col++) {
                const colValues = [];
                for (let row = 0; row < 9; row++) {
                    colValues.push(gridValues[row][col]);
                }
                if (checkForConflicts(colValues)) {
                    for (let row = 0; row < 9; row++) {
                        if (gridValues[row][col] !== '') {
                            invalidCells.add(`cell-${row}-${col}`);
                        }
                    }
                }
            }

            // Check 3x3 subgrids
            for (let blockRow = 0; blockRow < 3; blockRow++) {
                for (let blockCol = 0; blockCol < 3; blockCol++) {
                    const subgridValues = [];
                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 3; col++) {
                            subgridValues.push(gridValues[blockRow * 3 + row][blockCol * 3 + col]);
                        }
                    }
                    if (checkForConflicts(subgridValues)) {
                        for (let row = 0; row < 3; row++) {
                            for (let col = 0; col < 3; col++) {
                                if (gridValues[blockRow * 3 + row][blockCol * 3 + col] !== '') {
                                    invalidCells.add(`cell-${blockRow * 3 + row}-${blockCol * 3 + col}`);
                                }
                            }
                        }
                    }
                }
            }

            // Apply coloring based on validation
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

        function checkGridState() {
            const { isValid, isComplete } = validatePuzzle();
            if (isComplete && isValid) {
                document.querySelectorAll('.grid-cell').forEach(cell => {
                    cell.classList.add('solved-puzzle');
                });
                alert("Congratulations! The puzzle is solved!");
            }
        }
        
        // Initial setup on page load
        createGrid();
        loadPuzzle();


