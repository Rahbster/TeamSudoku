//==============================
// Cosmic Balance Game Logic
//==============================
import { dom, appState } from '../scripts.js';
import { createTimerHTML } from '../ui.js';
import { startTimer, stopTimer } from '../timer.js';
import { loadDesignsFromStorage, showShipDesigner } from './cb_ship_designer.js';
import { startCombat } from './cb_tactical_combat.js';

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 1000;
const NUM_SYSTEMS = 50;
const MIN_STAR_DISTANCE = 80;

export function initialize() {
    // Set the button text and ensure it's visible for the host
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Game';
    dom.newPuzzleButton.style.display = '';

    loadPuzzle();
}

export function cleanup() {
    stopTimer();
}

export function createGrid() {
    dom.gameBoardArea.innerHTML = `
        <section id="cosmic-balance-area">
            <div id="info-panel">
                ${createTimerHTML()}
                <div id="info-panel-content"></div>
            </div>
            <div id="starmap-view">
                <!-- The star map will be rendered here by JS -->
            </div>
            <div id="combat-scale-bar"></div>
            <div id="ship-designer-view" class="hidden">
                <!-- The ship designer interface will be rendered here -->
            </div>
            <div id="combat-map-view" class="hidden">
                <!-- The tactical combat map will be rendered here -->
            </div>
        </section>
    `;
    const starmapView = document.getElementById('starmap-view');
    const infoPanel = document.getElementById('info-panel');
    const shipDesignerView = document.getElementById('ship-designer-view');
    const infoPanelContent = document.getElementById('info-panel-content');
    starmapView.innerHTML = '';
    infoPanelContent.innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';

    starmapView.addEventListener('click', (event) => {
        if (event.target === starmapView) {
            infoPanelContent.innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
            const currentActive = starmapView.querySelector('.active-star');
            if (currentActive) {
                currentActive.classList.remove('active-star');
            }
        }
    });

    const designerButton = document.createElement('button');
    designerButton.textContent = 'Ship Designer';
    designerButton.id = 'ship-designer-btn-main'; // Give it an ID to be toggled
    designerButton.className = 'theme-button';
    designerButton.onclick = showShipDesigner;
    infoPanel.appendChild(designerButton);

    const gameState = appState.soloGameState;

    gameState.systems.forEach(system => {
        const starDiv = document.createElement('div');
        starDiv.className = 'star-system';
        starDiv.style.left = `${(system.x / MAP_WIDTH) * 100}%`;
        starDiv.style.top = `${(system.y / MAP_HEIGHT) * 100}%`;
        starDiv.style.setProperty('--star-color', system.color);
        starDiv.title = system.name;

        starDiv.addEventListener('click', () => {
            const currentActive = starmapView.querySelector('.active-star');
            if (currentActive) {
                currentActive.classList.remove('active-star');
            }
            starDiv.classList.add('active-star');
            renderInfoPanelForStarmap(system);
        });

        starDiv.addEventListener('dblclick', () => {
            startCombat(system);
        });

        starmapView.appendChild(starDiv);
    });
}

function renderInfoPanelForStarmap(system) {
    document.getElementById('info-panel-content').innerHTML = `
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

        systems.push({ id: i, name: `System ${i + 1}`, x, y, owner: null, color: '#FFFFFF' });
    }

    return {
        turn: 1,
        systems: systems,
        fleets: [],  // Array of player fleets
        combat: {
            active: false,
            ships: [],
            projectiles: [], // To track missiles, etc.
            turn: 0,
            nextProjectileId: 0,
            effects: [] // For visual effects like explosions and beams
        },
        shipDesigns: loadDesignsFromStorage(), // Load custom designs
        currentDesign: null // To hold the ship being actively designed
    };
}

export function loadPuzzle() {
    appState.soloGameState = getInitialState();
    createGrid();
}