//==============================
//Game Manager
//==============================
// This module is responsible for loading and managing the currently active game.

import { dom, appState,
         dataChannels
} from './scripts.js';

import {
    broadcastCellSelection
} from './webrtc.js';

let activeGameModule = null;

/**
 * Dynamically loads and initializes a game module based on the game type.
 * @param {string} gameType - The type of game to load ('sudoku', 'connect4', etc.).
 */
export async function loadGame(gameType) {
    // If there's an active game module, run its cleanup function first.
    if (activeGameModule && typeof activeGameModule.cleanup === 'function') {
        activeGameModule.cleanup();
    }

    try {
        const module = await import(`./games/${gameType}.js`);
        activeGameModule = module;
        activeGameModule.initialize();
    } catch (error) {
        console.error(`Failed to load game module for: ${gameType}`, error);
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
    if (!activeGameModule) {
        // If no game is active, default to loading a new Sudoku puzzle for solo play.
        await loadGame('sudoku');
    }
    if (activeGameModule && typeof activeGameModule.loadPuzzle === 'function') {
        return activeGameModule.loadPuzzle(difficulty, puzzleData, resetTeams);
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
