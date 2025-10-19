//==============================
//Game Manager
//==============================
// This module is responsible for loading and managing the currently active game.

import { dom, appState,
         dataChannels
} from './scripts.js';
import { startTimer } from './timer.js';

import {
    broadcastCellSelection
} from './webrtc.js';

import { debugLog } from './misc.js';

let activeGameModule = null;

/**
 * Dynamically loads and initializes a game module based on the game type.
 * @param {string} gameType - The type of game to load ('sudoku', 'connect4', etc.).
 */
export async function loadGame(gameType) {
    // debugLog(`[GM] loadGame: Called for game type '${gameType}'.`);
    // If there's an active game module, run its cleanup function first.
    if (activeGameModule && typeof activeGameModule.cleanup === 'function') {
        // debugLog(`Cleaning up previous game module.`);
        activeGameModule.cleanup();
    }

    // Clear the main game board area before loading the new game
    dom.gameBoardArea.innerHTML = '';

    try {
        const module = await import(`./games/${gameType}.js`);

        // If this is a solo game, create its initial state now that the module is initialized.
        if (appState.isInitiator && !appState.playerTeam) {
            if (typeof module.getInitialState === 'function') {
                // debugLog(`[GM] loadGame: Found getInitialState for '${gameType}'. Calling it.`);
                appState.soloGameState = module.getInitialState();
                // debugLog(`[GM] loadGame: Received initial state from module:`, JSON.parse(JSON.stringify(appState.soloGameState)));
            } else {
                // debugLog(`[GM] loadGame: No getInitialState function found for '${gameType}'.`);
            }
        }

        activeGameModule = module;
        // debugLog(`[GM] loadGame: Module for '${gameType}' loaded. Calling initialize().`);
        activeGameModule.initialize();
        startTimer(); // Start the timer after the game UI is initialized.
    } catch (error) {
        console.error(`[GM] Failed to load game module for: ${gameType}`, error);
    }
}

//==============================
//Game UI and Logic
//==============================

/**
 * Creates and populates the 9x9 Sudoku grid in the DOM.
 * It clears any existing grid, then generates new cells with appropriate classes and event listeners.
 */
export function createGrid() {
    // This function is now a proxy to the active game's createGrid function.
    // debugLog(`createGrid called. Proxying to active module.`);
    if (activeGameModule && typeof activeGameModule.createGrid === 'function') {
        activeGameModule.createGrid();
    } else {
        // If no game is active, ensure the grid is empty.
        dom.sudokuGrid.innerHTML = '';
    }
}

/**
 * Loads a new puzzle onto the grid. Can be generated locally or received from a peer.
 * @param {string} difficulty - The difficulty level ('easy', 'medium', 'hard') for local generation.
 * @param {number[][]} [puzzleData] - Optional puzzle data received from a peer.
 * If provided, this puzzle is loaded instead of generating a new one.
 * @param {boolean} [resetTeams=false] - Optional flag to reset the team state.
 */
export async function loadPuzzle(difficulty, puzzleData, resetTeams = false) {
    // debugLog(`[GM] loadPuzzle called. Proxying to active module.`);
    if (activeGameModule && typeof activeGameModule.loadPuzzle === 'function') {
        // The game-specific loadPuzzle function will handle its own arguments.
        // We don't need to pass anything from here.
        activeGameModule.loadPuzzle();
    }
}

/**
 * Updates the DOM to reflect the puzzle state of the player's current team.
 * @param {string} teamName - The name of the team whose puzzle should be rendered.
 */
export async function updateGridForTeam(teamName) {
    if (activeGameModule && typeof activeGameModule.updateGridForTeam === 'function') {
        activeGameModule.updateGridForTeam(teamName);
    }
}

/**
 * Checks the current state of the grid, validates it, and determines if the puzzle is solved.
 * If solved, it stops the timer and displays a congratulations message.
 */
export function checkGridState() {
    if (activeGameModule && typeof activeGameModule.checkGridState === 'function') {
        activeGameModule.checkGridState();
    }
}

/**
 * Forwards move processing to the active game module.
 */
export function processMove(moveData) {
    if (activeGameModule && typeof activeGameModule.processMove === 'function') {
        activeGameModule.processMove(moveData);
    }
}
