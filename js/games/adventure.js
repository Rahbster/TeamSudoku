//==============================
// Adventure Game Logic
//==============================
import { dom, appState } from '../scripts.js';
import { showToast, showConfirmationModal, speakText, showInfoModal, showListModal } from '../ui.js';

const SAVED_ADVENTURES_KEY = 'cyoaAdventures';

let activeAdventure = null; // Holds the adventure object being edited
let activeNodeId = null; // Holds the ID of the node currently in the editor

export async function initialize() {
    // One-time cleanup to ensure everyone gets the new default adventure.
    // This can be removed in a future version.
    if (!localStorage.getItem('adventure_cleanup_done')) {
        localStorage.removeItem(SAVED_ADVENTURES_KEY);
        localStorage.setItem('adventure_cleanup_done', 'true');
    }

    document.body.classList.add('adventure-active');
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Adventure';
    dom.newPuzzleButton.style.display = '';
    await loadPuzzle();
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
        // Player state is now initialized from the loaded adventure's definitions
        player: { attributes: {}, inventory: [] }
    };
}

export async function loadPuzzle() {
    // If a current adventure is already set (e.g., by startAdventure), don't overwrite it.
    if (!appState.soloGameState?.currentAdventure) {
        appState.soloGameState = getInitialState();
        const savedAdventures = appState.soloGameState.adventures;
        if (savedAdventures.length > 0) {
            const randomAdventure = savedAdventures[Math.floor(Math.random() * savedAdventures.length)];
            appState.soloGameState.currentAdventure = randomAdventure;
            showToast(`Playing: ${randomAdventure.name}`, 'info');
        } else {
            try {
                const response = await fetch('./assets/dragons_lair.json');
                if (!response.ok) {
                    throw new Error('Failed to load default adventure.');
                }
                const defaultAdv = await response.json();
                appState.soloGameState.currentAdventure = defaultAdv;
                showToast(`Playing: ${defaultAdv.name}`, 'info');
            } catch (error) {
                console.error(error);
                showToast(error.message, 'error');
                // Fallback to a minimal adventure if fetch fails
                appState.soloGameState.currentAdventure = { id: 'fallback', name: 'Fallback', startNodeId: 'start', nodes: { 'start': { id: 'start', title: 'Error', text: 'Could not load adventure.', choices: [] } } };
            }
        }
    }

    // Initialize player state based on the loaded adventure's definitions
    const adventure = appState.soloGameState.currentAdventure;
    if (adventure.attributes) {
        adventure.attributes.forEach(attr => {
            appState.soloGameState.player.attributes[attr.id] = { ...attr };
        });
    }
    appState.soloGameState.player.inventory = adventure.inventory ? JSON.parse(JSON.stringify(adventure.inventory)) : [];

    appState.soloGameState.currentNodeId = appState.soloGameState.currentAdventure.startNodeId;
    createGrid();
}

export function showAdventureCreator(isCreatorContext = false) {
    if (document.getElementById('adventure-creator-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'adventure-creator-overlay';
    modal.className = 'ship-designer-overlay'; // Reuse styles
    modal.innerHTML = `
    <div class="designer-header">
        <h2>Adventure Creator</h2>
        <div class="button-row" style="gap: 10px;">
            <button id="creator-new-btn" class="theme-button">New</button>
            <button id="creator-load-btn" class="theme-button">Load</button>
            <button id="creator-save-btn" class="theme-button">Save</button>
            <button id="creator-save-as-btn" class="theme-button">Save As...</button>
            <button id="creator-close-btn" class="designer-close-btn">&times;</button>
        </div>
    </div>
    <div class="ship-designer">
        <!-- Column 2: Node Editor -->
        <div class="designer-column">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 id="adventure-editor-title" class="collapsible-header">Adventure Editor <span class="info-icon" data-info="adventure">ⓘ</span></h4>
            </div>
            <input type="text" id="adventure-name-input" placeholder="Adventure Name" class="designer-input">
            <h5 style="margin-top: 20px;">Attributes <span class="info-icon" data-info="attributes">ⓘ</span></h5>
            <div id="attribute-editor-area"></div>
            <h5 style="margin-top: 20px;">Items <span class="info-icon" data-info="items">ⓘ</span></h5>
            <div id="item-editor-area"></div>
            <h5 style="margin-top: 20px;">Starting Inventory <span class="info-icon" data-info="startinventory">ⓘ</span></h5>
            <div id="start-inventory-editor-area"></div>
            <div id="node-editor-area">
                <p>Click 'New' or 'Load' to begin.</p>
            </div>
        </div>
        <!-- Column 3: Node Map -->
        <div class="designer-column">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 id="node-map-header" class="collapsible-header" style="margin: 0;">Node Map <span class="info-icon" data-info="nodemap">ⓘ</span></h4>
                <div>
                    <button id="stop-organize-btn" class="theme-button" style="display: none; background-color: var(--error-red);">Stop</button>
                    <button id="auto-organize-btn" class="theme-button">Auto Organize</button>
                </div>
            </div>
            <div id="node-map-preview">A visual map of your story nodes will appear here.</div>
        </div>
    </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('creator-close-btn').onclick = closeAdventureCreator;

    // Wire up the new header buttons using addEventListener for proper scoping
    document.getElementById('creator-new-btn').addEventListener('click', showNewAdventureModal);
    document.getElementById('creator-load-btn').addEventListener('click', showLoadAdventureModal);
    document.getElementById('creator-save-btn').addEventListener('click', saveActiveAdventure);
    document.getElementById('creator-save-as-btn').addEventListener('click', saveAdventureAs);
    document.getElementById('auto-organize-btn').addEventListener('click', () => runNodeLayout(true));
    document.getElementById('stop-organize-btn').addEventListener('click', () => runNodeLayout(false));

    document.getElementById('adventure-name-input').oninput = (e) => {
        if (activeAdventure) activeAdventure.name = e.target.value;
    };
    // If called while a game is in progress, load that game into the editor.
    if (appState.soloGameState?.currentAdventure) {
        activeAdventure = JSON.parse(JSON.stringify(appState.soloGameState.currentAdventure));
        activeNodeId = appState.soloGameState.currentNodeId;
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderStartInventoryEditor();
        renderItemEditor();
        renderAttributeEditor();
        renderNodeEditor();
        renderNodeMap(true);
    }

    // Add collapsible functionality to headers
    document.getElementById('adventure-editor-title').onclick = (e) => {
        e.currentTarget.closest('.designer-column').querySelector('#attribute-editor-area').classList.toggle('collapsed');
        e.currentTarget.closest('.designer-column').querySelector('#node-editor-area').classList.toggle('collapsed');
        e.currentTarget.closest('.designer-column').querySelector('#item-editor-area').classList.toggle('collapsed');
        e.currentTarget.closest('.designer-column').querySelector('#start-inventory-editor-area').classList.toggle('collapsed');
    };
    document.getElementById('node-map-header').onclick = (e) => {
        e.currentTarget.closest('.designer-column').querySelector('#node-map-preview').classList.toggle('collapsed');
    };

    // Add event listener for the new info icons
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('info-icon')) {
            const infoKey = e.target.dataset.info;
            handleInfoClick(infoKey);
        }
    });
}

function handleInfoClick(infoKey) {
    let title = '';
    let content = '';

    switch (infoKey) {
        case 'adventure':
            title = 'Adventure Editor';
            content = `<p>This section is for global settings for your adventure.</p><ul><li><b>Adventure Name:</b> The title of your story.</li><li><b>Attributes:</b> Define the core stats and resources for the player (e.g., Health, Gold, Strength).</li></ul>`;
            break;
        case 'attributes':
            title = 'Attributes Guide';
            content = `<p>Attributes are the numbers that define a player's state.</p><ul><li><b>Icon:</b> A symbol for the attribute. Click to open a symbol picker.</li><li><b>Name:</b> The display name (e.g., "Health").</li><li><b>Type:</b> 'Pool' for values with a max (like HP), 'Stat' for simple values (like Strength).</li><li><b>Value/Max:</b> The starting values for the player.</li></ul>`;
            break;
        case 'nodemap':
            title = 'Node Map';
            content = `<p>This is a visual representation of your story's flow.</p><ul><li><b>Nodes:</b> Circles represent story points. Click a node to edit it. Drag to rearrange.</li><li><b>Colors:</b> Start (Green), Success End (White), Failure End (Red).</li><li><b>Choices:</b> Lines show the connections your choices create.</li><li><b>Pan/Zoom:</b> Click and drag the background to pan. Use the mouse wheel to zoom.</li></ul>`;
            break;
        case 'choices':
            title = 'Choices & Logic';
            content = `<p>Choices are the player's actions. The 'Rules' button adds logic.</p><ul><li><b>Requirements:</b> Conditions the player must meet for the choice to be available (e.g., 'Health >= 50' or 'Has brass_key').</li><li><b>Effects:</b> Changes that happen when the choice is picked (e.g., 'Health - 10' or 'Add 1 gold_coin').</li></ul>`;
            break;
        case 'items':
            title = 'Master Item List';
            content = `<p>This is where you define all the items that can exist in your adventure. Creating items here makes them available in dropdowns when adding them to nodes or using them in logic.</p><ul><li><b>ID:</b> A unique, internal name for the item (e.g., <code>brass_key</code>).</li><li><b>Name:</b> The user-friendly name the player will see (e.g., "Brass Key").</li><li><b>Desc:</b> A description that could be shown in the player's inventory.</li></ul>`;
            break;
        case 'startinventory':
            title = 'Player Starting Inventory';
            content = `<p>Use this section to give the player items at the very beginning of the adventure.</p><ul><li>Select an <b>Item ID</b> from the dropdown (populated by your Master Item List).</li><li>Set the starting <b>Quantity</b>.</li></ul>`;
            break;
    }

    if (title && content) showInfoModal(title, content);
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
                <!-- Player attributes will be rendered here -->
            </div>
            <div id="adventure-story-area" class="glass-panel">
                <h2 id="adventure-node-title"></h2>
                <p id="adventure-node-text"></p>
            </div>
            <div id="adventure-items-area" class="glass-panel">
                <h4>Items Here:</h4>
                <div id="node-items-list"></div>
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
    const inventoryArea = document.getElementById('adventure-inventory');
    if (inventoryArea) {
        inventoryArea.innerHTML = '<h4>Inventory</h4>' + gameState.player.inventory.map(item =>
            `<div>${item.name} (x${item.quantity})</div>`
        ).join('');
    }

    const statsArea = document.getElementById('adventure-player-stats');
    statsArea.innerHTML = ''; // Clear previous stats
    for (const attrId in gameState.player.attributes) {
        const attr = gameState.player.attributes[attrId];
        const statSpan = document.createElement('span');
        const iconSpan = `<span class="attribute-icon" style="${attr.iconColor ? `color: ${attr.iconColor}` : ''}">${attr.icon || '⚙️'}</span>`;
        let statText = `${attr.name}: ${attr.value}`;
        if (attr.type === 'pool' && attr.max) {
            statText += ` / ${attr.max}`;
        }
        statSpan.innerHTML = `${iconSpan} ${statText}`;
        statSpan.title = attr.id; // For debugging or future use
        statsArea.appendChild(statSpan);
    }

    // Make the title speakable
    const titleElement = document.getElementById('adventure-node-title');
    makeWordsSpeakable(titleElement, node.title);

    // Make individual words in the story text clickable for speaking
    const storyTextElement = document.getElementById('adventure-node-text');
    makeWordsSpeakable(storyTextElement, node.text);

    // Render items in the current node
    const nodeItemsList = document.getElementById('node-items-list');
    nodeItemsList.innerHTML = '';
    if (node.items && node.items.length > 0) {
        node.items.forEach((item, index) => {
            // Handle random chance for an item to appear
            if (item.chance && Math.random() > item.chance) {
                return; // This item does not appear this time
            }
            const itemEl = document.createElement('div');
            itemEl.className = 'node-item';
            itemEl.innerHTML = `
                <span>${item.name} (x${item.quantity})</span>
                <button class="theme-button take-item-btn">Take</button>
            `;
            itemEl.querySelector('.take-item-btn').onclick = () => takeItem(item, index);
            nodeItemsList.appendChild(itemEl);
        });
    }

    const choicesArea = document.getElementById('adventure-choices-area');
    choicesArea.innerHTML = '';

    if (node.choices && node.choices.length > 0) {
        node.choices.forEach(choice => {
            // Check if any requirement dictates this choice should be hidden
            let shouldHide = false;
            if (choice.requirements) {
                for (const req of choice.requirements) {
                    if (req.hideOnFail && !checkSingleRequirement(req, gameState).met) {
                        shouldHide = true;
                        break;
                    }
                }
            }
            if (shouldHide) return; // Skip rendering this choice entirely

            const choiceContainer = document.createElement('div');
            choiceContainer.className = 'adventure-choice-container';

            // Make individual words in the choice text clickable for speaking
            const choiceTextSpan = document.createElement('span');
            choiceTextSpan.className = 'adventure-choice-text';
            makeWordsSpeakable(choiceTextSpan, choice.text);

            const chooseButton = document.createElement('button');
            chooseButton.className = 'theme-button adventure-choose-btn';
            chooseButton.textContent = 'Choose';

            const { met, reason } = checkRequirements(choice, gameState);
            if (met) {
                chooseButton.onclick = () => handleChoiceClick(choice);
            } else {
                chooseButton.disabled = true;
                chooseButton.title = reason; // Add a tooltip explaining why it's disabled
            }

            // Append the button first, then the text, to change the visual order.
            choiceContainer.appendChild(chooseButton);
            choiceContainer.appendChild(choiceTextSpan);

            choicesArea.appendChild(choiceContainer);
        });
    } else {
        // This is an end node. Check if it's the game over node.
        if (gameState.currentNodeId === 'GAME_OVER') {
            const restartBtn = document.createElement('button');
            restartBtn.textContent = 'Restart Adventure';
            restartBtn.className = 'theme-button';
            restartBtn.onclick = loadPuzzle; // loadPuzzle resets the game state.
            choicesArea.appendChild(restartBtn);
        } else {
            choicesArea.innerHTML = '<p><em>The story concludes here.</em></p>';
        }
    }

    // Adjust font size AFTER all other elements are rendered and have taken up their space.
    // We use requestAnimationFrame to ensure the browser has completed its layout reflow
    // before we try to measure element heights. This prevents race conditions.
    requestAnimationFrame(adjustStoryTextFontSize);
}

/**
 * Helper function to make each word in a block of text speakable on click.
 * @param {HTMLElement} element - The container element to populate.
 * @param {string} text - The text to process.
 */
function makeWordsSpeakable(element, text) {
    element.innerHTML = text.split(/\s+/).map(word => {
        // Remove punctuation for speaking, but keep it in the display
        const cleanedWord = word.replace(/[.,!?;:]/g, '');
        return `<span class="speakable-word" data-word="${cleanedWord}">${word}</span>`;
    }).join(' ');
    element.querySelectorAll('.speakable-word').forEach(span => {
        span.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering parent clicks
            speakText(span.dataset.word);
        };
    });
}

/**
 * Checks if a single requirement is met.
 * @param {object} req - The requirement object.
 * @param {object} gameState - The current game state.
 * @returns {{met: boolean, reason: string}}
 */
function checkSingleRequirement(req, gameState) {
    if (req.type === 'attribute') {
        const playerAttr = gameState.player.attributes[req.id];
        if (!playerAttr) return { met: false, reason: `Unknown attribute: ${req.id}` };

        const playerValue = playerAttr.value;
        const requiredValue = req.value;
        let conditionMet = false;

        switch (req.operator) {
            case '>=': conditionMet = playerValue >= requiredValue; break;
            case '>': conditionMet = playerValue > requiredValue; break;
            case '==': conditionMet = playerValue == requiredValue; break;
            case '<=': conditionMet = playerValue <= requiredValue; break;
            case '<': conditionMet = playerValue < requiredValue; break;
            default: return { met: false, reason: `Invalid operator: ${req.operator}` };
        }
        if (!conditionMet) return { met: false, reason: `Requires ${playerAttr.name} ${req.operator} ${requiredValue}` };

    } else if (req.type === 'item') {
        const playerItem = gameState.player.inventory.find(i => i.id === req.id);
        if (!playerItem || playerItem.quantity < (req.quantity || 1)) return { met: false, reason: `Requires item: ${req.id}` };
    }
    return { met: true, reason: '' };
}

/**
 * Checks if the player meets the requirements for a given choice.
 * @param {object} choice - The choice object, which may have a `requirements` array.
 * @param {object} gameState - The current game state.
 * @returns {{met: boolean, reason: string}} - An object indicating if requirements are met and a reason if not.
 */
function checkRequirements(choice, gameState) {
    if (!choice.requirements || choice.requirements.length === 0) {
        return { met: true, reason: '' };
    }

    for (const req of choice.requirements) {
        const singleCheck = checkSingleRequirement(req, gameState);
        if (!singleCheck.met) return singleCheck;
    }

    return { met: true, reason: '' };
}

function handleChoiceClick(choice) {
    const gameState = appState.soloGameState;

    // Process any effects of the choice
    if (choice.effects && Array.isArray(choice.effects)) {
        choice.effects.forEach(effect => {
            if (effect.type === 'item') {
                if (effect.action === 'add') {
                    const item = gameState.player.inventory.find(i => i.id === effect.id);
                    if (item) {
                        item.quantity += effect.quantity || 1;
                    } else {
                        // This part would need a proper item definition list, for now we'll create a basic one
                        gameState.player.inventory.push({ id: effect.id, name: effect.id, quantity: effect.quantity || 1 });
                    }
                    showToast(`You received ${effect.quantity || 1} ${effect.id}!`, 'info');
                } else if (effect.action === 'remove') {
                    const itemIndex = gameState.player.inventory.findIndex(i => i.id === effect.id);
                    if (itemIndex > -1) {
                        gameState.player.inventory[itemIndex].quantity -= effect.quantity || 1;
                        if (gameState.player.inventory[itemIndex].quantity <= 0) {
                            gameState.player.inventory.splice(itemIndex, 1);
                        }
                    }
                }
            } else if (effect.type === 'attribute') {
                const attr = gameState.player.attributes[effect.id];
                if (attr) {
                    const oldValue = attr.value;
                    switch (effect.operator) {
                        case '+': attr.value += effect.value; break;
                        case '-': attr.value -= effect.value; break;
                        case '=': attr.value = effect.value; break;
                    }
                    // Clamp value for pools with a max value
                    if (attr.type === 'pool' && attr.max) {
                        attr.value = Math.min(attr.value, attr.max);
                    }
                    attr.value = Math.max(0, attr.value); // Attributes can't go below 0
                    const change = attr.value - oldValue;
                    showToast(`${attr.name} ${change >= 0 ? '+' : ''}${change}`, 'info');
                }
            } else if (effect.type === 'node') {
                const currentNode = gameState.currentAdventure.nodes[gameState.currentNodeId];
                if (effect.action === 'addChoice') {
                    // Add a new choice to the current node.
                    // The 'value' should be a complete choice object.
                    if (effect.value && effect.value.text && effect.value.targetNodeId) {
                        currentNode.choices.push(JSON.parse(JSON.stringify(effect.value)));
                        showToast('A new option has appeared...', 'info');
                    }
                } else if (effect.action === 'removeChoice') {
                    // Remove the choice that triggered this effect.
                    const choiceIndex = currentNode.choices.findIndex(c => c.text === choice.text); // Simple find by text
                    if (choiceIndex > -1) {
                        currentNode.choices.splice(choiceIndex, 1);
                    }
                }
            }
        });
    }

    // After effects are applied, check for game-over conditions
    const healthAttr = gameState.player.attributes['health'];
    if (healthAttr && healthAttr.value <= 0) {
        appState.soloGameState.currentNodeId = 'GAME_OVER';
        renderCurrentNode();
        return; // Stop further processing
    }

    appState.soloGameState.currentNodeId = choice.targetNodeId;
    renderCurrentNode();
}

function takeItem(itemToTake, itemIndex) {
    const gameState = appState.soloGameState;
    const playerInv = gameState.player.inventory;
    const existingItem = playerInv.find(i => i.id === itemToTake.id);

    if (existingItem) {
        existingItem.quantity += itemToTake.quantity;
    } else {
        playerInv.push({ ...itemToTake });
    }

    // Remove the item from the node
    const node = gameState.currentAdventure.nodes[gameState.currentNodeId];
    node.items.splice(itemIndex, 1);

    renderCurrentNode(); // Re-render the UI to show the updated inventory and remove the item from the node
}

/**
 * Dynamically adjusts the font size of the story text to best fit the container.
 */
function adjustStoryTextFontSize() {
    const gameBoardArea = dom.gameBoardArea; // Use cached element
    const playerView = document.getElementById('adventure-player-view');
    const statsArea = document.getElementById('adventure-player-stats');
    const storyArea = document.getElementById('adventure-story-area');
    const choicesArea = document.getElementById('adventure-choices-area');
    const titleElement = document.getElementById('adventure-node-title');
    const textElement = document.getElementById('adventure-node-text');

    if (!storyArea || !textElement || !titleElement) {
        return;
    }

    // We must subtract the height of the title element from the available space inside the storyArea.
    const titleHeight = titleElement.offsetHeight;
    const containerPadding = 40; // 20px top + 20px bottom
    const availableHeight = storyArea.clientHeight - titleHeight - containerPadding;

    let minFontSize = 12; // Minimum font size in pixels
    let maxFontSize = 100; // Maximum font size in pixels
    let optimalSize = minFontSize;

    // Use a binary search to find the best font size efficiently
    while (minFontSize <= maxFontSize) {
        let midFontSize = Math.floor((minFontSize + maxFontSize) / 2);
        textElement.style.fontSize = `${midFontSize}px`;

        // Check if the text's scroll height exceeds the container's actual available height
        if (textElement.scrollHeight > availableHeight) {
            maxFontSize = midFontSize - 1; // Too big, try smaller
        } else {
            optimalSize = midFontSize; // It fits, try larger
            minFontSize = midFontSize + 1;
        }
    }

    // Apply the largest size that fit
    textElement.style.fontSize = `${optimalSize}px`;
}

function loadAdventuresFromStorage() {
    const saved = localStorage.getItem(SAVED_ADVENTURES_KEY);
    return saved ? JSON.parse(saved) : [];
}

function createNewAdventure() {
    const newId = `adv-${Date.now()}`;
    activeAdventure = {
        id: newId,
        name: 'My New Adventure',
        attributes: [
            { id: "health", name: "Health", icon: "❤️", value: 100, max: 100, type: "pool" },
            { id: "mana", name: "Mana", icon: "✨", value: 20, max: 20, type: "pool" }
        ],
        startNodeId: 'start',
        nodes: {
            'start': {
                id: 'start',
                title: 'The Beginning',
                color: '#00A0C0', // Default color
                text: 'The adventure begins here. Edit this text to start your story.',
                choices: []
            }
        },
        _ui: { // Add UI state for the map view
            pan: { x: 0, y: 0 },
            zoom: 1
        }
    };
    activeNodeId = 'start';
    renderStartInventoryEditor();
    document.getElementById('adventure-name-input').value = activeAdventure.name;
    renderAttributeEditor();
    renderNodeEditor();
    renderNodeMap();
}

function loadAdventureIntoCreator(adventureId) {
    const adventures = loadAdventuresFromStorage();
    const adventureToLoad = adventures.find(adv => adv.id === adventureId);
    if (adventureToLoad) {
        // Deep copy and ensure any stale UI data is removed before loading
        const cleanAdventure = JSON.parse(JSON.stringify(adventureToLoad));
        if (cleanAdventure.nodes) {
            Object.values(cleanAdventure.nodes).forEach(node => delete node._ui);
        }
        delete cleanAdventure._ui;
        activeAdventure = cleanAdventure;
        activeNodeId = activeAdventure.startNodeId;
        renderItemEditor();
        renderStartInventoryEditor();
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderAttributeEditor();
        renderNodeEditor();
        renderNodeMap(true);
    }
}

async function loadPredefinedAdventureIntoCreator(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch adventure: ${path}`);
        const adventureToLoad = await response.json();
        // Ensure any stale UI data is removed before loading
        if (adventureToLoad.nodes) {
            Object.values(adventureToLoad.nodes).forEach(node => delete node._ui);
        }
        delete adventureToLoad._ui;
        activeAdventure = adventureToLoad;
        activeNodeId = activeAdventure.startNodeId;
        // Clear ID so a "Save" acts like a "Save As" for a new copy
        activeAdventure.id = `adv-${Date.now()}`;

        // Directly render the creator UI with the loaded adventure
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderStartInventoryEditor();
        renderItemEditor();
        renderAttributeEditor();
        renderNodeEditor();
        renderNodeMap();
        renderNodeEditor(); // This will call renderNodeMap internally if needed
        renderNodeMap(true); // Explicitly do a full re-render on load
    } catch (error) {
        console.error('Error loading predefined adventure:', error);
        showToast(error.message, 'error');
    }
}

async function showLoadAdventureModal() {
    const savedAdventures = loadAdventuresFromStorage();
    let predefinedAdventures = [];
    try {
        const response = await fetch('./assets/adventures_manifest.json');
        if (response.ok) predefinedAdventures = await response.json();
    } catch (error) {
        console.error("Could not load adventure manifest:", error);
    }

    const allAdventures = [
        ...predefinedAdventures.map(adv => ({ ...adv, isPredefined: true })),
        ...savedAdventures.map(adv => ({ ...adv, isPredefined: false }))
    ];

    showListModal({
        title: 'Load Adventure',
        items: allAdventures,
        renderItem: (adv) => `
            <div class="component-item theme-button" style="display: flex; align-items: center;">
                <div class="list-item-name" ${adv.isPredefined ? `data-path="${adv.path}"` : `data-id="${adv.id}"`} style="flex-grow: 1; cursor: pointer;">
                    ${adv.name} ${adv.isPredefined ? '<em style="color: var(--primary-cyan);">(Default)</em>' : ''}
                </div>
                ${!adv.isPredefined ? `<button class="designer-close-btn delete-adventure-btn" data-id="${adv.id}" style="font-size: 1.5rem; padding: 0 5px;">&times;</button>` : ''}
            </div>
        `,
        onItemClick: (e) => {
            const modal = document.getElementById('generic-list-modal');
            if (e.target.classList.contains('list-item-name')) {
                showAdventureCreator(); // Ensure creator is open first
                const path = e.target.dataset.path;
                const id = e.target.dataset.id;
                if (path) loadPredefinedAdventureIntoCreator(path);
                else if (id) loadAdventureIntoCreator(id);
                if (modal) modal.remove();
            } else if (e.target.classList.contains('delete-adventure-btn')) {
                deleteSavedAdventure(e.target.dataset.id);
                if (modal) modal.remove(); // Close and re-open to refresh the list
            }
        }
    });
}

export async function showNewAdventureModal(isCreatorContext = true) {
    let predefinedAdventures = [];
    try {
        const response = await fetch('./assets/adventures_manifest.json');
        if (response.ok) predefinedAdventures = await response.json();
    } catch (error) {
        console.error("Could not load adventure manifest:", error);
    }

    let allTemplates = [...predefinedAdventures];
    if (isCreatorContext) {
        const blankTemplate = { name: 'Blank Adventure', isBlank: true };
        allTemplates.unshift(blankTemplate); // Add "Blank" to the beginning for the creator
    }

    showListModal({
        title: 'Start a New Adventure',
        items: allTemplates,
        renderItem: (template) => `
            <div class="component-item theme-button">
                <div class="list-item-name" ${template.isBlank ? 'data-blank="true"' : `data-path="${template.path}"`} style="flex-grow: 1; cursor: pointer;">
                    ${template.name} ${template.isBlank ? '<em style="color: var(--primary-cyan);">(Empty)</em>' : ''}
                </div>
            </div>`,
        onItemClick: (e) => {
            const modal = document.getElementById('generic-list-modal');
            if (!e.target.classList.contains('list-item-name')) return;

            if (isCreatorContext) {
                // In creator: load into editor
                if (e.target.dataset.blank) createNewAdventure();
                else if (e.target.dataset.path) loadPredefinedAdventureIntoCreator(e.target.dataset.path);
            } else {
                // Not in creator: start playing the adventure
                if (e.target.dataset.path) startAdventure(e.target.dataset.path);
            }

            if (modal) modal.remove();
        }
    });
}

/**
 * Starts a new playthrough of a specific adventure.
 * @param {string} path - The path to the adventure's JSON file.
 */
async function startAdventure(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch adventure: ${path}`);
        const adventureToPlay = await response.json();
        appState.soloGameState.currentAdventure = adventureToPlay;
        loadPuzzle(); // Reload the puzzle with the selected adventure
        showToast(`Starting: ${adventureToPlay.name}`, 'info');
    } catch (error) {
        console.error('Error starting adventure:', error);
        showToast(error.message, 'error');
    }
}

function saveActiveAdventure() {
    if (!activeAdventure) {
        showToast('No active adventure to save.', 'error');
        return;
    }
    activeAdventure.name = document.getElementById('adventure-name-input').value.trim() || 'Unnamed Adventure';

    // Create a clean copy for saving, stripping out transient UI state
    const adventureToSave = JSON.parse(JSON.stringify(activeAdventure));
    if (adventureToSave.nodes) {
        Object.values(adventureToSave.nodes).forEach(node => {
            delete node._ui; // Remove node positions and velocities
        });
    }
    delete adventureToSave._ui; // Remove map pan/zoom state

    const adventures = loadAdventuresFromStorage();
    const existingIndex = adventures.findIndex(adv => adv.id === adventureToSave.id);
    if (existingIndex > -1) {
        adventures[existingIndex] = adventureToSave;
    } else {
        adventures.push(activeAdventure);
    }
    localStorage.setItem(SAVED_ADVENTURES_KEY, JSON.stringify(adventures));
    showToast(`Adventure "${activeAdventure.name}" saved!`, 'info');

    // Also update the currently running game state to reflect the save immediately.
    if (appState.soloGameState?.currentAdventure?.id === activeAdventure.id) {
        appState.soloGameState.currentAdventure = JSON.parse(JSON.stringify(activeAdventure));
        // Re-render the player UI in the background so changes are visible when the creator is closed.
        renderCurrentNode();
    }
}

function deleteSavedAdventure(adventureId, isPredefined = false) {
    if (isPredefined) {
        showToast("Cannot delete a predefined default adventure.", "error");
        return;
    }
    const adventures = loadAdventuresFromStorage();
    const adventureToDelete = adventures.find(adv => adv.id === adventureId);
    if (!adventureToDelete) return;
    const onConfirm = () => {
        const updatedAdventures = adventures.filter(adv => adv.id !== adventureId);
        localStorage.setItem(SAVED_ADVENTURES_KEY, JSON.stringify(updatedAdventures));
        showToast(`Adventure "${adventureToDelete.name}" deleted.`, 'info');
        showLoadAdventureModal(); // Re-render the load modal
        // If the deleted adventure was the one being edited, clear the editor
        if (activeAdventure && activeAdventure.id === adventureId) {
            activeAdventure = null;
            activeNodeId = null;
            document.getElementById('node-editor-area').innerHTML = '<p>Select or create an adventure to begin.</p>';
            document.getElementById('start-inventory-editor-area').innerHTML = '';
            document.getElementById('item-editor-area').innerHTML = '';
            document.getElementById('node-map-preview').innerHTML = '';
            document.getElementById('adventure-name-input').value = '';
        }
    };

    showConfirmationModal(`Are you sure you want to delete "${adventureToDelete.name}"?`, onConfirm);
}

function saveAdventureAs() {
    if (!activeAdventure) {
        showToast('No active adventure to save.', 'error');
        return;
    }
    const newName = prompt('Enter a new name for this adventure:', `${activeAdventure.name} (Copy)`);
    if (newName) {
        // Create a deep copy of the current adventure
        const newAdventure = JSON.parse(JSON.stringify(activeAdventure));
        newAdventure.id = `adv-${Date.now()}`;
        newAdventure.name = newName;

        // Set the new copy as the active adventure and save it
        activeAdventure = newAdventure;
        saveActiveAdventure();

        // Update the UI to reflect the new active adventure
        document.getElementById('adventure-name-input').value = activeAdventure.name;
        renderStartInventoryEditor();
        renderItemEditor();
        renderNodeEditor();
        renderNodeMap();
    }
}

function renderAttributeEditor() {
    if (!activeAdventure) return;

    const editorArea = document.getElementById('attribute-editor-area');
    editorArea.innerHTML = ''; // Clear previous content

    if (!activeAdventure.attributes) {
        activeAdventure.attributes = [];
    }

    activeAdventure.attributes.forEach((attr, index) => {
        const attrRow = document.createElement('div');
        attrRow.className = 'attribute-editor-row';
        attrRow.dataset.index = index;

        attrRow.innerHTML = `
            <div class="attribute-icon-group">
                <input type="text" class="designer-input attribute-icon-input" data-key="icon" value="${attr.icon || ''}" placeholder="Icon" readonly>
                <input type="color" class="designer-input attribute-color-input" data-key="iconColor" value="${attr.iconColor || '#ffffff'}" title="Set Icon Color">
            </div>
            <input type="text" class="designer-input" data-key="name" value="${attr.name}" placeholder="Name">
            <select class="designer-input" data-key="type">
                <option value="pool" ${attr.type === 'pool' ? 'selected' : ''}>Pool</option>
                <option value="stat" ${attr.type === 'stat' ? 'selected' : ''}>Stat</option>
            </select>
            <input type="number" class="designer-input" data-key="value" value="${attr.value}" placeholder="Value">
            <input type="number" class="designer-input max-value-input ${attr.type !== 'pool' ? 'hidden' : ''}" data-key="max" value="${attr.max || ''}" placeholder="Max">
            <button class="remove-attribute-btn">&times;</button>
        `;
        editorArea.appendChild(attrRow);
    });
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Attribute';
    addBtn.className = 'theme-button';
    addBtn.onclick = addAttribute;
    editorArea.appendChild(addBtn);

    // Event delegation for attribute updates
    editorArea.oninput = (e) => {
        const target = e.target;
        const row = target.closest('.attribute-editor-row');
        if (!row) return;

        const index = parseInt(row.dataset.index, 10);
        const key = target.dataset.key;
        const value = target.type === 'number' ? parseInt(target.value, 10) || 0 : target.value;

        activeAdventure.attributes[index][key] = value;

        // Show/hide the 'max' input based on the type
        if (key === 'type') {
            const maxInput = row.querySelector('.max-value-input');
            maxInput.classList.toggle('hidden', value !== 'pool');
        }

        // Enable/disable color picker based on whether the icon is a simple symbol
        if (key === 'icon') {
            const colorInput = row.querySelector('.attribute-color-input');
            // A simple check: if the icon is a single character and not in the typical emoji range, it's likely colorable.
            const isColorable = value.length === 1 && value.charCodeAt(0) < 0x2700;
            colorInput.disabled = !isColorable;
        }
    };

    editorArea.onclick = (e) => {
        if (e.target.classList.contains('remove-attribute-btn')) {
            const row = e.target.closest('.attribute-editor-row');
            const index = parseInt(row.dataset.index, 10);
            activeAdventure.attributes.splice(index, 1);
            renderAttributeEditor(); // Re-render the editor
        } else if (e.target.classList.contains('attribute-icon-input')) {
            const iconInput = e.target;
            showSymbolPicker(iconInput);
        }
    };
}

function showSymbolPicker(targetIconInput) {
    const SYMBOLS = {
        'Attributes': ['❤️', '✨', '⚡', '🔋', '💰', '💪', '🧠', '🍀', '🌀', '❤️‍🩹', '🔥', '💧', '🍃', '⛰️'],
        'Items': ['🔑', '🗝️', '🛡️', '⚔️', '🏹', '💣', '🗺️', '🧭', '💎', '📜', '📖', '🧪', '瓶', '🍎'],
        'Actions': ['💬', '👀', '👂', '🖐️', '🏃', '🚶', '👊', '🙏', '🤔', '😴'],
        'Colorable Symbols': ['❤', '★', '♦', '♠', '♣', '▲', '▼', '●', '■', '◆', '✚', '†', '‡']
    };

    const modal = document.createElement('div');
    modal.id = 'symbol-picker-modal';
    modal.className = 'confirmation-modal';
    modal.style.maxWidth = '700px';

    let contentHTML = '<h3 style="margin-top: 0;">Pick an Icon</h3>';
    for (const category in SYMBOLS) {
        contentHTML += `<h4>${category}</h4>`;
        contentHTML += '<div class="symbol-grid">';
        contentHTML += SYMBOLS[category].map(symbol => `<div class="symbol-item">${symbol}</div>`).join('');
        contentHTML += '</div>';
    }
    contentHTML += '<button id="symbol-picker-close-btn" class="theme-button" style="margin-top: 20px;">Close</button>';

    modal.innerHTML = contentHTML;
    document.body.appendChild(modal);

    modal.querySelector('#symbol-picker-close-btn').onclick = () => modal.remove();

    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('symbol-item')) {
            const symbol = e.target.textContent;
            targetIconInput.value = symbol;
            // Trigger the input event to update the state and check for colorability
            targetIconInput.dispatchEvent(new Event('input', { bubbles: true }));
            modal.remove();
        }
    });
}

let layoutAnimationId = null;

function runNodeLayout(start) {
    if (!activeAdventure) {
        showToast('No active adventure to organize.', 'error');
        return;
    }

    const nodes = Object.values(activeAdventure.nodes);
    if (nodes.length === 0) return;

    const autoOrganizeBtn = document.getElementById('auto-organize-btn');
    const stopOrganizeBtn = document.getElementById('stop-organize-btn');

    if (!start) {
        if (layoutAnimationId) cancelAnimationFrame(layoutAnimationId);
        layoutAnimationId = null;
        autoOrganizeBtn.style.display = '';
        stopOrganizeBtn.style.display = 'none';

        // Log the final state of the node map for debugging purposes.
        const mapArea = document.getElementById('node-map-preview');
        console.log(`--- Auto Organize Complete ---`);
        console.log(`Node Map Height: ${mapArea.clientHeight}px`);
        console.log('Final Node Positions:');
        Object.values(activeAdventure.nodes).forEach(node => {
            if (node._ui) {
                console.log(`- Node "${node.title || node.id}": x=${node._ui.x.toFixed(2)}, y=${node._ui.y.toFixed(2)}`);
            }
        });
        console.log(`------------------------------`);
        return;
    }

    autoOrganizeBtn.style.display = 'none';
    stopOrganizeBtn.style.display = '';

    const mapArea = document.getElementById('node-map-preview');
    // Use the container's width for both dimensions to force a square layout area.
    // This creates a more circular and compact node arrangement, regardless of container aspect ratio.
    const layoutWidth = mapArea.clientWidth;
    const layoutHeight = mapArea.clientWidth; // Use width for height to create a square
    const K_REPEL = 60000; // Increased repulsion to spread nodes out more
    const K_ATTRACT = 0.01; // Reduced attraction to prevent aggressive snapping
    const IDEAL_LENGTH = 200;
    const GRAVITY = 0.1; // Increased gravity to pull nodes towards the center more strongly
    let temperature = 5.0; // Higher initial temperature for more aggressive initial movement
    const COOLING_RATE = 0.995; // Slower cooling rate

    let iterationCount = 0;
    let lastTotalMovement = Infinity; // For adaptive cooling

    function step() {
        let totalMovement = 0;

        // --- 1. Calculate Forces ---
        for (const node of nodes) {
            node._ui.vx = node._ui.vx || 0;
            node._ui.vy = node._ui.vy || 0;

            const centerDx = layoutWidth / 2 - node._ui.x;
            const centerDy = layoutHeight / 2 - node._ui.y;
            node._ui.vx += centerDx * GRAVITY * 0.01;
            node._ui.vy += centerDy * GRAVITY * 0.01;

            for (const otherNode of nodes) {
                if (node === otherNode) continue;
                const dx = node._ui.x - otherNode._ui.x;
                const dy = node._ui.y - otherNode._ui.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const repulsionForce = K_REPEL / (distance * distance);
                node._ui.vx += (dx / distance) * repulsionForce;
                node._ui.vy += (dy / distance) * repulsionForce;

                // --- New: Collision Detection & Resolution ---
                // Based on the principle of a "collision" force to prevent visual overlap.
                const nodeRadius = 15; // As defined in the SVG rendering
                const minDistance = nodeRadius * 2; // Minimum distance to prevent overlap

                if (distance < minDistance) {
                    const overlap = minDistance - distance;
                    const collisionForce = overlap * 0.1; // A gentle but firm push
                    node._ui.vx += (dx / distance) * collisionForce;
                    node._ui.vy += (dy / distance) * collisionForce;
                }
            }

            for (const choice of node.choices) {
                const targetNode = activeAdventure.nodes[choice.targetNodeId];
                if (!targetNode) continue;
                const dx = targetNode._ui.x - node._ui.x;
                const dy = targetNode._ui.y - node._ui.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const springForce = K_ATTRACT * (distance - IDEAL_LENGTH);
                node._ui.vx += (dx / distance) * springForce;
                node._ui.vy += (dy / distance) * springForce;
                targetNode._ui.vx -= (dx / distance) * springForce;
                targetNode._ui.vy -= (dy / distance) * springForce;
            }
        }

        // --- 2. Apply Forces and Update Positions ---
        for (const node of nodes) {
            // Apply temperature to the velocity, and limit max movement per step
            const dx = Math.max(-50, Math.min(50, node._ui.vx * 0.01 * temperature));
            const dy = Math.max(-50, Math.min(50, node._ui.vy * 0.01 * temperature));

            node._ui.x += dx;
            node._ui.y += dy;
            totalMovement += Math.abs(node._ui.vx) + Math.abs(node._ui.vy);

            // Apply damping to slow down movement over time
            node._ui.vx *= 0.9;
            node._ui.vy *= 0.9;
        }

        // --- Adaptive Cooling ---
        // Only cool down if the system's energy is decreasing.
        // This allows the system to remain "hot" and make large changes for longer if it's still chaotic.
        if (totalMovement < lastTotalMovement) {
            temperature *= COOLING_RATE;
        }
        lastTotalMovement = totalMovement;
        iterationCount++;

        renderNodeMap(false);
        if (temperature > 0.01 && iterationCount < 500) { // Stop when the system is "cool" or after max iterations
            layoutAnimationId = requestAnimationFrame(step);
        } else {
            runNodeLayout(false); // Automatically stop when stable
        }
    }

    step(); // Start the animation loop
}

function renderItemEditor() {
    if (!activeAdventure) return;

    const editorArea = document.getElementById('item-editor-area');
    editorArea.innerHTML = ''; // Clear previous content

    if (!activeAdventure.masterItems) {
        activeAdventure.masterItems = [];
    }

    activeAdventure.masterItems.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'attribute-editor-row'; // Reuse attribute styles
        itemRow.dataset.index = index;

        itemRow.innerHTML = `
            <input type="text" class="designer-input" data-key="id" value="${item.id}" placeholder="Item ID (e.g., brass_key)">
            <input type="text" class="designer-input" data-key="name" value="${item.name}" placeholder="Display Name (e.g., Brass Key)">
            <input type="text" class="designer-input" data-key="description" value="${item.description || ''}" placeholder="Description">
            <button class="remove-attribute-btn">&times;</button>
        `;
        editorArea.appendChild(itemRow);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Item';
    addBtn.className = 'theme-button';
    addBtn.onclick = addItemDefinition;
    editorArea.appendChild(addBtn);

    // Event delegation for item updates
    editorArea.oninput = (e) => {
        const target = e.target;
        const row = target.closest('.attribute-editor-row');
        if (!row) return;

        const index = parseInt(row.dataset.index, 10);
        const key = target.dataset.key;
        activeAdventure.masterItems[index][key] = target.value;
    };

    editorArea.onclick = (e) => {
        if (e.target.classList.contains('remove-attribute-btn')) {
            const row = e.target.closest('.attribute-editor-row');
            const index = parseInt(row.dataset.index, 10);
            activeAdventure.masterItems.splice(index, 1);
            renderItemEditor(); // Re-render the editor
        }
    };
}

function addItemDefinition() {
    if (!activeAdventure) return;
    if (!activeAdventure.masterItems) activeAdventure.masterItems = [];

    const newId = `item_${Date.now()}`;
    activeAdventure.masterItems.push({
        id: newId,
        name: 'New Item',
        description: ''
    });
    renderItemEditor();
}

function renderStartInventoryEditor() {
    if (!activeAdventure) return;

    const editorArea = document.getElementById('start-inventory-editor-area');
    editorArea.innerHTML = ''; // Clear previous content

    if (!activeAdventure.inventory) {
        activeAdventure.inventory = [];
    }

    activeAdventure.inventory.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'logic-row'; // Reuse logic row styles
        itemRow.dataset.index = index;

        const allItems = getAllItemIds();
        const masterItem = activeAdventure.masterItems?.find(mi => mi.id === item.id);
        const itemName = masterItem ? masterItem.name : item.name || '';

        itemRow.innerHTML = `
            <input list="item-datalist-start" class="designer-input" data-key="id" value="${item.id || ''}" placeholder="Item ID">
            <datalist id="item-datalist-start">
                ${allItems.map(i => `<option value="${i}"></option>`).join('')}
            </datalist>
            <input type="text" class="designer-input" value="${itemName}" placeholder="Item Name" readonly>
            <input type="number" class="designer-input" data-key="quantity" value="${item.quantity || 1}" placeholder="Qty" style="flex-grow: 0.5;">
            <button class="remove-logic-btn">&times;</button>
        `;
        editorArea.appendChild(itemRow);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Starting Item';
    addBtn.className = 'theme-button';
    addBtn.onclick = addStartingItem;
    editorArea.appendChild(addBtn);

    // Event delegation for updates
    editorArea.oninput = (e) => {
        const target = e.target;
        const row = target.closest('.logic-row');
        if (!row) return;

        const index = parseInt(row.dataset.index, 10);
        const key = target.dataset.key;
        activeAdventure.inventory[index][key] = target.value;
        renderStartInventoryEditor(); // Re-render to update the name field
    };

    editorArea.onclick = (e) => {
        if (e.target.classList.contains('remove-logic-btn')) {
            const row = e.target.closest('.logic-row');
            const index = parseInt(row.dataset.index, 10);
            activeAdventure.inventory.splice(index, 1);
            renderStartInventoryEditor(); // Re-render the editor
        }
    };
}

function addStartingItem() {
    if (!activeAdventure) return;
    activeAdventure.inventory.push({ id: '', name: '', quantity: 1 });
    renderStartInventoryEditor();
}

function addAttribute() {
    if (!activeAdventure) return;
    if (!activeAdventure.attributes) activeAdventure.attributes = [];

    const newId = `attr-${Date.now()}`;
    activeAdventure.attributes.push({ id: newId, name: 'New Attribute', icon: '⚙️', type: 'stat', value: 10 });
    renderAttributeEditor();
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
        <textarea class="adventure-creator-node-text" data-node-key="text" placeholder="Enter story text for this node...">${node.text}</textarea>
        <h5>Choices: <span class="info-icon" data-info="choices">ⓘ</span></h5>
        <div id="choices-container">
            ${node.choices.map((choice, index) => `
                <div class="adventure-choice-editor" data-choice-index="${index}">
                    <div class="choice-main-controls">
                        <input type="text" class="designer-input" data-choice-key="text" value="${choice.text}" placeholder="Choice Text">
                        <select class="designer-input" data-choice-key="targetNodeId" value="${choice.targetNodeId}">${allNodesOptions}</select>
                        <button class="theme-button edit-choice-logic-btn">Rules</button>
                        <button class="remove-choice-btn">&times;</button>
                    </div>
                    <div class="choice-logic-editor collapsed">
                        <div class="logic-section">
                            <h5>Requirements</h5>
                            <div class="requirements-list">
                                ${choice.requirements?.map((req, reqIndex) => renderRequirementEditor(req, reqIndex)).join('') || ''}
                            </div>
                            <button class="theme-button add-requirement-btn">Add Requirement</button>
                        </div>
                        <div class="logic-section">
                            <h5>Effects</h5>
                            <div class="effects-list">
                                ${choice.effects?.map((eff, effIndex) => renderEffectEditor(eff, effIndex)).join('') || ''}
                            </div>
                            <button class="theme-button add-effect-btn">Add Effect</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <button id="add-choice-btn" class="theme-button">Add Choice</button>
    `;

    // Set the selected option for each dropdown after innerHTML is processed
    editorArea.querySelectorAll('select[data-choice-key="targetNodeId"]').forEach((select, index) => {
        select.value = node.choices[index].targetNodeId;
    });
    // Also set the selected options for the dynamic logic editors
    editorArea.querySelectorAll('.requirements-list .logic-row').forEach(row => {
        const choiceIndex = row.closest('.adventure-choice-editor').dataset.choiceIndex;
        const reqIndex = row.dataset.index;
        const requirement = activeAdventure.nodes[activeNodeId].choices[choiceIndex].requirements[reqIndex];
        row.querySelector('[data-key="type"]').value = requirement.type;
        if (requirement.type === 'attribute') {
            row.querySelector('[data-key="id"]').value = requirement.id;
            row.querySelector('[data-key="operator"]').value = requirement.operator;
        }
    });
    editorArea.querySelectorAll('.effects-list .logic-row').forEach(row => {
        const choiceIndex = row.closest('.adventure-choice-editor').dataset.choiceIndex;
        const effIndex = row.dataset.index;
        const effect = activeAdventure.nodes[activeNodeId].choices[choiceIndex].effects[effIndex];
        row.querySelector('[data-key="type"]').value = effect.type;
        if (effect.type === 'attribute') {
            row.querySelector('[data-key="id"]').value = effect.id;
            row.querySelector('[data-key="operator"]').value = effect.operator;
        } else { // item
            row.querySelector('[data-key="action"]').value = effect.action;
            // Item ID would be a text input for now
        }
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
            if (nodeKey === 'color') renderNodeMap(false);
        } else if (choiceKey) {
            const choiceIndex = target.closest('.adventure-choice-editor').dataset.choiceIndex;
            activeAdventure.nodes[activeNodeId].choices[choiceIndex][choiceKey] = target.value;
        }

        // Handle updates within the logic editors (Requirements and Effects)
        const logicRow = target.closest('.logic-row');
        if (logicRow) {
            const choiceEditor = target.closest('.adventure-choice-editor');
            const choiceIndex = parseInt(choiceEditor.dataset.choiceIndex, 10);
            const logicIndex = parseInt(logicRow.dataset.index, 10);
            const key = target.dataset.key;
            let value = target.value;

            // Handle checkbox values
            if (target.type === 'checkbox') {
                value = target.checked;
            }

            // Coerce to number if the input type is number
            if (target.type === 'number') {
                value = parseInt(value, 10);
                if (isNaN(value)) {
                    value = 0; // Default to 0 if parsing fails
                }
            }

            const list = logicRow.parentElement;
            if (list.classList.contains('requirements-list')) {
                const requirement = activeAdventure.nodes[activeNodeId].choices[choiceIndex].requirements[logicIndex];
                // Special handling for checkbox
                if (key === 'hideOnFail') {
                    requirement[key] = target.checked;
                    return; // No need to re-render for this
                }
                if (requirement) {
                    requirement[key] = value;
                }
            } else if (list.classList.contains('effects-list')) {
                const effect = activeAdventure.nodes[activeNodeId].choices[choiceIndex].effects[logicIndex];
                if (effect) {
                    effect[key] = value;
                    // For the new 'node' effect, try to parse the JSON value
                    if (effect.type === 'node' && key === 'value') {
                        try {
                            effect.value = JSON.parse(value);
                        } catch (e) {
                            // Ignore parse errors while typing
                        }
                    }
                }
            }

            // If the user types a new item ID, we need to re-render to add it to the dropdowns.
            if (key === 'id' && logicRow.closest('.logic-row').querySelector('[data-key="type"]').value === 'item') {
                renderNodeEditor();
            }
        }
    };

    editorArea.onclick = (e) => {
        if (e.target.classList.contains('remove-choice-btn')) {
            const choiceIndex = e.target.closest('.adventure-choice-editor').dataset.choiceIndex;
            activeAdventure.nodes[activeNodeId].choices.splice(choiceIndex, 1);
            renderNodeEditor(); // Re-render to reflect the change
        } else if (e.target.classList.contains('edit-choice-logic-btn')) {
            const editor = e.target.closest('.adventure-choice-editor').querySelector('.choice-logic-editor');
            editor.classList.toggle('collapsed');
        } else if (e.target.classList.contains('add-requirement-btn')) {
            const openEditors = getOpenEditorIndices(editorArea);
            const choiceIndex = e.target.closest('.adventure-choice-editor').dataset.choiceIndex;
            const choice = activeAdventure.nodes[activeNodeId].choices[choiceIndex];
            if (!choice.requirements) choice.requirements = [];
            choice.requirements.push({ type: 'attribute', id: 'strength', operator: '>=', value: 10 });
            renderNodeEditor();
            restoreOpenEditorIndices(editorArea, openEditors);
        } else if (e.target.classList.contains('add-effect-btn')) {
            const openEditors = getOpenEditorIndices(editorArea);
            const choiceIndex = e.target.closest('.adventure-choice-editor').dataset.choiceIndex;
            const choice = activeAdventure.nodes[activeNodeId].choices[choiceIndex];
            if (!choice.effects) choice.effects = [];
            choice.effects.push({ type: 'attribute', id: 'health', operator: '-', value: 5 });
            renderNodeEditor();
            restoreOpenEditorIndices(editorArea, openEditors);
        } else if (e.target.classList.contains('remove-logic-btn')) {
            const openEditors = getOpenEditorIndices(editorArea);
            const choiceIndex = e.target.closest('.adventure-choice-editor').dataset.choiceIndex;
            const logicRow = e.target.closest('.logic-row');
            const list = e.target.closest('.requirements-list, .effects-list');
            const logicIndex = logicRow.dataset.index;
            if (list.classList.contains('requirements-list')) {
                activeAdventure.nodes[activeNodeId].choices[choiceIndex].requirements.splice(logicIndex, 1);
            } else {
                activeAdventure.nodes[activeNodeId].choices[choiceIndex].effects.splice(logicIndex, 1);
            }
            renderNodeEditor();
            restoreOpenEditorIndices(editorArea, openEditors);
        }
    };

    // Add a specific 'onchange' listener for the logic editors since 'oninput' doesn't fire for select changes in some cases.
    editorArea.onchange = (e) => {
        const target = e.target;
        const logicRow = target.closest('.logic-row');
        if (!logicRow || target.dataset.key !== 'type') return;

        const choiceEditor = target.closest('.adventure-choice-editor');
        const choiceIndex = parseInt(choiceEditor.dataset.choiceIndex, 10);
        const logicIndex = parseInt(logicRow.dataset.index, 10);
        const list = logicRow.parentElement;

        const openEditors = getOpenEditorIndices(editorArea);

        if (list.classList.contains('requirements-list')) {
            activeAdventure.nodes[activeNodeId].choices[choiceIndex].requirements[logicIndex].type = target.value;
        } else { // effects-list
            activeAdventure.nodes[activeNodeId].choices[choiceIndex].effects[logicIndex].type = target.value;
            // When switching to 'node', set a default action
            if (target.value === 'node') {
                activeAdventure.nodes[activeNodeId].choices[choiceIndex].effects[logicIndex].action = 'addChoice';
            }
        }

        renderNodeEditor();
        restoreOpenEditorIndices(editorArea, openEditors);
    };
}

function getOpenEditorIndices(editorArea) {
    const openIndices = new Set();
    editorArea.querySelectorAll('.choice-logic-editor:not(.collapsed)').forEach(editor => {
        const choiceIndex = editor.closest('.adventure-choice-editor').dataset.choiceIndex;
        openIndices.add(choiceIndex);
    });
    return openIndices;
}

function restoreOpenEditorIndices(editorArea, openIndices) {
    openIndices.forEach(index => {
        const choiceEditor = editorArea.querySelector(`.adventure-choice-editor[data-choice-index="${index}"]`);
        choiceEditor?.querySelector('.choice-logic-editor')?.classList.remove('collapsed');
    });
}

/**
 * Scans the entire adventure object to find all unique item IDs.
 * @returns {string[]} An array of unique item ID strings.
 */
function getAllItemIds() {
    if (!activeAdventure) return [];

    const itemIds = new Set();
    activeAdventure.masterItems?.forEach(item => itemIds.add(item.id));

    // Scan starting inventory
    activeAdventure.inventory?.forEach(item => itemIds.add(item.id));

    // Scan all nodes
    Object.values(activeAdventure.nodes).forEach(node => {
        // Items available in the node
        node.items?.forEach(item => itemIds.add(item.id));

        // Items in choices (requirements and effects)
        node.choices?.forEach(choice => {
            choice.requirements?.forEach(req => { if (req.type === 'item') itemIds.add(req.id); });
            choice.effects?.forEach(eff => { if (eff.type === 'item') itemIds.add(eff.id); });
        });
    });

    return Array.from(itemIds).sort();
}

function renderRequirementEditor(req, index) {
    const attributes = activeAdventure.attributes.map(attr => `<option value="${attr.id}">${attr.name}</option>`).join('');
    const allItems = getAllItemIds();
    let specificFields = '';
    if (req.type === 'attribute') {
        specificFields = `
            <select class="designer-input" data-key="id">${attributes}</select>
            <select class="designer-input" data-key="operator">
                <option value=">=" ${req.operator === '>=' ? 'selected' : ''}>&ge;</option>
                <option value=">" ${req.operator === '>' ? 'selected' : ''}>&gt;</option>
                <option value="==" ${req.operator === '==' ? 'selected' : ''}>=</option>
                <option value="<=" ${req.operator === '<=' ? 'selected' : ''}>&le;</option>
                <option value="<" ${req.operator === '<' ? 'selected' : ''}>&lt;</option>
            </select>
            <input type="number" class="designer-input" data-key="value" value="${req.value}" placeholder="Value">
        `;
    } else { // item
        specificFields = `
            <input list="item-datalist" class="designer-input" data-key="id" value="${req.id || ''}" placeholder="Item ID">
            <datalist id="item-datalist">
                ${allItems.map(item => `<option value="${item}"></option>`).join('')}
            </datalist>
            <input type="number" class="designer-input" data-key="quantity" value="${req.quantity || 1}" placeholder="Qty">
        `;
    }

    return `
        <div class="logic-row" data-index="${index}">
            <select class="designer-input" data-key="type">
                <option value="attribute" ${req.type === 'attribute' ? 'selected' : ''}>Attribute</option>
                <option value="item" ${req.type === 'item' ? 'selected' : ''}>Item</option>
            </select>
            ${specificFields}
            <label class="designer-checkbox-label">
                <input type="checkbox" data-key="hideOnFail" ${req.hideOnFail ? 'checked' : ''}> Hide if unmet
            </label>
            <button class="remove-logic-btn">&times;</button>
        </div>
    `;
}

function renderEffectEditor(eff, index) {
    const attributes = activeAdventure.attributes.map(attr => `<option value="${attr.id}">${attr.name}</option>`).join('');
    const allItems = getAllItemIds();
    let specificFields = '';
    if (eff.type === 'attribute') {
        specificFields = `
            <select class="designer-input" data-key="id">${attributes}</select>
            <select class="designer-input" data-key="operator">
                <option value="+">+</option>
                <option value="-">-</option>
                <option value="=">=</option>
            </select>
            <input type="number" class="designer-input" data-key="value" value="${eff.value}" placeholder="Value">
        `;
    } else if (eff.type === 'item') {
        specificFields = `
            <select class="designer-input" data-key="action">
                <option value="add">Add</option>
                <option value="remove">Remove</option>
            </select>
            <input list="item-datalist-eff" class="designer-input" data-key="id" value="${eff.id || ''}" placeholder="Item ID">
            <datalist id="item-datalist-eff">
                ${allItems.map(item => `<option value="${item}"></option>`).join('')}
            </datalist>
            <input type="number" class="designer-input" data-key="quantity" value="${eff.quantity}" placeholder="Qty">
        `;
    } else { // node
        specificFields = `
            <select class="designer-input" data-key="action">
                <option value="addChoice" ${eff.action === 'addChoice' ? 'selected' : ''}>Add Choice</option>
                <option value="removeChoice" ${eff.action === 'removeChoice' ? 'selected' : ''}>Remove Self</option>
            </select>
            <textarea class="designer-input" data-key="value" placeholder='JSON for new choice, e.g., {"text":"Examine gem","targetNodeId":"..."}'>${(typeof eff.value === 'string' ? eff.value : JSON.stringify(eff.value)) || ''}</textarea>
        `;
        // For 'removeChoice', the textarea isn't used but we show it for consistency.
        if (eff.action === 'removeChoice') {
            specificFields = specificFields.replace('<textarea', '<textarea style="display:none;"');
        }
    }

    return `
        <div class="logic-row" data-index="${index}">
            <select class="designer-input" data-key="type">
                <option value="attribute">Attribute</option>
                <option value="item">Item</option>
                <option value="node" ${eff.type === 'node' ? 'selected' : ''}>Node</option>
            </select>
            ${specificFields}
            <button class="remove-logic-btn">&times;</button>
        </div>
    `;
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

function renderNodeMap(isInitialRender) {
    if (!activeAdventure) return;

    const mapArea = document.getElementById('node-map-preview');
    let svg = mapArea.querySelector('svg');

    let draggedNode = null;
    let isPanning = false;
    let offset = { x: 0, y: 0 };
    let starLayers = []; // To hold our parallax star layers

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
        renderNodeMap(false); // Re-render while dragging (optimized update)
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

        // Update star layers for parallax effect
        starLayers.forEach(layer => {
            const transform = `translate(${-activeAdventure._ui.pan.x * layer.factor}, ${-activeAdventure._ui.pan.y * layer.factor})`;
            layer.group.setAttribute('transform', transform);
        });

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
        renderNodeMap(false); // Re-render on zoom (optimized update)
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
            <g id="star-layer-far"></g>
            <g id="star-layer-mid"></g>
            <g id="star-layer-near"></g>
        `;
        svg.addEventListener('mousedown', onMouseDownBackground);
        svg.addEventListener('wheel', onWheel);

        // --- Generate Starfield on first creation ---
        const mapWidth = 2000; // A large area for stars
        const mapHeight = 2000;
        const createStars = (count, minSize, maxSize, group) => {
            for (let i = 0; i < count; i++) {
                const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                star.setAttribute('class', 'adventure-bg-star');
                star.setAttribute('cx', Math.random() * mapWidth - mapWidth / 2);
                star.setAttribute('cy', Math.random() * mapHeight - mapHeight / 2);
                star.setAttribute('r', (Math.random() * (maxSize - minSize) + minSize).toFixed(2));
                star.style.opacity = (Math.random() * 0.8 + 0.1).toFixed(2);
                group.appendChild(star);
            }
        };

        const farGroup = svg.querySelector('#star-layer-far');
        const midGroup = svg.querySelector('#star-layer-mid');
        const nearGroup = svg.querySelector('#star-layer-near');

        createStars(200, 0.5, 1.2, farGroup); // Distant, small stars
        createStars(100, 0.8, 1.8, midGroup); // Mid-ground stars
        createStars(50, 1.2, 2.5, nearGroup);   // Closer, larger stars

        starLayers = [
            { group: farGroup, factor: 0.1 }, // Moves very slowly
            { group: midGroup, factor: 0.3 },
            { group: nearGroup, factor: 0.6 }  // Moves fastest
        ];
    }

    // On initial render, clear everything and set up the definitions.
    // On subsequent updates, we'll just move things.
    if (isInitialRender) {
        // Clear only nodes and edges, not the star background
        svg.querySelectorAll('.adventure-node-group, .adventure-edge, .edge-text').forEach(el => el.remove());
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
            const edgeId = `edge-${node.id}-to-${targetNode.id}-${i}`;
            const textPathId = `textpath-${node.id}-to-${targetNode.id}-${i}`;

            let visiblePath = svg.querySelector(`#${edgeId}`);
            if (!visiblePath) {
                visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                visiblePath.id = edgeId;
                visiblePath.setAttribute('class', 'adventure-edge');
                visiblePath.setAttribute('marker-end', 'url(#arrowhead)');
                svg.appendChild(visiblePath);
            }
            visiblePath.setAttribute('d', `M${node._ui.x},${node._ui.y} L${targetNode._ui.x},${targetNode._ui.y}`);

            let textPathEl = svg.querySelector(`#${textPathId}`);
            if (!textPathEl) {
                textPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                textPathEl.id = textPathId;
                svg.appendChild(textPathEl);
            }
            textPathEl.setAttribute('d', `M${startX},${startY} L${endX},${endY}`);

            let text = svg.querySelector(`text[data-edge-id="${edgeId}"]`);
            if (!text) {
                text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.dataset.edgeId = edgeId;
                text.setAttribute('class', 'edge-text');
                const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
                textPath.setAttribute('href', `#${textPathId}`);
                textPath.setAttribute('startOffset', '50%');
                textPath.setAttribute('text-anchor', 'middle');
                textPath.textContent = choice.text;
                text.appendChild(textPath);
                svg.appendChild(text);
            }
        });
    });

    // --- 3. Render Nodes ---
    nodes.forEach(node => {
        const nodeId = `node-group-${node.id}`;
        let g = svg.querySelector(`#${nodeId}`);
        if (!g) {
            g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.id = nodeId;
            g.setAttribute('class', 'adventure-node-group');
            g.innerHTML = `
                <circle r="15" class="adventure-node-circle"></circle>
                <text y="30" text-anchor="middle"></text>
            `;
            g.addEventListener('click', (e) => { e.stopPropagation(); setActiveNode(node.id); });
            g.addEventListener('mousedown', (e) => onMouseDown(e, node));
            svg.appendChild(g);
        }

        // Always update position and content
        g.setAttribute('transform', `translate(${node._ui.x}, ${node._ui.y})`);
        const circle = g.querySelector('circle');
        circle.setAttribute('stroke', node.color || '#00A0C0');
        circle.classList.toggle('active', node.id === activeNodeId);

        // Reset fill before applying conditional styles
        circle.style.fill = '';
        if (node.id === activeAdventure.startNodeId) circle.style.fill = '#90ee90';
        else if (node.choices.length === 0) {
            const lowerCaseText = node.text.toLowerCase();
            if (node.id === 'GAME_OVER' || lowerCaseText.includes('ends here') || lowerCaseText.includes('you die')) circle.style.fill = '#CC3333';
            else circle.style.fill = '#FFFFFF';
        }

        g.querySelector('text').textContent = node.title || node.id;
    });

    window.setActiveNode = (nodeId) => {
        activeNodeId = nodeId;
        renderNodeEditor();
        renderNodeMap(false); // Re-render map to show active selection (optimized update)
    };
}

// Multiplayer functions (placeholders)
export function processMove(moveData) {}
export function processUIUpdate(data) {}