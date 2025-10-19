//==============================
// Crossword Game Logic
//==============================

import { dom, appState } from '../scripts.js';
import { showWinnerScreen, createTimerHTML, showToast, showConfirmationModal } from '../ui.js';

// Key for storing custom puzzles in localStorage
const SAVED_PUZZLES_KEY = 'crosswordCustomPuzzles';

// A simple, hardcoded puzzle for the initial implementation
let puzzleData = null; // Will be generated

const defaultWordsAndClues = [
    { word: "APPLE", clue: "A common fruit" },
    { word: "AERO", clue: "A flying vehicle" },
    { word: "SEED", clue: "What a plant grows from" },
    { word: "AREA", clue: "A region or space" },
    { word: "PANE", clue: "A flat sheet of glass" },
    { word: "ELOPE", clue: "To permit or authorize" }
];

function generateDefaultPuzzle() {
    const savedPuzzles = getSavedPuzzles();
    if (savedPuzzles.length > 0) {
        // If custom puzzles exist, pick one at random
        const randomPuzzle = savedPuzzles[Math.floor(Math.random() * savedPuzzles.length)];
        puzzleData = generateCrossword(randomPuzzle.wordsAndClues);
    } else {
        // Fallback to the original default puzzle
        puzzleData = generateCrossword(defaultWordsAndClues);
    }
}

export function initialize() {
    document.body.classList.add('crossword-active');
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Puzzle';
    dom.newPuzzleButton.style.display = '';
    loadPuzzle();
}

export function cleanup() {
    document.body.classList.remove('crossword-active');
    document.removeEventListener('keydown', handleKeyPress);
}

export function createGrid() {
    dom.gameBoardArea.innerHTML = `
        <div id="crossword-layout-container">
            <div id="crossword-main-content">
                <div id="crossword-grid-wrapper">
                    <div id="crossword-grid"></div>
                </div>
                <div id="crossword-clues-container">
                    <div class="clues-list">
                        <h4>Across</h4>
                        <ul id="across-clues"></ul>
                    </div>
                    <div class="clues-list">
                        <h4>Down</h4>
                        <ul id="down-clues"></ul>
                    </div>
                </div>
            </div>
            ${createTimerHTML()}
            <button id="debug-copy-state-btn" class="theme-button" style="position: absolute; bottom: 10px; right: 10px; z-index: 100; display: none;">DEBUG: Copy State</button>
            <div id="crossword-keyboard"></div>
        </div>
    `;

    if (!puzzleData) generateDefaultPuzzle();

    const grid = document.getElementById('crossword-grid');
    grid.style.gridTemplateColumns = `repeat(${puzzleData.size}, 1fr)`;

    for (let r = 0; r < puzzleData.size; r++) {
        for (let c = 0; c < puzzleData.size; c++) {
            const cell = document.createElement('div');
            cell.className = 'crossword-cell';
            if (puzzleData.grid[r][c] === null) {
                cell.classList.add('black');
            } else {
                cell.id = `cell-${r}-${c}`;
                cell.innerHTML = `<div class="cell-number"></div><div class="cell-content"></div>`;
                cell.addEventListener('click', () => handleCellClick(r, c, true));
            }
            grid.appendChild(cell);
        }
    }

    // --- Create On-Screen Keyboard ---
    const keyboard = document.getElementById('crossword-keyboard');
    const keys = [
        "QWERTYUIOP",
        "ASDFGHJKL",
        "ZXCVBNM"
    ];

    keys.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';
        for (const key of row) {
            const keyBtn = document.createElement('button');
            keyBtn.className = 'key';
            keyBtn.textContent = key;
            keyBtn.dataset.key = key;
            rowDiv.appendChild(keyBtn);
        }
        keyboard.appendChild(rowDiv);
    });

    const bottomRow = document.createElement('div');
    bottomRow.className = 'keyboard-row';
    const backspaceBtn = document.createElement('button');
    backspaceBtn.className = 'key wide';
    backspaceBtn.innerHTML = '&#9003;'; // Backspace symbol
    backspaceBtn.dataset.key = 'Backspace';
    bottomRow.appendChild(backspaceBtn);
    keyboard.appendChild(bottomRow);

    // Add event listeners
    keyboard.addEventListener('click', (event) => {
        if (event.target.matches('[data-key]')) {
            processInput(event.target.dataset.key);
        }
    });
    document.addEventListener('keydown', handleKeyPress);

    document.getElementById('debug-copy-state-btn').onclick = copyDebugStateToClipboard;

    renderClues();
}

export function showPuzzleCreator() {
    if (document.getElementById('crossword-creator-overlay')) return;

    const modal = document.createElement('div');
    modal.id = 'crossword-creator-overlay'; // Use a specific ID
    modal.className = 'ship-designer-overlay'; // Reuse styles from ship designer
    modal.innerHTML = `
    <div class="designer-header">
        <h2>Crossword Puzzle Creator</h2>
        <button id="creator-close-btn" class="designer-close-btn">&times;</button>
    </div>
    <div class="ship-designer">
        <!-- Column 1: Saved Puzzles -->
        <div class="designer-column">
            <h3>Saved Puzzles</h3>
            <div id="saved-puzzles-list"></div>
        </div>
        <!-- Column 2: Editor -->
        <div class="designer-column">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4>Puzzle Editor</h4>
                <button id="creator-save-btn" class="theme-button">Save</button>
            </div>
            <input type="text" id="puzzle-name-input" placeholder="Puzzle Name" class="designer-input">
            <textarea id="creator-input" rows="10" placeholder="Enter words and clues...\nWORD,A clue for the word"></textarea>
            <div class="button-row" style="justify-content: center; gap: 10px; margin-top: 10px;">
                <!-- AI Button was here -->
            </div>
        </div>
        <!-- Column 3: Preview -->
        <div class="designer-column">
            <button id="creator-generate-btn" class="theme-button" style="width: 100%; margin-bottom: 10px;">Preview</button>
            <div id="creator-preview">Click 'Preview' to see your puzzle.</div>
        </div>
    </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('creator-close-btn').onclick = () => modal.remove();

    // --- Event Listeners for the new UI ---

    // Generate Preview Button
    document.getElementById('creator-generate-btn').onclick = () => {
        const input = document.getElementById('creator-input').value;
        const lines = input.trim().split('\n');
        const wordsAndClues = lines.map(line => {
            const parts = line.split(',');
            if (parts.length < 2) return null;
            const word = parts[0].trim().toUpperCase();
            const clue = parts.slice(1).join(',').trim(); // Re-join in case clue has commas
            if (!word || !clue) return null;
            return { word, clue };
        }).filter(Boolean); // Filter out any null entries

        if (wordsAndClues.length < 2) {
            showToast('Please enter at least two valid words and clues.', 'error');
            return;
        }

        try {
            const generatedPuzzle = generateCrossword(wordsAndClues);
            if (generatedPuzzle) {
                renderPuzzlePreview(generatedPuzzle);
                showToast('Puzzle generated successfully!', 'info');
            } else {
                throw new Error("Generation resulted in a null puzzle.");
            }
        } catch (error) {
            console.error("Error generating crossword:", error);
            showToast('Could not generate a valid puzzle with these words. Try different words.', 'error');
            document.getElementById('creator-preview').innerHTML = 'Generation Failed.';
        }
    };

    // Save Puzzle Button
    document.getElementById('creator-save-btn').onclick = () => {
        const name = document.getElementById('puzzle-name-input').value.trim();
        const input = document.getElementById('creator-input').value.trim();

        if (!name || !input) {
            showToast('Puzzle name and word list cannot be empty.', 'error');
            return;
        }

        const wordsAndClues = input.split('\n').map(line => {
            const parts = line.split(',');
            if (parts.length < 2) return null;
            return { word: parts[0].trim().toUpperCase(), clue: parts.slice(1).join(',').trim() };
        }).filter(Boolean);

        const savedPuzzles = getSavedPuzzles();
        const existingIndex = savedPuzzles.findIndex(p => p.name === name);

        const newPuzzleData = { name, wordsAndClues };

        if (existingIndex > -1) {
            savedPuzzles[existingIndex] = newPuzzleData; // Update existing
        } else {
            savedPuzzles.push(newPuzzleData); // Add new
        }

        localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(savedPuzzles));
        showToast(`Puzzle "${name}" saved!`, 'info');
        renderSavedPuzzles();
    };

    renderSavedPuzzles(); // Initial render of saved puzzles
}

function getSavedPuzzles() {
    const saved = localStorage.getItem(SAVED_PUZZLES_KEY);
    return saved ? JSON.parse(saved) : [];
}

function renderSavedPuzzles() {
    const listEl = document.getElementById('saved-puzzles-list');
    if (!listEl) return;

    const savedPuzzles = getSavedPuzzles();
    listEl.innerHTML = '';

    savedPuzzles.forEach(puzzle => {
        const item = document.createElement('div');
        item.className = 'component-item theme-button';
        item.style.display = 'flex';
        item.style.alignItems = 'center';

        const nameDiv = document.createElement('div');
        nameDiv.textContent = puzzle.name;
        nameDiv.style.flexGrow = '1';
        nameDiv.style.cursor = 'pointer';
        nameDiv.onclick = () => loadPuzzleIntoCreator(puzzle);
        item.appendChild(nameDiv);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.className = 'designer-close-btn';
        deleteBtn.style.fontSize = '1.5rem';
        deleteBtn.style.padding = '0 5px';
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteSavedPuzzle(puzzle.name); };
        item.appendChild(deleteBtn);

        listEl.appendChild(item);
    });
}

function loadPuzzleIntoCreator(puzzle) {
    document.getElementById('puzzle-name-input').value = puzzle.name;
    const wordsText = puzzle.wordsAndClues.map(wc => `${wc.word},${wc.clue}`).join('\n');
    document.getElementById('creator-input').value = wordsText;
    document.getElementById('creator-preview').innerHTML = 'Puzzle loaded. Click Preview to see the grid.';
    showToast(`Loaded "${puzzle.name}".`, 'info');
}

function deleteSavedPuzzle(puzzleName) {
    const onConfirm = () => {
        let savedPuzzles = getSavedPuzzles();
        savedPuzzles = savedPuzzles.filter(p => p.name !== puzzleName);
        localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(savedPuzzles));
        showToast(`Deleted "${puzzleName}".`, 'info');
        renderSavedPuzzles();
    };
    showConfirmationModal(`Are you sure you want to delete the puzzle "${puzzleName}"?`, onConfirm);
}

/**
 * Renders a simple visual preview of a generated crossword grid.
 * @param {object} generatedPuzzle - The puzzle data object from generateCrossword.
 */
function renderPuzzlePreview(generatedPuzzle) {
    const previewContainer = document.getElementById('creator-preview');
    previewContainer.innerHTML = ''; // Clear previous preview
    previewContainer.style.display = 'grid';
    previewContainer.style.gridTemplateColumns = `repeat(${generatedPuzzle.size}, 1fr)`;
    previewContainer.style.gap = '1px';
    previewContainer.style.aspectRatio = '1 / 1';
    previewContainer.classList.add('crossword-grid'); // Use game styles

    const grid = generatedPuzzle.grid;
    const clues = generatedPuzzle.clues;

    // Create a map of cell coordinates to clue numbers for easy lookup
    const numberMap = {};
    [...clues.across, ...clues.down].forEach(clue => {
        const key = `${clue.row},${clue.col}`;
        if (!numberMap[key]) {
            numberMap[key] = clue.number;
        }
    });

    for (let r = 0; r < generatedPuzzle.size; r++) {
        for (let c = 0; c < generatedPuzzle.size; c++) {
            const cell = document.createElement('div');
            cell.className = 'crossword-cell';
            if (grid[r]?.[c] === null) {
                cell.classList.add('black');
            } else {
                const number = numberMap[`${r},${c}`];
                cell.innerHTML = `<div class="cell-number">${number || ''}</div><div class="cell-content"></div>`;
            }
            previewContainer.appendChild(cell);
        }
    }
}

function generateCrossword(wordsAndClues) {
    // Step 1: Sort words by length, longest first. This heuristic improves the
    // chances of a successful, dense placement by tackling the hardest words first.
    wordsAndClues.sort((a, b) => b.word.length - a.word.length);

    // Step 2: Initialize a large temporary grid to work in. This avoids boundary issues
    // during initial placement. The grid will be trimmed down later.
    const gridSize = 30; // A reasonable max size for generation
    let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));
    let placedWords = [];

    // Place the first (longest) word in the center
    const firstWord = wordsAndClues[0];
    const startRow = Math.floor(gridSize / 2);
    const startCol = Math.floor((gridSize - firstWord.word.length) / 2);
    for (let i = 0; i < firstWord.word.length; i++) {
        grid[startRow][startCol + i] = firstWord.word[i];
    }
    placedWords.push({ word: firstWord.word, clue: firstWord.clue, row: startRow, col: startCol, direction: 'across' });

    // Step 3: Attempt to place the rest of the words by finding intersections.
    for (let i = 1; i < wordsAndClues.length; i++) {
        const currentWord = wordsAndClues[i];
        const possibleFits = [];

        // Iterate through each already placed word to find a potential intersection.
        for (const placed of placedWords) {
            // Iterate through each letter of the new word we're trying to place.
            for (let j = 0; j < currentWord.word.length; j++) {
                const letter = currentWord.word[j];
                // Check if the letter from our new word exists in the already placed word.
                const intersectionIndex = placed.word.indexOf(letter);
                if (intersectionIndex !== -1) {
                    // Potential intersection found, check if it's a valid placement
                    const direction = placed.direction === 'across' ? 'down' : 'across';
                    const r = direction === 'down' ? placed.row + intersectionIndex : placed.row - j;
                    const c = direction === 'across' ? placed.col + intersectionIndex : placed.col - j;

                    // --- Placement Validation ---
                    // Now, check if the word can actually be placed at this spot without conflicts.
                    let canPlace = true;
                    for (let k = 0; k < currentWord.word.length; k++) {
                        const checkR = direction === 'down' ? r + k : r;
                        const checkC = direction === 'across' ? c + k : c;

                        // Bounds check
                        if (checkR < 0 || checkR >= gridSize || checkC < 0 || checkC >= gridSize ||
                            // Check for letter conflicts
                            (grid[checkR][checkC] !== null && grid[checkR][checkC] !== currentWord.word[k])) {
                            canPlace = false;
                            break;
                        }

                        // Check for parallel word conflicts. A new word can't be placed right next
                        // to another word running in the same direction, unless they intersect.
                        // This prevents words like 'CAT' and 'DOG' from forming 'CDOATG'.
                        const prevR = direction === 'down' ? checkR : checkR - 1;
                        const prevC = direction === 'across' ? checkC : checkC - 1;
                        const nextR = direction === 'down' ? checkR : checkR + 1;
                        const nextC = direction === 'across' ? checkC : checkC + 1;

                        if ((grid[prevR]?.[checkC] !== null && direction === 'down') || (grid[nextR]?.[checkC] !== null && direction === 'down') ||
                            (grid[checkR]?.[prevC] !== null && direction === 'across') || (grid[checkR]?.[nextC] !== null && direction === 'across')) {
                            if (grid[checkR][checkC] === null) { // Only matters if we are placing a new letter next to an existing one
                                canPlace = false;
                                break;
                            }
                        }
                    }

                    // If all checks pass, this is a valid placement.
                    if (canPlace) {
                        possibleFits.push({ word: currentWord.word, clue: currentWord.clue, row: r, col: c, direction });
                    }
                }
            }
        }

        let bestFit = null;
        if (possibleFits.length > 0) {
            // To create more varied puzzles, we randomly choose one of the valid placements
            // instead of always picking the first one found.
            bestFit = possibleFits[Math.floor(Math.random() * possibleFits.length)];
        }
        
        if (bestFit) {
            for (let k = 0; k < bestFit.word.length; k++) {
                const r = bestFit.direction === 'down' ? bestFit.row + k : bestFit.row;
                const c = bestFit.direction === 'across' ? bestFit.col + k : bestFit.col;
                grid[r][c] = bestFit.word[k];
            }
            placedWords.push(bestFit);
        }
    }

    // Step 4: Trim the oversized grid down to the smallest possible size that fits all words.
    // First, find the bounding box (min/max row and column) of all placed words.
    let minR = gridSize, maxR = -1, minC = gridSize, maxC = -1;
    placedWords.forEach(p => {
        minR = Math.min(minR, p.row);
        maxR = Math.max(maxR, p.direction === 'down' ? p.row + p.word.length - 1 : p.row);
        minC = Math.min(minC, p.col);
        maxC = Math.max(maxC, p.direction === 'across' ? p.col + p.word.length - 1 : p.col);
    });

    // Calculate the required height and width, then determine the final square size.
    const requiredHeight = maxR - minR + 1;
    const requiredWidth = maxC - minC + 1;
    const finalSize = Math.max(requiredWidth, requiredHeight);
    // Create a new, perfectly sized square grid.
    const trimmedGrid = Array(finalSize).fill(null).map(() => Array(finalSize).fill(null));

    // Copy the words from the large temporary grid to the new trimmed grid,
    // adjusting their coordinates relative to the new top-left corner.
    placedWords.forEach(p => {
        p.row -= minR;
        p.col -= minC;
        for (let i = 0; i < p.word.length; i++) {
            const r = p.direction === 'down' ? p.row + i : p.row;
            const c = p.direction === 'across' ? p.col + i : p.col;
            trimmedGrid[r][c] = p.word[i];
        }
    });

    // Step 5: Re-number clues based on their final position in the trimmed grid.
    // This ensures clues are numbered sequentially from top-to-bottom, left-to-right.
    const clues = { across: [], down: [] };
    let clueNumber = 1;
    const numberMap = {}; // To avoid duplicate numbers at the same cell

    // Sort placed words by their final position to ensure correct numbering.
    placedWords.sort((a, b) => (a.row * finalSize + a.col) - (b.row * finalSize + b.col));

    placedWords.forEach(p => {
        const mapKey = `${p.row},${p.col}`;
        if (!numberMap[mapKey]) {
            numberMap[mapKey] = clueNumber++;
        }
        const number = numberMap[mapKey];

        clues[p.direction].push({
            number: number,
            clue: p.clue,
            answer: p.word,
            row: p.row,
            col: p.col,
            length: p.word.length
        });
    });

    clues.across.sort((a, b) => a.number - b.number);
    clues.down.sort((a, b) => a.number - b.number);

    return {
        size: finalSize,
        grid: trimmedGrid,
        clues: clues
    };
}

function renderClues() {
    const acrossList = document.getElementById('across-clues');
    const downList = document.getElementById('down-clues');
    acrossList.innerHTML = '';
    downList.innerHTML = '';

    puzzleData.clues.across.forEach(clue => {
        const li = document.createElement('li');
        li.dataset.clue = `across-${clue.number}`;
        li.innerHTML = `<strong>${clue.number}.</strong> ${clue.clue}`;
        li.onclick = () => activateClue('across', clue.number);
        acrossList.appendChild(li);
        document.getElementById(`cell-${clue.row}-${clue.col}`).querySelector('.cell-number').textContent = clue.number;
    });

    puzzleData.clues.down.forEach(clue => {
        const li = document.createElement('li');
        li.dataset.clue = `down-${clue.number}`;
        li.innerHTML = `<strong>${clue.number}.</strong> ${clue.clue}`;
        li.onclick = () => activateClue('down', clue.number);
        downList.appendChild(li);
        document.getElementById(`cell-${clue.row}-${clue.col}`).querySelector('.cell-number').textContent = clue.number;
    });
}

function handleKeyPress(event) {
    const key = event.key.toUpperCase();
    if (key.match(/^[A-Z]$/) || key === 'BACKSPACE') {
        processInput(key);
    }
}

function processInput(key) {
    const gameState = appState.soloGameState;
    if (!gameState.activeCell) return;

    const { r, c } = gameState.activeCell;
    const cell = document.getElementById(`cell-${r}-${c}`);
    if (!cell) return;

    if (key === 'BACKSPACE') {
        cell.querySelector('.cell-content').textContent = '';
        // Move focus to the previous cell
        const { direction } = gameState.activeClue;
        let prevR = r, prevC = c;
        if (direction === 'across') { prevC--; } else { prevR--; }
        const prevCell = document.getElementById(`cell-${prevR}-${prevC}`);
        if (prevCell && !prevCell.classList.contains('black')) {
            handleCellClick(prevR, prevC);
        }
    } else {
        cell.querySelector('.cell-content').textContent = key;
        // Move to the next input cell automatically
        const { direction } = appState.soloGameState.activeClue;
        let nextR = r, nextC = c;
        if (direction === 'across') { nextC++; } else { nextR++; }

        const nextCell = document.getElementById(`cell-${nextR}-${nextC}`);
        if (nextCell && !nextCell.classList.contains('black')) {
            handleCellClick(nextR, nextC);
        }
    }

    checkGridState();
}

function activateClue(direction, number) {
    const gameState = appState.soloGameState;
    gameState.activeClue = { direction, number };

    const clue = puzzleData.clues[direction].find(c => c.number === number);
    if (clue) {
        gameState.activeCell = { r: clue.row, c: clue.col };
        highlightActiveWord();
        document.getElementById(`cell-${clue.row}-${clue.col}`).classList.add('active');
    }
}

/**
 * Handles a click on a grid cell, determining the active clue and updating the UI.
 * @param {number} r - The row of the clicked cell.
 * @param {number} c - The column of the clicked cell.
 * @param {boolean} [allowToggle=false] - Whether to allow toggling direction on the same cell.
 */
function handleCellClick(r, c, allowToggle = false) {
    const gameState = appState.soloGameState;
    const nextClue = determineNextActiveClue(r, c, allowToggle);

    if (!nextClue) return; // Click was on a black square or invalid cell

    gameState.activeClue = nextClue;
    gameState.activeCell = { r, c };

    highlightActiveWord();
}

/**
 * Determines the next active clue based on the clicked cell and current state.
 * This function encapsulates the logic for switching or maintaining direction.
 * @param {number} r - The row of the clicked cell.
 * @param {number} c - The column of the clicked cell.
 * @param {boolean} allowToggle - Whether to allow toggling.
 * @returns {{direction: string, number: number}|null} The new active clue or null.
 */
function determineNextActiveClue(r, c, allowToggle) {
    const { activeClue, activeCell } = appState.soloGameState;
    const acrossClue = findClueForCell(r, c, 'across');
    const downClue = findClueForCell(r, c, 'down');

    if (!acrossClue && !downClue) return null;

    const isSameCell = activeCell?.r === r && activeCell?.c === c;
    const isIntersection = acrossClue && downClue;

    // 1. Handle toggling direction on an intersection cell
    if (allowToggle && isSameCell && isIntersection) {
        const newDirection = activeClue.direction === 'across' ? 'down' : 'across';
        const clueToUse = newDirection === 'down' ? downClue : acrossClue;
        return { direction: newDirection, number: clueToUse.number };
    }

    // 2. Try to maintain the current direction if it's valid for the new cell
    if (activeClue?.direction === 'across' && acrossClue) {
        return { direction: 'across', number: acrossClue.number };
    }
    if (activeClue?.direction === 'down' && downClue) {
        return { direction: 'down', number: downClue.number };
    }

    // 3. If the current direction isn't valid, default to 'across', then 'down'
    return acrossClue ? { direction: 'across', number: acrossClue.number } : { direction: 'down', number: downClue.number };
}

function findClueForCell(r, c, direction) {
    return puzzleData.clues[direction].find(clue => {
        if (direction === 'across') {
            return r === clue.row && c >= clue.col && c < clue.col + clue.length;
        } else { // down
            return c === clue.col && r >= clue.row && r < clue.row + clue.length;
        }
    });
}

function highlightActiveWord() {
    document.querySelectorAll('.crossword-cell.highlight, .crossword-cell.active').forEach(cell => cell.classList.remove('highlight', 'active'));
    document.querySelectorAll('.clues-list li.active').forEach(li => li.classList.remove('active'));

    const { direction, number } = appState.soloGameState.activeClue;
    const { r: activeR, c: activeC } = appState.soloGameState.activeCell;
    const clue = puzzleData.clues[direction].find(c => c.number === number);

    if (!clue) return;

    for (let i = 0; i < clue.length; i++) {
        const r = direction === 'across' ? clue.row : clue.row + i;
        const c = direction === 'across' ? clue.col + i : clue.col;
        document.getElementById(`cell-${r}-${c}`)?.classList.add('highlight');
    }
    document.getElementById(`cell-${appState.soloGameState.activeCell.r}-${appState.soloGameState.activeCell.c}`)?.classList.add('active');

    const clueElement = document.querySelector(`li[data-clue="${direction}-${number}"]`);
    if (clueElement) clueElement.classList.add('active');
    document.getElementById(`cell-${activeR}-${activeC}`)?.classList.add('active');
}

/**
 * Gathers the complete current state of the crossword puzzle and copies it to the clipboard as JSON.
 * This is a temporary debug function.
 */
function copyDebugStateToClipboard() {
    if (!puzzleData || !appState.soloGameState) {
        showToast('No puzzle data to copy.', 'error');
        return;
    }

    // Construct the user's current grid from the DOM
    const userGrid = Array(puzzleData.size).fill(null).map(() => Array(puzzleData.size).fill(null));
    for (let r = 0; r < puzzleData.size; r++) {
        for (let c = 0; c < puzzleData.size; c++) {
            if (puzzleData.grid[r]?.[c] !== null) {
                const cellContent = document.getElementById(`cell-${r}-${c}`)?.querySelector('.cell-content').textContent || '';
                userGrid[r][c] = cellContent;
            }
        }
    }

    const debugState = {
        puzzleData: puzzleData,
        userGrid: userGrid,
        activeClue: appState.soloGameState.activeClue,
        activeCell: appState.soloGameState.activeCell
    };

    navigator.clipboard.writeText(JSON.stringify(debugState, null, 2))
        .then(() => {
            showToast('Puzzle state copied to clipboard!', 'info');
        })
        .catch(err => {
            console.error('Failed to copy debug state:', err);
            showToast('Failed to copy state.', 'error');
        });
}

export function checkGridState() {
    let isComplete = true;
    let isCorrect = true;

    for (let r = 0; r < puzzleData.size; r++) {
        for (let c = 0; c < puzzleData.size; c++) {
            if (puzzleData.grid[r][c] !== null) {
                const input = document.getElementById(`cell-${r}-${c}`)?.querySelector('.cell-content').textContent;
                if (input === '') {
                    isComplete = false;
                } else if (input !== puzzleData.grid[r][c]) {
                    isCorrect = false;
                }
            }
        }
    }

    if (isComplete && isCorrect) {
        showWinnerScreen('You');
    }
}

export function getInitialState() {
    // For now, we use the hardcoded puzzleData.
    // A future implementation could have a library of puzzles.
    return {
        puzzle: puzzleData,
        userGrid: Array(puzzleData.size).fill(null).map(() => Array(puzzleData.size).fill('')),
        activeClue: null, // { direction: 'across', number: 1 }
        activeCell: null  // { r: 0, c: 0 }
    };
}

export function loadPuzzle() {
    appState.winner = null;
    generateDefaultPuzzle(); // This will now pick a random custom puzzle if available
    appState.soloGameState = getInitialState();
    createGrid();
}

// Placeholder functions for multiplayer
export function processMove(moveData) {}
export function processUIUpdate(data) {}
export function updateGridForTeam(teamName) {}