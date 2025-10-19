//==============================
// Adventure Game Logic
//==============================

import { dom, appState } from '../scripts.js';
import { showToast, showConfirmationModal } from '../ui.js';

const SAVED_ADVENTURES_KEY = 'cyoaAdventures';

let activeAdventure = null; // Holds the adventure object being edited
let activeNodeId = null; // Holds the ID of the node currently in the editor

const defaultAdventure = {
    id: 'default-adv',
    name: 'Default Adventure',
    startNodeId: 'start',
    nodes: {
        'start': {
            id: 'start',
            title: 'A Fork in the Road',
            text: 'You awaken in a forest clearing with a pounding headache. Before you, a path splits in two. To the left, a dark and spooky trail disappears into the woods. To the right, the path leads toward a sun-drenched meadow.',
            choices: [{ text: 'Take the spooky trail.', targetNodeId: 'spooky_path' }, { text: 'Head towards the meadow.', targetNodeId: 'meadow_path' }]
        },
        'spooky_path': { id: 'spooky_path', title: 'The Spooky Trail', text: 'You venture down the dark path. The air grows cold, and you hear a twig snap behind you. The adventure continues...', choices: [] },
        'meadow_path': { id: 'meadow_path', title: 'The Sunny Meadow', text: 'You walk into a beautiful, sunny meadow filled with flowers. You feel a sense of peace. The adventure continues...', choices: [] }
    }
};

export function initialize() {
    document.body.classList.add('adventure-active');
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Adventure';
    dom.newPuzzleButton.style.display = '';
    loadPuzzle();
}

export function cleanup() {
    document.body.classList.remove('adventure-active');
}

export function createGrid() {
    renderPlayerUI();
}

export function getInitialState() {
    // This will be expanded in Phase 3 with player stats.
    return {
        adventures: loadAdventuresFromStorage(),
        currentAdventure: null,
        currentNodeId: null,
        player: {
            mana: 10,
            health: 100,
            inventory: []
        }
    };
}

export function loadPuzzle() {
    appState.soloGameState = getInitialState();
    const savedAdventures = appState.soloGameState.adventures;
    if (savedAdventures.length > 0) {
        const randomAdventure = savedAdventures[Math.floor(Math.random() * savedAdventures.length)];
        appState.soloGameState.currentAdventure = randomAdventure;
        showToast(`Playing: ${randomAdventure.name}`, 'info');
    } else {
        appState.soloGameState.currentAdventure = defaultAdventure;
        showToast(`Playing: Default Adventure`, 'info');
    }
    appState.soloGameState.currentNodeId = appState.soloGameState.currentAdventure.startNodeId;
    createGrid();
}

export function showAdventureCreator() {
    if (document.getElementById('adventure-creator-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'adventure-creator-overlay';
    modal.className = 'ship-designer-overlay'; // Reuse styles
    modal.innerHTML = `
    <div class="designer-header">
        <h2>Adventure Creator</h2>
        <div class="button-row">
            <button id="creator-close-btn" class="designer-close-btn">&times;</button>
        </div>
    </div>
    <div class="ship-designer">
        <!-- Column 1: Saved Adventures -->
        <div class="designer-column">
            <h3>Saved Adventures</h3>
            <div id="saved-adventures-list"></div>
        </div>
        <!-- Column 2: Node Editor -->
        <div class="designer-column">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 id="adventure-editor-title">Adventure Editor</h4>
                <button id="creator-save-btn" class="theme-button">Save</button>
            </div>
            <input type="text" id="adventure-name-input" placeholder="Adventure Name" class="designer-input">
            <div id="node-editor-area">
                <p>Select or create an adventure to begin.</p>
            </div>
        </div>
        <!-- Column 3: Node Map -->
        <div class="designer-column">
            <h4>Node Map</h4>
            <div id="node-map-preview">A visual map of your story nodes will appear here.</div>
        </div>
    </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('creator-close-btn').onclick = closeAdventureCreator;

    document.getElementById('creator-save-btn').onclick = saveActiveAdventure;
    document.getElementById('adventure-name-input').oninput = (e) => {
        if (activeAdventure) activeAdventure.name = e.target.value;
    };

    // If called while a game is in progress, load that game into the editor.
    if (appState.soloGameState?.currentAdventure) {
        activeAdventure = JSON.parse(JSON.stringify(appState.soloGameState.currentAdventure));
        activeNodeId = appState.soloGameState.currentNodeId;
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderNodeEditor();
        renderNodeMap();
    }

    renderSavedAdventures();
}

/**
 * Closes the adventure creator and returns to the story/player mode.
 */
export function closeAdventureCreator() {
    const modal = document.getElementById('adventure-creator-overlay');
    if (modal) {
        modal.remove();
    }
    // No need to re-render the player UI, as it was never removed from the DOM.
}

function renderPlayerUI() {
    dom.gameBoardArea.innerHTML = `
        <div id="adventure-player-view">
            <div id="adventure-player-stats" class="glass-panel">
                <span>❤️ Health: <span id="player-health"></span></span>
                <span>✨ Mana: <span id="player-mana"></span></span>
            </div>
            <div id="adventure-story-area" class="glass-panel">
                <h2 id="adventure-node-title"></h2>
                <p id="adventure-node-text"></p>
            </div>
            <div id="adventure-choices-area"></div>
        </div>
    `;
    renderCurrentNode();
}

function renderCurrentNode() {
    const gameState = appState.soloGameState;
    if (!gameState || !gameState.currentAdventure || !gameState.currentNodeId) return;

    const node = gameState.currentAdventure.nodes[gameState.currentNodeId];
    if (!node) {
        console.error(`Adventure node not found: ${gameState.currentNodeId}`);
        document.getElementById('adventure-node-text').textContent = 'Error: The story has hit a dead end. This node does not exist.';
        return;
    }

    // Update UI elements
    document.getElementById('player-health').textContent = gameState.player.health;
    document.getElementById('player-mana').textContent = gameState.player.mana;
    document.getElementById('adventure-node-title').textContent = node.title;
    document.getElementById('adventure-node-text').textContent = node.text;

    const choicesArea = document.getElementById('adventure-choices-area');
    choicesArea.innerHTML = '';

    if (node.choices && node.choices.length > 0) {
        node.choices.forEach(choice => {
            const choiceButton = document.createElement('button');
            choiceButton.className = 'theme-button adventure-choice-btn';
            choiceButton.textContent = choice.text;
            choiceButton.onclick = () => handleChoiceClick(choice);
            choicesArea.appendChild(choiceButton);
        });
    } else {
        choicesArea.innerHTML = '<p><em>The story concludes here.</em></p>';
    }
}

function handleChoiceClick(choice) {
    appState.soloGameState.currentNodeId = choice.targetNodeId;
    renderCurrentNode();
}

function loadAdventuresFromStorage() {
    const saved = localStorage.getItem(SAVED_ADVENTURES_KEY);
    return saved ? JSON.parse(saved) : [];
}

function renderSavedAdventures() {
    const listEl = document.getElementById('saved-adventures-list');
    if (!listEl) return;

    const savedAdventures = loadAdventuresFromStorage();
    listEl.innerHTML = '';

    // Add a "New Adventure" button
    const newAdventureBtn = document.createElement('button');
    newAdventureBtn.textContent = 'Start New Adventure';
    newAdventureBtn.className = 'theme-button';
    newAdventureBtn.style.width = '100%';
    newAdventureBtn.style.marginBottom = '10px';
    newAdventureBtn.onclick = createNewAdventure;
    listEl.appendChild(newAdventureBtn);

    if (savedAdventures.length === 0) {
        listEl.innerHTML += '<p>No saved adventures.</p>';
    } else {
        savedAdventures.forEach(adv => {
            const item = document.createElement('div');
            item.className = 'component-item theme-button';
            item.style.display = 'flex';
            item.style.alignItems = 'center';

            const nameDiv = document.createElement('div');
            nameDiv.textContent = adv.name;
            nameDiv.style.flexGrow = '1';
            nameDiv.style.cursor = 'pointer';
            nameDiv.onclick = () => loadAdventureIntoCreator(adv.id);
            item.appendChild(nameDiv);

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'designer-close-btn';
            deleteBtn.style.fontSize = '1.5rem';
            deleteBtn.style.padding = '0 5px';
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteSavedAdventure(adv.id); };
            item.appendChild(deleteBtn);

            listEl.appendChild(item);
        });
    }
}

function createNewAdventure() {
    const newId = `adv-${Date.now()}`;
    activeAdventure = {
        id: newId,
        name: 'My New Adventure',
        startNodeId: 'start',
        nodes: {
            'start': {
                id: 'start',
                title: 'The Beginning',
                color: '#00A0C0', // Default color
                text: 'You stand at a crossroads. The path to the left leads into a dark forest, while the path to the right heads towards a distant mountain.',
                choices: []
            }
        },
        _ui: { // Add UI state for the map view
            pan: { x: 0, y: 0 },
            zoom: 1
        }
    };
    activeNodeId = 'start';
    document.getElementById('adventure-name-input').value = activeAdventure.name;
    renderNodeEditor();
    renderNodeMap();
}

function loadAdventureIntoCreator(adventureId) {
    const adventures = loadAdventuresFromStorage();
    const adventureToLoad = adventures.find(adv => adv.id === adventureId);
    if (adventureToLoad) {
        activeAdventure = JSON.parse(JSON.stringify(adventureToLoad)); // Deep copy
        activeNodeId = activeAdventure.startNodeId;
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderNodeEditor();
        renderNodeMap();
    }
}

function saveActiveAdventure() {
    if (!activeAdventure) {
        showToast('No active adventure to save.', 'error');
        return;
    }
    activeAdventure.name = document.getElementById('adventure-name-input').value.trim() || 'Unnamed Adventure';

    const adventures = loadAdventuresFromStorage();
    const existingIndex = adventures.findIndex(adv => adv.id === activeAdventure.id);
    if (existingIndex > -1) {
        adventures[existingIndex] = activeAdventure;
    } else {
        adventures.push(activeAdventure);
    }
    localStorage.setItem(SAVED_ADVENTURES_KEY, JSON.stringify(adventures));
    showToast(`Adventure "${activeAdventure.name}" saved!`, 'info');
    renderSavedAdventures(); // Refresh the list to show the newly saved/updated adventure
}

function deleteSavedAdventure(adventureId) {
    const adventures = loadAdventuresFromStorage();
    const adventureToDelete = adventures.find(adv => adv.id === adventureId);
    if (!adventureToDelete) return;

    const onConfirm = () => {
        const updatedAdventures = adventures.filter(adv => adv.id !== adventureId);
        localStorage.setItem(SAVED_ADVENTURES_KEY, JSON.stringify(updatedAdventures));
        showToast(`Adventure "${adventureToDelete.name}" deleted.`, 'info');
        renderSavedAdventures();
        // If the deleted adventure was the one being edited, clear the editor
        if (activeAdventure && activeAdventure.id === adventureId) {
            activeAdventure = null;
            activeNodeId = null;
            document.getElementById('node-editor-area').innerHTML = '<p>Select or create an adventure to begin.</p>';
            document.getElementById('node-map-preview').innerHTML = '';
            document.getElementById('adventure-name-input').value = '';
        }
    };

    showConfirmationModal(`Are you sure you want to delete "${adventureToDelete.name}"?`, onConfirm);
}

function renderNodeEditor() {
    if (!activeAdventure || !activeNodeId) return;

    const node = activeAdventure.nodes[activeNodeId];
    if (!node) return;

    document.getElementById('adventure-editor-title').textContent = `Editing Node: ${node.title}`;
    const editorArea = document.getElementById('node-editor-area');

    const allNodesOptions = Object.values(activeAdventure.nodes).map(n =>
        `<option value="${n.id}">${n.title || n.id}</option>`
    ).join('');

    editorArea.innerHTML = `
        <div class="node-title-editor">
            <input type="text" class="designer-input" data-node-key="title" value="${node.title}" placeholder="Node Title">
            <input type="color" data-node-key="color" value="${node.color || '#00A0C0'}" title="Set Node Color">
        </div>
        <textarea class="adventure-node-text" data-node-key="text" placeholder="Enter story text for this node...">${node.text}</textarea>
        <h5>Choices:</h5>
        <div id="choices-container">
            ${node.choices.map((choice, index) => `
                <div class="adventure-choice-editor" data-choice-index="${index}">
                    <input type="text" class="designer-input" data-choice-key="text" value="${choice.text}" placeholder="Choice Text">
                    <select class="designer-input" data-choice-key="targetNodeId" value="${choice.targetNodeId}">${allNodesOptions}</select>
                    <button class="remove-choice-btn">&times;</button>
                </div>
            `).join('')}
        </div>
        <button id="add-choice-btn" class="theme-button">Add Choice</button>
    `;

    // Set the selected option for each dropdown after innerHTML is processed
    editorArea.querySelectorAll('select[data-choice-key="targetNodeId"]').forEach((select, index) => {
        select.value = node.choices[index].targetNodeId;
    });

    document.getElementById('add-choice-btn').onclick = addChoice;

    // --- Event Delegation for Updates ---
    editorArea.oninput = (e) => {
        if (!activeAdventure || !activeNodeId) return;
        const target = e.target;
        const nodeKey = target.dataset.nodeKey;
        const choiceKey = target.dataset.choiceKey;

        if (nodeKey) {
            activeAdventure.nodes[activeNodeId][nodeKey] = target.value;
            // If color is changed, re-render the map to show it immediately
            if (nodeKey === 'color') {
                renderNodeMap();
            }
        } else if (choiceKey) {
            const choiceIndex = target.closest('.adventure-choice-editor').dataset.choiceIndex;
            activeAdventure.nodes[activeNodeId].choices[choiceIndex][choiceKey] = target.value;
        }
    };

    editorArea.onclick = (e) => {
        if (e.target.classList.contains('remove-choice-btn')) {
            const choiceIndex = e.target.closest('.adventure-choice-editor').dataset.choiceIndex;
            activeAdventure.nodes[activeNodeId].choices.splice(choiceIndex, 1);
            renderNodeEditor(); // Re-render to reflect the change
        }
    };
}

function addChoice() {
    if (!activeAdventure || !activeNodeId) return;
    const newNodeId = `node-${Date.now()}`;
    activeAdventure.nodes[activeNodeId].choices.push({ text: 'A new choice', targetNodeId: newNodeId });
    // Also create the new empty node that this choice points to
    if (!activeAdventure.nodes[newNodeId]) {
        activeAdventure.nodes[newNodeId] = { id: newNodeId, title: 'New Node', text: '', choices: [], color: '#00A0C0' };
    }
    renderNodeEditor();
    renderNodeMap();
}

function renderNodeMap() {
    if (!activeAdventure) return;

    const mapArea = document.getElementById('node-map-preview');
    let svg = mapArea.querySelector('svg');

    let draggedNode = null;
    let isPanning = false;
    let offset = { x: 0, y: 0 };

    const onMouseDown = (e, node) => {
        e.stopPropagation(); // Prevent background pan when dragging a node
        // If clicking on a node, initiate node drag, not pan
        e.preventDefault();
        draggedNode = node;
        const CTM = svg.getScreenCTM();
        offset.x = (e.clientX - CTM.e) / CTM.a - node._ui.x;
        offset.y = (e.clientY - CTM.f) / CTM.d - node._ui.y;
        svg.addEventListener('mousemove', onMouseMove);
        svg.addEventListener('mouseup', onMouseUp);
        svg.addEventListener('mouseleave', onMouseUp);
    };

    const onMouseDownBackground = (e) => {
        // Only pan if clicking on the SVG background itself
        isPanning = true;
        offset.x = e.clientX;
        offset.y = e.clientY;
        svg.style.cursor = 'grabbing';
        svg.addEventListener('mousemove', onMouseMovePan);
        svg.addEventListener('mouseup', onMouseUpPan);
        svg.addEventListener('mouseleave', onMouseUpPan);
    };

    const onMouseMove = (e) => {
        if (!draggedNode) return;
        e.preventDefault();
        const CTM = svg.getScreenCTM();
        draggedNode._ui.x = (e.clientX - CTM.e) / CTM.a - offset.x;
        draggedNode._ui.y = (e.clientY - CTM.f) / CTM.d - offset.y;
        // Stop the physics simulation for the dragged node
        draggedNode._ui.vx = 0;
        draggedNode._ui.vy = 0;
        renderNodeMap(); // Re-render while dragging
    };

    const onMouseMovePan = (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const dx = (e.clientX - offset.x) / activeAdventure._ui.zoom;
        const dy = (e.clientY - offset.y) / activeAdventure._ui.zoom;
        activeAdventure._ui.pan.x -= dx;
        activeAdventure._ui.pan.y -= dy;
        offset.x = e.clientX;
        offset.y = e.clientY;
        // Instead of re-rendering everything, just update the viewBox
        const viewX = activeAdventure._ui.pan.x;
        const viewY = activeAdventure._ui.pan.y;
        const viewWidth = mapArea.clientWidth / activeAdventure._ui.zoom;
        const viewHeight = mapArea.clientHeight / activeAdventure._ui.zoom;
        svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);
    };

    const onMouseUp = (e) => {
        draggedNode = null;
        svg.removeEventListener('mousemove', onMouseMove);
        svg.removeEventListener('mouseup', onMouseUp);
        svg.removeEventListener('mouseleave', onMouseUp);
    };

    const onMouseUpPan = (e) => {
        isPanning = false;
        svg.style.cursor = 'grab';
        svg.removeEventListener('mousemove', onMouseMovePan);
        svg.removeEventListener('mouseup', onMouseUpPan);
        svg.removeEventListener('mouseleave', onMouseUpPan);
    };

    const onWheel = (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const oldZoom = activeAdventure._ui.zoom;
        const newZoom = e.deltaY > 0 ? oldZoom / zoomFactor : oldZoom * zoomFactor;
        activeAdventure._ui.zoom = Math.max(0.1, Math.min(5, newZoom)); // Clamp zoom level

        const CTM = svg.getScreenCTM();
        const mouseX = (e.clientX - CTM.e) / CTM.a;
        const mouseY = (e.clientY - CTM.f) / CTM.d;

        activeAdventure._ui.pan.x += mouseX / oldZoom - mouseX / activeAdventure._ui.zoom;
        activeAdventure._ui.pan.y += mouseY / oldZoom - mouseY / activeAdventure._ui.zoom;
        renderNodeMap(); // Re-render on zoom is necessary to update viewBox
    };

    // If SVG doesn't exist, create it and set up its one-time properties and listeners
    if (!svg) {
        mapArea.innerHTML = ''; // Clear previous map content
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        mapArea.appendChild(svg);

        // Define an arrowhead marker
        svg.innerHTML = `
            <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-light)" />
                </marker>
            </defs>
        `;
        svg.addEventListener('mousedown', onMouseDownBackground);
        svg.addEventListener('wheel', onWheel);
    }

    const nodes = Object.values(activeAdventure.nodes);
    const nodeElements = {};
    const edges = [];


    // --- 1. Simple Physics-based Layout Simulation ---
    const width = mapArea.clientWidth;
    const height = mapArea.clientHeight;
    let needsLayout = false;
    nodes.forEach(node => {
        // Initialize positions if they don't exist
        if (!node._ui) {
            node._ui = {
                x: Math.random() * width,
                y: Math.random() * height,
                vx: 0,
                vy: 0
            };
            needsLayout = true;
        }
        // Ensure UI state for the adventure exists
        if (!activeAdventure._ui) {
            activeAdventure._ui = { pan: { x: 0, y: 0 }, zoom: 1 };
        }
    });

    // Set viewBox for zoom and pan
    const viewX = activeAdventure._ui.pan.x;
    const viewY = activeAdventure._ui.pan.y;
    const viewWidth = width / activeAdventure._ui.zoom;
    const viewHeight = height / activeAdventure._ui.zoom;
    svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);

    // Clear only the dynamic elements (nodes and edges), not the defs
    svg.querySelectorAll('.adventure-node-group, .adventure-edge, text').forEach(el => el.remove());

    // Run a few iterations of the simulation for layout
    if (needsLayout) {
        for (let i = 0; i < 100; i++) {
            if (draggedNode) break; // Stop simulation if user is dragging
            // Repulsion force between all nodes
            for (const n1 of nodes) {
                for (const n2 of nodes) {
                    if (n1 === n2) continue;
                    const dx = n1._ui.x - n2._ui.x;
                    const dy = n1._ui.y - n2._ui.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = -2000 / (distance * distance);
                    n1._ui.vx += (dx / distance) * force;
                    n1._ui.vy += (dy / distance) * force;
                }
            }
            // Attraction force for connected nodes (choices)
            for (const node of nodes) {
                for (const choice of node.choices) {
                    const targetNode = activeAdventure.nodes[choice.targetNodeId];
                    if (!targetNode) continue;
                    const dx = targetNode._ui.x - node._ui.x;
                    const dy = targetNode._ui.y - node._ui.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = 0.05 * distance;
                    node._ui.vx += (dx / distance) * force;
                    node._ui.vy += (dy / distance) * force;
                    targetNode._ui.vx -= (dx / distance) * force;
                    targetNode._ui.vy -= (dy / distance) * force;
                }
            }
            // Update positions
            for (const node of nodes) {
                node._ui.x += node._ui.vx * 0.01;
                node._ui.y += node._ui.vy * 0.01;
                node._ui.vx *= 0.95; // Damping
                node._ui.vy *= 0.95;
                // Keep nodes within bounds
                node._ui.x = Math.max(20, Math.min(width - 20, node._ui.x));
                node._ui.y = Math.max(20, Math.min(height - 20, node._ui.y));
            }
        }
    }

    // --- 2. Render Edges (Choices) ---
    nodes.forEach(node => {
        node.choices.forEach((choice, i) => {
            const targetNode = activeAdventure.nodes[choice.targetNodeId];
            if (!targetNode) return;

            // Determine path direction to prevent upside-down text
            const isReversed = targetNode._ui.x < node._ui.x;
            const startX = isReversed ? targetNode._ui.x : node._ui.x;
            const startY = isReversed ? targetNode._ui.y : node._ui.y;
            const endX = isReversed ? node._ui.x : targetNode._ui.x;
            const endY = isReversed ? node._ui.y : targetNode._ui.y;

            // Create a visible path for the line and arrowhead
            const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            visiblePath.setAttribute('d', `M${node._ui.x},${node._ui.y} L${targetNode._ui.x},${targetNode._ui.y}`);
            visiblePath.setAttribute('class', 'adventure-edge');
            visiblePath.setAttribute('marker-end', 'url(#arrowhead)');
            svg.appendChild(visiblePath);

            // Find or create the invisible path for the text label
            const pathId = `path-${node.id}-${i}`;
            let textPathEl = svg.querySelector(`#${pathId}`);
            if (!textPathEl) {
                textPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                textPathEl.setAttribute('id', pathId);
                svg.appendChild(textPathEl); // Path must be in the DOM for textPath to use it
            }
            textPathEl.setAttribute('d', `M${startX},${startY} L${endX},${endY}`); // Always update the path's 'd' attribute

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
            textPath.setAttribute('href', `#${pathId}`);
            textPath.setAttribute('startOffset', '50%');
            textPath.setAttribute('text-anchor', 'middle');
            textPath.textContent = choice.text;
            text.appendChild(textPath);
            svg.appendChild(text);
        });
    });

    // --- 3. Render Nodes ---
    nodes.forEach(node => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node._ui.x}, ${node._ui.y})`);
        g.setAttribute('class', 'adventure-node-group');
        g.addEventListener('click', (e) => { e.stopPropagation(); setActiveNode(node.id); });
        g.addEventListener('mousedown', (e) => onMouseDown(e, node));

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '15');
        circle.setAttribute('class', `adventure-node-circle ${node.id === activeNodeId ? 'active' : ''}`);
        circle.setAttribute('stroke', node.color || '#00A0C0'); // Use node's color for the stroke
        g.appendChild(circle);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.textContent = node.title || node.id;
        label.setAttribute('y', '30');
        label.setAttribute('text-anchor', 'middle');
        g.appendChild(label);

        svg.appendChild(g);
    });

    window.setActiveNode = (nodeId) => {
        activeNodeId = nodeId;
        renderNodeEditor();
        renderNodeMap(); // Re-render map to show active selection
    };
}

// Multiplayer functions (placeholders)
export function processMove(moveData) {}
export function processUIUpdate(data) {}