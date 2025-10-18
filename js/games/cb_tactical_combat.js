import { dom, appState, dataChannels } from '../scripts.js';
import { showToast } from '../ui.js';
import { COMPONENTS, DEFAULT_SHIP_DESIGNS, MAP_WIDTH, MAP_HEIGHT } from './cb_constants.js';

let currentZoom = 1.0; // Start with a default zoom level

export function startCombat(system) {
    const gameState = appState.soloGameState;
    gameState.combat.active = true;

    const playerXBase = 200;
    const playerYBase = 500;
    const enemyXBase = 800;
    const enemyYBase = 500;
    const positionVariance = 50;

    const playerHeading = Math.random() * 45;
    const enemyHeading = 180 - (Math.random() * 45);

    gameState.combat.ships = [];

    gameState.combat.ships.push({ id: 'player-1', ...createShipFromDesign(DEFAULT_SHIP_DESIGNS[0], 'player1', true), aiAssisted: false, acceleration: 4, x: playerXBase + (Math.random() * positionVariance * 2) - positionVariance, y: playerYBase - 50 + (Math.random() * positionVariance) - (positionVariance/2), heading: playerHeading, speed: 0, orders: { targetSpeed: 0, targetHeading: playerHeading }, hp: 16, maxHp: 16, power: 32, maxPower: 32, destroyed: false });
    gameState.combat.ships.push({ id: 'player-2', ...createShipFromDesign(DEFAULT_SHIP_DESIGNS[1], 'player1', true), aiAssisted: false, acceleration: 4, x: playerXBase + (Math.random() * positionVariance * 2) - positionVariance, y: playerYBase + 50 + (Math.random() * positionVariance) - (positionVariance/2), heading: playerHeading, speed: 0, orders: { targetSpeed: 0, targetHeading: playerHeading }, hp: 16, maxHp: 16, power: 32, maxPower: 32, destroyed: false });

    const aiCount = parseInt(dom.cbAiPlayerCountSelect.value, 10) || 1;
    const difficulty = dom.difficultySelector.value;

    for (let i = 0; i < aiCount; i++) {
        const aiPlayerId = `AI-${i + 1}`;
        const shipDesignTemplate = DEFAULT_SHIP_DESIGNS[i % DEFAULT_SHIP_DESIGNS.length];
        
        let powerBonus = 0;
        if (difficulty === 'medium') powerBonus = 1;
        if (difficulty === 'hard') powerBonus = 3;

        const totalPower = (shipDesignTemplate.components.find(c => c.category === 'engines')?.count || 0) * (8 + powerBonus);

        gameState.combat.ships.push({
            id: `enemy-${i + 1}`,
            ...createShipFromDesign(shipDesignTemplate, aiPlayerId, false),
            aiAssisted: true, // Full AI control for enemy ships
            acceleration: 4, // Add the missing acceleration property
            name: `AI Ship ${i + 1}`,
            x: enemyXBase + (Math.random() * positionVariance * 2) - positionVariance,
            y: enemyYBase + (i * 100) - ((aiCount - 1) * 50),
            heading: enemyHeading,
            speed: 0,
            orders: { targetSpeed: 50, targetHeading: enemyHeading },
            hp: 16, maxHp: 16,
            power: totalPower, maxPower: totalPower,
            destroyed: false
        });
    }

    gameState.combat.turn = 1;

    if (!gameState.combat.selectedShipId) {
        const playerShip = gameState.combat.ships.find(s => s.isPlayer);
        if (playerShip) {
            gameState.combat.selectedShipId = playerShip.id;
        }
    }

    document.getElementById('starmap-view').classList.add('hidden');
    document.getElementById('ship-designer-view').classList.add('hidden');
    document.getElementById('combat-map-view').classList.remove('hidden');

    // Hide the main ship designer button during combat
    document.getElementById('ship-designer-btn-main').classList.add('hidden');

    renderCombatMap();
    renderCombatInfoPanel();
}

function createShipFromDesign(design, owner, isPlayerFlag) {
    const ship = { ...design };
    ship.weapons = [];
    ship.components.forEach(comp => {
        if (comp.category === 'weapons') {
            const weaponTemplate = COMPONENTS.weapons.find(w => w.id === comp.id);
            for (let i = 0; i < comp.count; i++) {
                ship.weapons.push({ ...weaponTemplate, cooldownRemaining: 0, targetId: null, arcs: comp.arcs });
            }
        }
    });
    ship.owner = owner;
    ship.isPlayer = isPlayerFlag;
    return ship;
}

export function endCombat() {
    document.getElementById('combat-map-view').classList.add('hidden');
    document.getElementById('ship-designer-view').classList.add('hidden');
    document.getElementById('starmap-view').classList.remove('hidden');
    // Restore the main ship designer button after combat
    document.getElementById('ship-designer-btn-main').classList.remove('hidden');

    document.getElementById('info-panel-content').innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
}

function runGameLoop() {
    executeTurn();
    requestAnimationFrame(renderCombatMap);
}

function createShieldOctagon(shields) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute('class', 'ship-shield-octagon');
    svg.setAttribute('viewBox', '0 0 100 100');

    const points = [
        "50,0 65,15 35,15", "65,15 85,35 70.7,29.3", "85,35 100,50 85,65",
        "85,65 70.7,70.7 65,85", "65,85 50,100 35,85", "35,85 29.3,70.7 15,65",
        "15,65 0,50 15,35", "15,35 29.3,29.3 35,15"
    ];

    shields.forEach((strength, i) => {
        const polygon = document.createElementNS(svgNS, 'polygon');
        polygon.setAttribute('points', points[i]);
        polygon.setAttribute('fill-opacity', strength / 10);
        svg.appendChild(polygon);
    });

    return svg;
}

function renderCombatMap() {
    const combatMap = document.getElementById('combat-map-view');
    const scaleBar = document.getElementById('combat-scale-bar');
    combatMap.innerHTML = '';

    const ships = appState.soloGameState.combat.ships.filter(s => !s.destroyed);
    const projectiles = appState.soloGameState.combat.projectiles;
    const effects = appState.soloGameState.combat.effects;
    if (ships.length === 0) return;

    // --- Auto-Zoom Logic ---
    // Find the bounding box of all ships
    const minX = Math.min(...ships.map(s => s.x));
    const maxX = Math.max(...ships.map(s => s.x));
    const minY = Math.min(...ships.map(s => s.y));
    const maxY = Math.max(...ships.map(s => s.y));

    const fleetWidth = maxX - minX;
    const fleetHeight = maxY - minY;

    // Determine the appropriate zoom level. The goal is to fit the max distance within ~80% of the view.
    const zoomX = (MAP_WIDTH * 0.9) / (fleetWidth || MAP_WIDTH); // Use 90% of view for a tighter fit
    const zoomY = (MAP_HEIGHT * 0.9) / (fleetHeight || MAP_HEIGHT);
    const targetZoom = Math.min(zoomX, zoomY);

    // Snap to discrete zoom levels (e.g., 0.5, 1, 2, 4)
    const zoomLevels = [0.25, 0.5, 1, 2, 4, 8]; // Added more zoom levels
    currentZoom = zoomLevels.reduce((prev, curr) => {
        return (Math.abs(curr - targetZoom) < Math.abs(prev - targetZoom) ? curr : prev);
    });


    // Calculate a weighted center of gravity based on ship mass
    const { totalX, totalY, totalMass } = ships.reduce((acc, ship) => {
        const mass = ship.mass || 1; // Default to 1 if mass is not defined
        acc.totalX += ship.x * mass;
        acc.totalY += ship.y * mass;
        acc.totalMass += mass;
        return acc;
    }, { totalX: 0, totalY: 0, totalMass: 0 });
    const centerX = totalX / totalMass;
    const centerY = totalY / totalMass;

    const viewCenterX = MAP_WIDTH / 2;
    const viewCenterY = MAP_HEIGHT / 2;
    const offsetX = viewCenterX - centerX;
    const offsetY = viewCenterY - centerY;

    ships.forEach(ship => {
        const shipDiv = document.createElement('div');
        shipDiv.className = 'ship';
        shipDiv.id = `ship-${ship.id}`;
        if (!ship.isPlayer) shipDiv.classList.add('enemy');

        const shipVisual = document.createElement('div');
        shipVisual.className = 'ship-visual';
        const shieldOctagon = createShieldOctagon(ship.shields);
        const statusBarContainer = document.createElement('div');
        statusBarContainer.className = 'ship-status-bars';
        const hullPercentage = (ship.hp / ship.maxHp) * 100;
        const hullBar = document.createElement('div');
        hullBar.className = 'status-bar-container';
        hullBar.innerHTML = `<div class="status-bar" style="width: ${hullPercentage}%; background-color: #4CAF50;"></div>`;
        statusBarContainer.appendChild(hullBar);
        
        const displayX = ship.x + offsetX;
        const displayY = ship.y + offsetY;

        shipDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        shipDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        shipDiv.style.transform = `rotate(${ship.heading}deg)`;

        shipDiv.appendChild(shieldOctagon);
        shipDiv.appendChild(shipVisual);
        shipDiv.appendChild(statusBarContainer);

        if (ship.isPlayer) {
            const weaponArc = 120;
            const startAngle = -weaponArc / 2;
            ship.weapons.forEach((weapon, index) => {
                const weaponSelector = document.createElement('div');
                weaponSelector.className = 'weapon-selector';
                weaponSelector.style.backgroundColor = weapon.color;
                const angle = startAngle + (weaponArc / (ship.weapons.length -1 || 1)) * index;
                weaponSelector.style.transform = `rotate(${angle}deg) translate(25px) rotate(${-angle}deg)`;
                weaponSelector.addEventListener('mousedown', (e) => startDragTargeting(e, ship, index));
                shipDiv.appendChild(weaponSelector);
            });
        }
        shipDiv.addEventListener('click', () => {
            appState.soloGameState.combat.selectedShipId = ship.id;
            renderCombatInfoPanel();
        });

        const isMyShip = (appState.isInitiator && ship.owner === 'player1') || (!appState.isInitiator && ship.owner === 'player2');
        if (isMyShip) {
            shipDiv.style.cursor = 'crosshair';
            shipDiv.addEventListener('mousedown', (e) => startDragOrder(e, ship));
        }

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

    projectiles.forEach(proj => {
        const projDiv = document.createElement('div');
        projDiv.className = 'projectile missile';
        const displayX = proj.x + offsetX;
        const displayY = proj.y + offsetY;
        projDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        projDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        projDiv.style.transform = `rotate(${proj.heading}deg)`;
        combatMap.appendChild(projDiv);
    });

    effects.forEach(effect => {
        if (effect.type === 'beam') {
            const source = ships.find(s => s.id === effect.sourceId);
            const target = ships.find(s => s.id === effect.targetId);
            if (source && target) {
                const startX = source.x + offsetX;
                const startY = source.y + offsetY;
                const endX = target.x + offsetX;
                const endY = target.y + offsetY;
                const beam = document.createElement('div'); //NOSONAR
                beam.className = 'weapon-fire';
                beam.style.background = `linear-gradient(90deg, rgba(255,0,0,0) 0%, ${effect.weapon.color} 50%, rgba(255,0,0,0) 100%)`;
                beam.style.boxShadow = `0 0 8px ${effect.weapon.color}`;
                beam.style.left = `${(viewCenterX + (startX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
                beam.style.top = `${(viewCenterY + (startY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
                const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) * currentZoom;
                beam.style.width = `${distance}px`;
                beam.style.transform = `rotate(${Math.atan2(endY - startY, endX - startX) * 180 / Math.PI}deg)`;
                combatMap.appendChild(beam);
                setTimeout(() => beam.remove(), 300);
            }
        } else if (effect.type === 'impact') {
            const target = ships.find(s => s.id === effect.targetId);
            if (target) {
                const impactX = target.x + offsetX;
                const impactY = target.y + offsetY;
                const explosion = document.createElement('div');
                explosion.className = 'impact-explosion';
                explosion.style.left = `${(viewCenterX + (impactX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
                explosion.style.top = `${(viewCenterY + (impactY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
                combatMap.appendChild(explosion);
                setTimeout(() => explosion.remove(), 400);
            }
        }
    });

    appState.soloGameState.combat.effects = [];

    // --- Render Scale Bar ---
    scaleBar.innerHTML = '';
    const scaleWidth = scaleBar.offsetWidth;
    const mapUnitsPerPixel = (MAP_WIDTH / currentZoom) / scaleWidth;

    // Create a tick mark for every 100 map units
    const tickIntervalMapUnits = 100;
    const tickIntervalPixels = tickIntervalMapUnits / mapUnitsPerPixel;

    for (let i = 0; i * tickIntervalPixels < scaleWidth; i++) {
        const tick = document.createElement('div');
        tick.className = 'scale-tick';
        tick.style.left = `${i * tickIntervalPixels}px`;
        if (i > 0) {
            tick.dataset.label = `${i * tickIntervalMapUnits}`;
        }
        scaleBar.appendChild(tick);
    }
}

function renderCombatInfoPanel() {
    const infoPanelContent = document.getElementById('info-panel-content');
    const gameState = appState.soloGameState;
    const selectedShip = gameState.combat.ships.find(s => s.id === gameState.combat.selectedShipId);

    if (!selectedShip) {
        infoPanelContent.innerHTML = '<h3>No Ship Selected</h3>';
        return;
    }

    if (selectedShip.destroyed) {
        infoPanelContent.innerHTML = `<h3>Ship Destroyed</h3><p>${selectedShip.name} has been destroyed.</p>`;
        return;
    }

    const isMyShip = (appState.isInitiator && selectedShip.owner === 'player1') || (!appState.isInitiator && selectedShip.owner === 'player2');
    const isHost = appState.isInitiator;

    infoPanelContent.innerHTML = `
        <h3>Tactical Combat</h3>
        <p>Turn: ${gameState.combat.turn}</p>
        <hr>
        <div class="ai-assist-toggle" style="${!isMyShip ? 'display:none;' : ''}">
            <label for="ai-assist-checkbox">AI Assistant:</label>
            <input type="checkbox" id="ai-assist-checkbox" ${selectedShip.aiAssisted ? 'checked' : ''}>
        </div>
        <h4>Ship: ${selectedShip.name}</h4>
        <p>Hull: ${selectedShip.hp} / ${selectedShip.maxHp}</p>
        <p>Speed: ${selectedShip.speed.toFixed(0)} | Heading: ${selectedShip.heading.toFixed(0)}&deg;</p>
        <div class="shields-display">
            ${selectedShip.shields.map((s, i) => `<div class="shield-arc" title="Shield ${i+1}">${s}</div>`).join('')}
        </div>
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
                <p class="weapon-name" data-weapon-index="${i}" style="cursor: crosshair; color: ${w.color}; text-shadow: 0 0 5px ${w.color};">
                    ${w.name} ${w.cooldownRemaining > 0 ? `(Reloading: ${w.cooldownRemaining})` : '(Ready)'}
                </p>
                <select id="weapon-target-${i}">
                    <option value="">-- Select Target --</option>
                    ${gameState.combat.ships.filter(t => t.owner !== selectedShip.owner && !t.destroyed).map(t => `<option value="${t.id}" ${w.targetId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
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
    document.getElementById('end-turn-btn').onclick = runGameLoop;

    const aiAssistCheckbox = document.getElementById('ai-assist-checkbox');
    if (aiAssistCheckbox) {
        aiAssistCheckbox.onchange = (e) => {
            selectedShip.aiAssisted = e.target.checked;
            showToast(`AI Assistant for ${selectedShip.name} is now ${e.target.checked ? 'ON' : 'OFF'}.`, 'info');
            if (e.target.checked) aiGenerateOrders(); // Immediately generate orders if enabled
        };
    }

    if (isMyShip) {
        const submitBtn = document.getElementById('submit-orders-btn');
        if (isHost) {
            submitBtn.style.display = 'none';
        } else {
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
                    type: 'move', game: 'cosmicbalance', shipId: selectedShip.id,
                    orders: movementOrders, weaponOrders: weaponOrders
                };
                if (dataChannels.length > 0) {
                    dataChannels[0].send(JSON.stringify(orderMessage));
                    showToast(`All orders sent for ${selectedShip.name}.`, 'info');
                }
            };
        }
    }
}

function gatherHostOrders() {
    const combatState = appState.soloGameState.combat;
    const hostShips = combatState.ships.filter(s => s.owner === 'player1');

    hostShips.forEach(ship => {
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
        gatherHostOrders();
        if (dataChannels.length === 0) {
            aiGenerateOrders();
        }
    }
    
    combatState.ships.filter(s => !s.destroyed).forEach(ship => {
        // --- Power Regeneration Phase ---
        ship.power = Math.min(ship.maxPower, ship.power + ship.maxPower); // Regenerate power from all engines

        const headingDiff = (ship.orders.targetHeading - ship.heading + 360) % 360;
        const turnRate = ship.acceleration * 10;
        if (headingDiff !== 0) {
            const turnDirection = (headingDiff > 180) ? -1 : 1;
            const turnAmount = Math.min(turnRate, Math.abs(headingDiff <= 180 ? headingDiff : 360 - headingDiff));
            ship.heading = (ship.heading + turnAmount * turnDirection + 360) % 360;
        }

        const speedDiff = ship.orders.targetSpeed - ship.speed;
        if (speedDiff !== 0) {
            const accelAmount = Math.min(ship.acceleration, Math.abs(speedDiff));
            ship.speed += Math.sign(speedDiff) * accelAmount;
        }

        const radians = (ship.heading - 90) * (Math.PI / 180);
        ship.x += ship.speed * Math.cos(radians) * 0.1;
        ship.y += ship.speed * Math.sin(radians) * 0.1;

        ship.x = Math.max(0, Math.min(MAP_WIDTH, ship.x));
        ship.y = Math.max(0, Math.min(MAP_HEIGHT, ship.y));

        ship.weapons.forEach(weapon => {
            if (weapon.cooldownRemaining > 0) weapon.cooldownRemaining--;

            if (weapon.targetId && weapon.cooldownRemaining === 0 && ship.power >= weapon.powerCost) {
                const target = combatState.ships.find(s => s.id === weapon.targetId);
                if (target) {
                    const distance = Math.sqrt(Math.pow(target.x - ship.x, 2) + Math.pow(target.y - ship.y, 2));
                    if (distance <= weapon.range) {
                        weapon.cooldownRemaining = weapon.cooldown;
                        ship.power -= weapon.powerCost;
                        if (weapon.type === 'beam') {
                            combatState.effects.push({ type: 'beam', sourceId: ship.id, targetId: target.id, weapon: weapon });
                            applyDamage(ship, target, weapon);
                        } else if (weapon.type === 'projectile') {
                            combatState.projectiles.push({
                                id: `proj-${combatState.nextProjectileId++}`, ownerId: ship.id, targetId: target.id,
                                x: ship.x, y: ship.y, heading: ship.heading, speed: weapon.speed,
                                damage: weapon.damage, weapon: weapon,
                            });
                            showToast(`${ship.name} launches a missile at ${target.name}!`, 'info');
                        }
                    }
                }
            } else if (weapon.targetId && ship.power < weapon.powerCost) {
                if (ship.isPlayer) showToast(`${ship.name}: Insufficient power to fire ${weapon.name}!`, 'error');
            }
        });
    });

    combatState.turn++;

    const newProjectiles = [];
    combatState.projectiles.forEach(proj => {
        const target = combatState.ships.find(s => s.id === proj.targetId);
        if (!target || target.destroyed) return;

        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
        proj.heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

        if (distanceToTarget <= proj.speed) {
            applyDamage(combatState.ships.find(s => s.id === proj.ownerId), target, proj.weapon);
        } else {
            const radians = (proj.heading - 90) * (Math.PI / 180);
            proj.x += proj.speed * Math.cos(radians);
            proj.y += proj.speed * Math.sin(radians);
            newProjectiles.push(proj);
        }
    });
    combatState.projectiles = newProjectiles;

    const remainingPlayerShips = combatState.ships.filter(s => s.isPlayer && !s.destroyed).length;
    const remainingEnemyShips = combatState.ships.filter(s => !s.isPlayer && !s.destroyed).length;

    if (remainingPlayerShips === 0) showToast('All player ships have been destroyed! You lose.', 'error');
    if (remainingEnemyShips === 0) showToast('All enemy ships have been destroyed! You win!', 'info');

    if (appState.isInitiator && dataChannels.length > 0) {
        const turnUpdate = { type: 'move-update', game: 'cosmicbalance', combatState: combatState };
        dataChannels.forEach(channel => channel.send(JSON.stringify(turnUpdate)));
    }

    renderCombatInfoPanel();
}

function applyDamage(attacker, target, weapon) {
    if (target.destroyed) return;

    appState.soloGameState.combat.effects.push({ type: 'impact', targetId: target.id });
    const dx = attacker.x - target.x;
    const dy = attacker.y - target.y;
    
    let attackAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    let relativeAngle = (attackAngle - target.heading + 360 + 90) % 360;
    const shieldIndex = Math.round(relativeAngle / 45) % 8;

    let damage = weapon.damage;
    const shieldValue = target.shields[shieldIndex];
    if (shieldValue > 0) {
        const damageAbsorbed = Math.min(shieldValue, damage);
        target.shields[shieldIndex] -= damageAbsorbed;
        damage -= damageAbsorbed;
        showToast(`Shield arc ${shieldIndex + 1} on ${target.name} absorbed ${damageAbsorbed} damage!`, 'info');
    }

    if (damage > 0) {
        target.hp -= damage;
        showToast(`${target.name} hull hit for ${damage} damage!`, 'error');
    }

    if (target.hp <= 0) {
        target.destroyed = true;
        showToast(`${target.name} has been destroyed!`, 'error');
    }
}

function startDragOrder(event, ship) {
    event.preventDefault();
    const combatMap = document.getElementById('combat-map-view');
    const mapRect = combatMap.getBoundingClientRect();

    const orderLine = document.createElement('div');
    orderLine.className = 'order-line';
    combatMap.appendChild(orderLine);

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;

    const MAX_ORDER_SPEED = 700;
    const ORDER_DISTANCE_SCALE = 2;
    const MAX_ORDER_DISTANCE = MAX_ORDER_SPEED / ORDER_DISTANCE_SCALE;

    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_ORDER_DISTANCE);
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

        const speed = Math.min(MAX_ORDER_SPEED, Math.round(Math.sqrt(dx * dx + dy * dy) * ORDER_DISTANCE_SCALE));
        let heading = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
        if (heading < 0) heading += 360;

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

    const targetingLine = document.createElement('div');
    targetingLine.className = 'targeting-line';
    combatMap.appendChild(targetingLine);
    
    const weapon = ship.weapons[weaponIndex];
    targetingLine.style.backgroundColor = weapon.color || '#CC3333';
    targetingLine.style.boxShadow = `0 0 5px ${weapon.color || '#CC3333'}`;

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;
    
    const maxRangeInPixels = (weapon.range / MAP_WIDTH) * mapRect.width;
    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxRangeInPixels);
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
                const targetSelect = document.getElementById(`weapon-target-${weaponIndex}`);
                if (targetSelect) targetSelect.value = targetId;
                showToast(`${weapon.type} is now targeting ${appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name}.`, 'info');
            }
        } else {
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

    renderCombatInfoPanel();
    const targetName = appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name || 'Unknown';
    showToast(`All weapons on ${ship.name} targeting ${targetName}.`, 'info');
}

function aiGenerateOrders() {
    const combatState = appState.soloGameState.combat;
    const allShips = combatState.ships.filter(s => !s.destroyed);    
    const shipsToControl = allShips.filter(s => s.aiAssisted);
    
    shipsToControl.forEach(aiShip => {
        // Determine this ship's enemies
        const enemies = allShips.filter(s => s.owner !== aiShip.owner);
        if (enemies.length === 0) return;

        // --- Target Selection Logic ---
        // 1. Does any weapon already have a valid target? If so, that's our primary target.
        let primaryTarget = null;
        const existingTargetId = aiShip.weapons.find(w => w.targetId && enemies.some(e => e.id === w.targetId))?.targetId;
        if (existingTargetId) {
            primaryTarget = enemies.find(e => e.id === existingTargetId);
        }

        // 2. If no valid target is set, find the closest enemy.
        if (!primaryTarget) {
            let closestEnemy = null;
            let minDistance = Infinity;
            enemies.forEach(potentialTarget => {
                const d = Math.sqrt(Math.pow(potentialTarget.x - aiShip.x, 2) + Math.pow(potentialTarget.y - aiShip.y, 2));
                if (d < minDistance) {
                    minDistance = d;
                    closestEnemy = potentialTarget;
                }
            });
            primaryTarget = closestEnemy;
        }

        if (primaryTarget) {
            // --- Set Orders based on the primary target ---
            const dx = primaryTarget.x - aiShip.x;
            const dy = primaryTarget.y - aiShip.y;
            const distance = Math.sqrt(dx*dx + dy*dy);

            // 1. Set heading towards the enemy
            let targetHeading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (targetHeading < 0) targetHeading += 360;
            aiShip.orders.targetHeading = Math.round(targetHeading);

            // 2. Set speed: close distance if far, maintain if close
            aiShip.orders.targetSpeed = (distance > 400) ? 100 : 50;

            // 3. Target all weapons on that enemy
            aiShip.weapons.forEach(w => w.targetId = primaryTarget.id);
        }
    });

    // If the currently selected ship was AI assisted, we need to re-render the info panel
    // to show the orders the AI just set.
    const selectedShip = combatState.ships.find(s => s.id === combatState.selectedShipId);
    if (selectedShip && selectedShip.aiAssisted) {
        renderCombatInfoPanel();
    }
}

export function processMove(moveData) {
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
    if (appState.isInitiator || data.game !== 'cosmicbalance') return;

    appState.soloGameState.combat = data.combatState;

    renderCombatMap();
    renderCombatInfoPanel();
}