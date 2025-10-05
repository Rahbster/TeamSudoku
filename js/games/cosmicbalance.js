//==============================
// Cosmic Balance Game Logic
//==============================

import { dom, appState, dataChannels } from '../scripts.js';
import { showToast } from '../ui.js';
import { startTimer, stopTimer } from '../timer.js';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 1000;
const NUM_SYSTEMS = 50;
const MIN_STAR_DISTANCE = 80;

export function initialize() {
    startTimer();
    // Hide all other game areas
    dom.sudokuGridArea.classList.add('hidden');
    dom.numberPad.classList.add('hidden');
    dom.pencilButton.classList.add('hidden');

    // Show the Cosmic Balance area
    dom.cosmicBalanceArea.classList.remove('hidden');

    // Wire up the "New Game" button
    dom.newPuzzleButton.onclick = loadPuzzle;

    // If we are initializing for a solo game, draw the grid.
    if (appState.isInitiator && !appState.playerTeam) {
        createGrid();
    }
}

export function cleanup() {
    stopTimer();
    dom.cosmicBalanceArea.classList.add('hidden');
}

export function createGrid() {
    const starmapView = document.getElementById('starmap-view');
    const infoPanel = document.getElementById('info-panel');
    starmapView.innerHTML = '';
    infoPanel.innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';

    const gameState = appState.soloGameState;
    if (!gameState || gameState.systems.length === 0) {
        console.log("No game state found, loading new puzzle.");
        loadPuzzle();
        return;
    }

    gameState.systems.forEach(system => {
        const starDiv = document.createElement('div');
        starDiv.className = 'star-system';
        starDiv.style.left = `${(system.x / MAP_WIDTH) * 100}%`;
        starDiv.style.top = `${(system.y / MAP_HEIGHT) * 100}%`;
        starDiv.title = system.name;

        starDiv.addEventListener('click', () => {
            // For now, clicking any star will trigger a combat encounter
            startCombat(system);
        });

        starmapView.appendChild(starDiv);
    });
}

function renderInfoPanelForStarmap(system) {
    document.getElementById('info-panel').innerHTML = `
        <h3>${system.name}</h3>
        <p>Coordinates: (${system.x}, ${system.y})</p>
        <p>Resources: TBD</p>
        <p>Owner: Neutral</p>`;
}

export function getInitialState() {
    const systems = [];
    for (let i = 0; i < NUM_SYSTEMS; i++) {
        let x, y, tooClose;
        do {
            tooClose = false;
            x = Math.floor(Math.random() * (MAP_WIDTH - 100)) + 50; // Add padding
            y = Math.floor(Math.random() * (MAP_HEIGHT - 100)) + 50;
            for (const otherSystem of systems) {
                const distance = Math.sqrt(Math.pow(otherSystem.x - x, 2) + Math.pow(otherSystem.y - y, 2));
                if (distance < MIN_STAR_DISTANCE) {
                    tooClose = true;
                    break;
                }
            }
        } while (tooClose);

        systems.push({ id: i, name: `System ${i + 1}`, x, y, owner: null });
    }

    return {
        turn: 1,
        systems: systems,
        fleets: [],  // Array of player fleets
        combat: {
            active: false,
            ships: [],
            turn: 0
        },
        shipDesigns: [], // Array of custom ship designs
    };
}

export function loadPuzzle() {
    appState.soloGameState = getInitialState();
    createGrid();
}

function startCombat(system) {
    const gameState = appState.soloGameState;
    gameState.combat.active = true;

    // Create two placeholder ships for the encounter
    // Based on the documentation, these have properties for movement and combat.
    gameState.combat.ships = [
        { id: 'player-1', name: 'Player Ship', owner: 'player1', x: 200, y: 500, heading: 0, speed: 0, mass: 8, acceleration: 4, isPlayer: true, orders: { targetSpeed: 0, targetHeading: 0 }, weapons: [{ id: 'w1', type: 'Heavy Phaser', arcs: [1, 8], range: 400, status: 'ready', targetId: null }], hp: 16, shields: [10, 10, 10, 10, 10, 10, 10, 10] },
        { id: 'enemy-1', name: 'Enemy Ship', owner: 'player2', x: 800, y: 500, heading: 180, speed: 0, mass: 8, acceleration: 4, isPlayer: false, orders: { targetSpeed: 50, targetHeading: 180 }, weapons: [{ id: 'w1', type: 'Heavy Phaser', arcs: [1, 8], range: 400, status: 'ready', targetId: null }], hp: 16, shields: [10, 10, 10, 10, 10, 10, 10, 10] }
    ];
    gameState.combat.turn = 1;

    // Select the first player ship by default
    if (!gameState.combat.selectedShipId) {
        const playerShip = gameState.combat.ships.find(s => s.isPlayer);
        if (playerShip) {
            gameState.combat.selectedShipId = playerShip.id;
        }
    }

    // Switch views
    document.getElementById('starmap-view').classList.add('hidden');
    document.getElementById('combat-map-view').classList.remove('hidden');

    renderCombatMap();
    renderCombatInfoPanel();
}

function endCombat() {
    appState.soloGameState.combat.active = false;
    document.getElementById('combat-map-view').classList.add('hidden');
    document.getElementById('starmap-view').classList.remove('hidden');
    // Reset info panel to default
    document.getElementById('info-panel').innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
}

function renderCombatMap() {
    const combatMap = document.getElementById('combat-map-view');
    combatMap.innerHTML = ''; // Clear previous state

    const ships = appState.soloGameState.combat.ships;
    if (ships.length === 0) return;

    // 1. Calculate the "center of gravity" of all ships
    const totalX = ships.reduce((sum, ship) => sum + ship.x, 0);
    const totalY = ships.reduce((sum, ship) => sum + ship.y, 0);
    const centerX = totalX / ships.length;
    const centerY = totalY / ships.length;

    // 2. Determine the offset needed to move the center of gravity to the center of the map
    const viewCenterX = MAP_WIDTH / 2;
    const viewCenterY = MAP_HEIGHT / 2;
    const offsetX = viewCenterX - centerX;
    const offsetY = viewCenterY - centerY;

    ships.forEach(ship => {
        const shipDiv = document.createElement('div');
        shipDiv.className = 'ship';
        shipDiv.id = `ship-${ship.id}`;
        if (!ship.isPlayer) {
            shipDiv.classList.add('enemy');
        }
        // 3. Apply the offset to each ship's position to create the centered view
        const displayX = ship.x + offsetX;
        const displayY = ship.y + offsetY;

        shipDiv.style.left = `${(displayX / MAP_WIDTH) * 100}%`;
        shipDiv.style.top = `${(displayY / MAP_HEIGHT) * 100}%`;
        shipDiv.style.transform = `rotate(${ship.heading}deg)`;

        shipDiv.addEventListener('click', () => {
            appState.soloGameState.combat.selectedShipId = ship.id;
            renderCombatInfoPanel();
        });

        // Add drag-to-order functionality for player ships
        const isMyShip = (appState.isInitiator && ship.owner === 'player1') || (!appState.isInitiator && ship.owner === 'player2');
        if (isMyShip) {
            shipDiv.style.cursor = 'crosshair';
            shipDiv.addEventListener('mousedown', (e) => startDragOrder(e, ship));
        }

        // Add double-click to target for enemy ships
        if (!ship.isPlayer) {
            shipDiv.addEventListener('dblclick', () => {
                const selectedPlayerShip = appState.soloGameState.combat.ships.find(s => s.id === appState.soloGameState.combat.selectedShipId && s.isPlayer);
                if (selectedPlayerShip) {
                    setTargetForAllWeapons(selectedPlayerShip, ship.id);
                }
            });
        }
        combatMap.appendChild(shipDiv);
    });
}

function renderCombatInfoPanel() {
    const infoPanel = document.getElementById('info-panel');
        const gameState = appState.soloGameState;
    const selectedShip = gameState.combat.ships.find(s => s.id === gameState.combat.selectedShipId);

    if (!selectedShip) {
        infoPanel.innerHTML = '<h3>No Ship Selected</h3>';
        return;
    }

    // Determine if the current user can control this ship
    const isMyShip = (appState.isInitiator && selectedShip.owner === 'player1') || (!appState.isInitiator && selectedShip.owner === 'player2');
    const isHost = appState.isInitiator;

    infoPanel.innerHTML = `
        <h3>Tactical Combat</h3>
        <p>Turn: ${gameState.combat.turn}</p>
        <hr>
        <h4>Ship: ${selectedShip.name}</h4>
        <p>Speed: ${selectedShip.speed.toFixed(0)} | Heading: ${selectedShip.heading.toFixed(0)}&deg;</p>
        ${isMyShip ? `
        <div>
            <label for="speed-order">Set Speed:</label>
            <input type="number" id="speed-order" value="${selectedShip.orders.targetSpeed}" min="0" max="700">
        </div>
        <div>
            <label for="heading-order">Set Heading:</label>
            <input type="number" id="heading-order" value="${selectedShip.orders.targetHeading}" min="0" max="359">
        </div>
        <hr>
        <h4>Weapons</h4>
        ${selectedShip.weapons.map((w, i) => `
            <div class="weapon-control">
                <p class="weapon-name" data-weapon-index="${i}" style="cursor: crosshair;">${w.type}</p>
                <select id="weapon-target-${i}">
                    <option value="">-- Select Target --</option>
                    ${gameState.combat.ships.filter(t => t.id !== selectedShip.id).map(t => `<option value="${t.id}" ${w.targetId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
            </div>
        `).join('')}
        <button id="submit-orders-btn" class="theme-button">Submit Orders</button>
        ` : ''}
        <hr>
        <button id="end-turn-btn" class="theme-button" ${!isHost ? 'disabled' : ''}>End Turn</button>
        <button id="leave-combat-btn" class="theme-button">Leave Combat</button>
    `;
    document.getElementById('leave-combat-btn').onclick = endCombat;
    document.getElementById('end-turn-btn').onclick = executeTurn;

    if (isMyShip) {
        const submitBtn = document.getElementById('submit-orders-btn');
        if (isHost) {
            // The host doesn't need a submit button, their orders are read when they end the turn.
            submitBtn.style.display = 'none';
        } else {
            // The joiner uses this button to send all their orders to the host.
            submitBtn.onclick = () => {
                const movementOrders = {
                    targetSpeed: parseInt(document.getElementById('speed-order').value, 10),
                    targetHeading: parseInt(document.getElementById('heading-order').value, 10)
                };
                const weaponOrders = selectedShip.weapons.map((w, i) => ({
                    index: i,
                    targetId: document.getElementById(`weapon-target-${i}`).value
                }));

                const orderMessage = {
                    type: 'move',
                    game: 'cosmicbalance',
                    shipId: selectedShip.id,
                    orders: movementOrders,
                    weaponOrders: weaponOrders
                };

                if (dataChannels.length > 0) {
                    dataChannels[0].send(JSON.stringify(orderMessage));
                    showToast(`All orders sent for ${selectedShip.name}.`, 'info');
                }
            };
        }

        // Add drag-to-target functionality for weapons
        document.querySelectorAll('.weapon-name').forEach(weaponEl => {
            weaponEl.addEventListener('mousedown', (e) => {
                startDragTargeting(e, selectedShip, parseInt(weaponEl.dataset.weaponIndex, 10));
            });
        });
    }
}

function gatherHostOrders() {
    // This function is called for the host right before the turn executes.
    const combatState = appState.soloGameState.combat;
    const hostShips = combatState.ships.filter(s => s.owner === 'player1');

    hostShips.forEach(ship => {
        // This assumes the info panel is showing one of the host's ships.
        // A more complex UI would show all ship orders at once.
        if (ship.id === combatState.selectedShipId) {
            const newOrders = {
                targetSpeed: parseInt(document.getElementById('speed-order').value, 10),
                targetHeading: parseInt(document.getElementById('heading-order').value, 10)
            };
            ship.orders = newOrders;

            ship.weapons.forEach((weapon, i) => {
                weapon.targetId = document.getElementById(`weapon-target-${i}`).value;
            });
        }
    });
}

function executeTurn() {
    const combatState = appState.soloGameState.combat;

    if (appState.isInitiator) {
        // Host gathers its own orders from the UI just before execution.
        gatherHostOrders();
        // If solo, let the AI set its orders
        if (dataChannels.length === 0) {
            aiGenerateOrders();
        }
    }
    
    combatState.ships.forEach(ship => {
        // 1. Adjust heading based on orders
        const headingDiff = (ship.orders.targetHeading - ship.heading + 360) % 360;
        const turnRate = ship.acceleration * 10; // Simplified turn rate
        if (headingDiff !== 0) {
            const turnDirection = (headingDiff > 180) ? -1 : 1;
            const turnAmount = Math.min(turnRate, Math.abs(headingDiff <= 180 ? headingDiff : 360 - headingDiff));
            ship.heading = (ship.heading + turnAmount * turnDirection + 360) % 360;
        }

        // 2. Adjust speed based on orders
        const speedDiff = ship.orders.targetSpeed - ship.speed;
        if (speedDiff !== 0) {
            const accelAmount = Math.min(ship.acceleration, Math.abs(speedDiff));
            ship.speed += Math.sign(speedDiff) * accelAmount;
        }

        // 3. Update position based on new speed and heading (Newtonian motion)
        // Convert heading to radians for trigonometric functions
        const radians = (ship.heading - 90) * (Math.PI / 180);
        ship.x += ship.speed * Math.cos(radians) * 0.1; // Scaled for visibility
        ship.y += ship.speed * Math.sin(radians) * 0.1;

        // Boundary checks to keep ships on the map
        ship.x = Math.max(0, Math.min(MAP_WIDTH, ship.x));
        ship.y = Math.max(0, Math.min(MAP_HEIGHT, ship.y));

        // 4. Process weapon firing
        ship.weapons.forEach(weapon => {
            if (weapon.targetId) {
                const target = combatState.ships.find(s => s.id === weapon.targetId);
                if (target) {
                    const distance = Math.sqrt(Math.pow(target.x - ship.x, 2) + Math.pow(target.y - ship.y, 2));
                    // For now, we assume a hit if the target is in range. Arc checks will come later.
                    if (distance <= weapon.range) {
                        renderWeaponFire(ship, target);
                        showToast(`${ship.name} fires ${weapon.type} at ${target.name}!`, 'info');
                        // Render impact after a short delay to simulate travel time
                        setTimeout(() => renderImpact(target), 300);
                    } else {
                        showToast(`${ship.name} fires at ${target.name} but it's out of range!`, 'error');
                    }
                }
            }
        });
    });

    combatState.turn++;

    // If multiplayer, host broadcasts the new state
    if (appState.isInitiator && dataChannels.length > 0) {
        const turnUpdate = {
            type: 'move-update',
            game: 'cosmicbalance',
            combatState: combatState
        };
        dataChannels.forEach(channel => channel.send(JSON.stringify(turnUpdate)));
    }

    // Re-render the map and info panel with updated states
    renderCombatMap();
    renderCombatInfoPanel();
}

function startDragOrder(event, ship) {
    event.preventDefault();
    const combatMap = document.getElementById('combat-map-view');
    const mapRect = combatMap.getBoundingClientRect();

    // Create a visual line for feedback
    const orderLine = document.createElement('div');
    orderLine.className = 'order-line';
    combatMap.appendChild(orderLine);

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;

    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;

        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        orderLine.style.left = `${startX}px`;
        orderLine.style.top = `${startY}px`;
        orderLine.style.width = `${distance}px`;
        orderLine.style.transform = `rotate(${angle}deg)`;
    };

    const onMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        combatMap.removeChild(orderLine);

        const endX = upEvent.clientX - mapRect.left;
        const endY = upEvent.clientY - mapRect.top;

        const dx = endX - startX;
        const dy = endY - startY;

        // Calculate speed based on distance (with a scaling factor)
        const speed = Math.min(700, Math.round(Math.sqrt(dx * dx + dy * dy) * 2));

        // Calculate heading based on angle
        let heading = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
        if (heading < 0) heading += 360;

        // Update the UI input fields
        const speedInput = document.getElementById('speed-order');
        const headingInput = document.getElementById('heading-order');
        if (speedInput) speedInput.value = speed;
        if (headingInput) headingInput.value = heading;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function startDragTargeting(event, ship, weaponIndex) {
    event.preventDefault();
    const combatMap = document.getElementById('combat-map-view');
    const mapRect = combatMap.getBoundingClientRect();

    // Create a visual line for feedback
    const targetingLine = document.createElement('div');
    targetingLine.className = 'targeting-line';
    combatMap.appendChild(targetingLine);

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;

    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;

        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        targetingLine.style.left = `${startX}px`;
        targetingLine.style.top = `${startY}px`;
        targetingLine.style.width = `${distance}px`;
        targetingLine.style.transform = `rotate(${angle}deg)`;
    };

    const onMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        combatMap.removeChild(targetingLine);

        const targetElement = upEvent.target.closest('.ship');
        if (targetElement && targetElement.classList.contains('enemy')) {
            const targetId = targetElement.id.replace('ship-', '');
            const weapon = ship.weapons[weaponIndex];
            if (weapon) {
                weapon.targetId = targetId;

                // Update the UI to reflect the new target
                const targetSelect = document.getElementById(`weapon-target-${weaponIndex}`);
                if (targetSelect) {
                    targetSelect.value = targetId;
                }
                showToast(`${weapon.type} is now targeting ${appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name}.`, 'info');
            }
        } else {
            // If not dropped on an enemy, clear the target
            const weapon = ship.weapons[weaponIndex];
            weapon.targetId = '';
            const targetSelect = document.getElementById(`weapon-target-${weaponIndex}`);
            if (targetSelect) targetSelect.value = '';
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function setTargetForAllWeapons(ship, targetId) {
    if (!ship || !ship.weapons) return;

    ship.weapons.forEach(weapon => {
        weapon.targetId = targetId;
    });

    // Re-render the info panel to reflect the change in the UI
    renderCombatInfoPanel();
    showToast(`All weapons on ${ship.name} targeting ${appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name}.`, 'info');
}

function renderWeaponFire(source, target) {
    const combatMap = document.getElementById('combat-map-view');
    const ships = appState.soloGameState.combat.ships;

    // Calculate center of gravity and offset
    const totalX = ships.reduce((sum, ship) => sum + ship.x, 0);
    const totalY = ships.reduce((sum, ship) => sum + ship.y, 0);
    const centerX = totalX / ships.length;
    const centerY = totalY / ships.length;
    const offsetX = (MAP_WIDTH / 2) - centerX;
    const offsetY = (MAP_HEIGHT / 2) - centerY;

    const startX = source.x + offsetX;
    const startY = source.y + offsetY;
    const endX = target.x + offsetX;
    const endY = target.y + offsetY;

    const beam = document.createElement('div');
    beam.className = 'weapon-fire';
    beam.style.left = `${(startX / MAP_WIDTH) * 100}%`;
    beam.style.top = `${(startY / MAP_HEIGHT) * 100}%`;
    beam.style.width = `${Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2))}px`;
    beam.style.transform = `rotate(${Math.atan2(endY - startY, endX - startX) * 180 / Math.PI}deg)`;
    combatMap.appendChild(beam);
}

function renderImpact(target) {
    const combatMap = document.getElementById('combat-map-view');
    const ships = appState.soloGameState.combat.ships;

    // Calculate center of gravity and offset
    const totalX = ships.reduce((sum, ship) => sum + ship.x, 0);
    const totalY = ships.reduce((sum, ship) => sum + ship.y, 0);
    const centerX = totalX / ships.length;
    const centerY = totalY / ships.length;
    const offsetX = (MAP_WIDTH / 2) - centerX;
    const offsetY = (MAP_HEIGHT / 2) - centerY;

    const impactX = target.x + offsetX;
    const impactY = target.y + offsetY;

    const explosion = document.createElement('div');
    explosion.className = 'impact-explosion';
    explosion.style.left = `${(impactX / MAP_WIDTH) * 100}%`;
    explosion.style.top = `${(impactY / MAP_HEIGHT) * 100}%`;
    combatMap.appendChild(explosion);
    setTimeout(() => explosion.remove(), 400); // Remove after animation
}

function aiGenerateOrders() {
    const combatState = appState.soloGameState.combat;
    const playerShip = combatState.ships.find(s => s.isPlayer);
    const aiShips = combatState.ships.filter(s => !s.isPlayer);

    if (!playerShip) return;

    aiShips.forEach(aiShip => {
        const dx = playerShip.x - aiShip.x;
        const dy = playerShip.y - aiShip.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate the angle to the player ship
        let targetHeading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (targetHeading < 0) targetHeading += 360;

        aiShip.orders.targetHeading = Math.round(targetHeading);

        // Simple logic: close distance if far, maintain if close
        if (distance > 400) {
            aiShip.orders.targetSpeed = 100;
        } else {
            aiShip.orders.targetSpeed = 50;
        }

        // AI will always target the player ship
        aiShip.weapons.forEach(w => w.targetId = playerShip.id);
    });
}

export function processMove(moveData) {
    // Host-only function to process incoming orders from joiners
    if (!appState.isInitiator || moveData.game !== 'cosmicbalance') return;

    const ship = appState.soloGameState.combat.ships.find(s => s.id === moveData.shipId);
    if (ship) {
        if (moveData.orders) {
            ship.orders = moveData.orders;
            console.log(`Received move orders for ${ship.name} from joiner.`);
        }
        if (moveData.weaponOrders) {
            moveData.weaponOrders.forEach(order => {
                if (ship.weapons[order.index]) {
                    ship.weapons[order.index].targetId = order.targetId;
                }
            });
            console.log(`Received fire orders for ${ship.name} from joiner.`);
        }
    }
}

export function processUIUpdate(data) {
    // Joiner-only function to update state based on host's broadcast
    if (appState.isInitiator || data.game !== 'cosmicbalance') return;

    // Overwrite local combat state with the authoritative state from the host
    appState.soloGameState.combat = data.combatState;

    // Re-render UI
    renderCombatMap();
    renderCombatInfoPanel();
}