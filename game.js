import { dom,
         appState,
         pressTimer,
         dataChannel
} from './scripts.js';

//==============================
//Game UI and Logic
//==============================

//Creates the Sudoku grid
export function createGrid() {
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
export function startPressTimer(event) {
    clearTimeout(pressTimer);
    appState.isLongPressActive = false;
    const cell = event.target;
    pressTimer = setTimeout(() => {
        handleLongPress(cell);
    }, 500);
}

//Handles a cell click or tap
export function handleCellClick(event) {
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
    const cell = event.target;
    if (cell.classList.contains('preloaded-cell')) {
        const value = cell.textContent.trim();
        if (value !== '') {
            highlightMatchingCells(value);
        }
        return;
    }
    
    // Check if there is an existing active cell and remove the class
    if (appState.activeCell) {
        appState.activeCell.classList.remove('active-cell');
        // Clear any previous highlights
        clearAllHighlights();
    }
    // Set the new active cell
    appState.activeCell = cell;
    // Add the active-cell class
    cell.classList.add('active-cell');
    // Highlight matching cells for the new active cell
    const value = appState.activeCell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

//Handles a cell long-press
export function handleLongPress(cell) {
    appState.isLongPressActive = true;
    const value = cell.textContent.trim();
    if (value !== '') {
        highlightMatchingCells(value);
    }
}

//Highlights all cells with a matching value
export function highlightMatchingCells(value) {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        if (cell.textContent.trim() === value && !cell.classList.contains('invalid-cell') && !cell.classList.contains('solved-puzzle')) {
            cell.classList.add('highlight-cell');
        }
        else {
            cell.classList.remove('highlight-cell');
        }
    });
}

//Removes all highlight classes
export function clearAllHighlights() {
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        cell.classList.remove('highlight-cell');
    });
}

//Fetches and loads a new puzzle
export async function loadPuzzle(puzzleData) {
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
export function validatePuzzle() {
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
export function checkGridState() {
    // Call the new function to update button states
    updateNumberPadState();

    const { isValid, isComplete } = validatePuzzle();
    if (isComplete && isValid) {
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.add('solved-puzzle');
        });
        alert("Congratulations! The puzzle is solved!");
    }
}

// Function to update the disabled state of the number pad buttons
export function updateNumberPadState() {
    const counts = {};
    for (let i = 1; i <= 9; i++) {
        counts[i] = 0;
    }
    
    // Count all numbers currently on the grid
    const allCells = document.querySelectorAll('.grid-cell');
    allCells.forEach(cell => {
        const value = parseInt(cell.textContent.trim(), 10);
        if (value >= 1 && value <= 9) {
            counts[value]++;
        }
    });

    // Disable the button if a number has been used 9 times
    for (const number in counts) {
        const button = document.getElementById(`number-btn-${number}`);
        if (button) {
            button.disabled = counts[number] === 9;
        }
    }
}

// Initializes the PeerJS connection
export async function initializePeerJs(playerRole) {
    // Return a new Promise
    return new Promise((resolve, reject) => {
        dom.p1PeerStatus.textContent = 'Status: Initializing...';
        dom.p2PeerStatus.textContent = 'Status: Waiting for Host...';

        const peerId = playerRole === 'host' ? generateRandomId() : undefined;
        const peer = new Peer(peerId, {
            host: 'peerjs.com/peerserver',
            secure: true,
            port: 443
        });

        // Error handling for PeerJS
        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            reject(err); // Reject the Promise on error
        });

        peer.on('open', async (id) => {
            appState.isInitiator = playerRole === 'host';
            updatePeerIdDisplay(playerRole, id);

            if (playerRole === 'host') {
                dom.p1PeerStatus.textContent = `Status: Share this ID with Player 2 to connect.`;

                // The peerConnection and dataChannel variables are declared here to ensure they are local to the function's scope
                const peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                const dataChannel = peerConnection.createDataChannel('sudoku-game');
                setupDataChannel(dataChannel);

                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                peer.on('connection', (conn) => {
                    conn.on('open', () => {
                        sendOffer(conn, JSON.stringify(peerConnection.localDescription));
                    });

                    conn.on('data', async (data) => {
                        const message = JSON.parse(data);
                        if (message.type === 'answer') {
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                            dom.p1PeerStatus.textContent = 'Status: Answer received. Connection established.';
                            hideSignalingUI();
                            // Resolve the Promise with the peerConnection object
                            resolve(peerConnection);
                        }
                    });
                });
            } else { // 'joiner'
                dom.p2PeerStatus.textContent = 'Status: Waiting for a Host to connect...';
                
                peer.on('connection', (conn) => {
                    // For the joiner, the incoming connection *is* the peerConnection
                    const peerConnection = conn;
                    
                    conn.on('data', async (data) => {
                        const message = JSON.parse(data);
                        if (message.type === 'offer') {
                            dom.p2PeerStatus.textContent = 'Status: Offer received. Creating answer...';
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
                            const answer = await peerConnection.createAnswer();
                            await peerConnection.setLocalDescription(answer);

                            sendAnswer(conn, JSON.stringify(peerConnection.localDescription));
                            // Resolve the Promise once the connection is fully established
                            resolve(peerConnection);
                        }
                    });
                });
            }
        });
    });
}

// Function to send the WebRTC offer over the PeerJS connection
export function sendOffer(conn, offer) {
    if (conn && conn.open) {
        const message = {
            type: 'offer',
            offer: offer
        };
        conn.send(JSON.stringify(message));
    }
}

// Function to send the WebRTC answer over the PeerJS connection
export function sendAnswer(conn, answer) {
    if (conn && conn.open) {
        const message = {
            type: 'answer',
            answer: answer
        };
        conn.send(JSON.stringify(message));
    }
}

// Connects to a specific peer using their ID
export function connectToPeer(joinId) {
    if (!peer) {
        console.error('PeerJS not initialized.');
        return;
    }
    dom.p2PeerStatus.textContent = `Status: Attempting to connect to Host...`;
    
    // Connect to the host's PeerJS ID.
    // The rest of the logic is handled by the `peer.on('connection')`
    // event listener in `initializePeerJs`.
    peer.connect(joinId);
}

// Function to handle the received data from the data channel
function setupDataChannel(conn) {
    conn.on('data', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'move') {
            // Logic to update the game board
        } else if (message.type === 'initial-state') {
            loadPuzzle(message.state);
        }
    });

    conn.on('close', () => {
        console.log('Peer connection closed.');
    });
}

// Helper function to update the Peer ID in the UI
function updatePeerIdDisplay(playerRole, id) {
    if (playerRole === 'host') {
        dom.p1PeerId.textContent = id;
    } else {
        dom.p2PeerId.textContent = id;
    }
}

// Simple function to generate a random ID for the Host
function generateRandomId() {
    return 'teamsudoku-' + Math.random().toString(36).substring(2, 9);
}

