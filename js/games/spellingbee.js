//==============================
// Spelling Bee Game Logic
//==============================

import { startTimer, stopTimer } from '../timer.js';
import { dom, appState } from '../scripts.js';
import { showWinnerScreen, showToast } from '../ui.js';

const WORD_LIST = ["COOPERATIVE", "ASSISTANT", "ENGINEERING", "JAVASCRIPT", "SYNTHESIS", "BROWSER", "OFFLINE", "CHALLENGE"];

export function initialize() {
    // If we are initializing for a solo game, draw the grid.
    if (appState.isInitiator && !appState.playerTeam) {
        createGrid();
    }
}

export function cleanup() {
    stopTimer();
}

export function createGrid() {
    // Create the necessary HTML structure within the generic game board area.
    dom.gameBoardArea.innerHTML = `
        <div id="spelling-bee-area">
            <div id="spelling-bee-controls">
                <button id="speak-word-btn" class="theme-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                    <span>Speak Word</span>
                </button>
            </div>
            <div id="spelling-bee-answer-area"></div>
            <p id="spelling-bee-feedback"></p>
        </div>
    `;
    // Now that the elements are created, we can proceed with setting up the question.
    setupQuestion(); 
}

export function getInitialState(difficulty, gameMode) {
    let wordsToUse = [...WORD_LIST];
    const customWordList = dom.spellingBeeWordListInput.value.trim();

    if (customWordList) {
        const customWords = customWordList.split(/[\n, ]+/)
            .map(word => word.trim().toUpperCase())
            .filter(word => word.length > 1);
        
        if (customWords.length > 0) {
            wordsToUse = customWords;
        }
    }

    const shuffledWords = [...wordsToUse].sort(() => 0.5 - Math.random());
    return {
        words: shuffledWords,
        currentWordIndex: 0,
        currentWord: shuffledWords[0],
        score: 0,
        gameMode: dom.spellingbeeModeSelect.value || 'multiple-choice',
    };
}

export function loadPuzzle() {
    appState.winner = null;
    startTimer();
    appState.soloGameState = getInitialState();
    createGrid();
}

function setupQuestion() {
    const gameState = appState.soloGameState;
    if (!gameState || gameState.currentWordIndex >= gameState.words.length) {
        // Game over
        showWinnerScreen('You');
        return;
    }

    gameState.currentWord = gameState.words[gameState.currentWordIndex];
    // Wire up the speak button now that it exists.
    document.getElementById('speak-word-btn').onclick = () => speakWord(gameState.currentWord);

    const feedbackEl = document.getElementById('spelling-bee-feedback');
    feedbackEl.textContent = `Word ${gameState.currentWordIndex + 1} of ${gameState.words.length}. Score: ${gameState.score}`;
    if (gameState.gameMode === 'multiple-choice') {
        setupMultipleChoice();
    } else if (gameState.gameMode === 'type-it-out') {
        setupTypingInput();
    } else {
        setupAnagramMode();
    }

    // Automatically speak the first word
    setTimeout(() => speakWord(gameState.currentWord), 500);
}

function setupMultipleChoice() {
    const answerArea = document.getElementById('spelling-bee-answer-area');
    answerArea.innerHTML = '';
    const correctWord = appState.soloGameState.currentWord;

    // Create distractors (misspelled words)
    const options = [correctWord];
    while (options.length < 4) {
        const distractor = createMisspelledWord(correctWord);
        if (!options.includes(distractor)) {
            options.push(distractor);
        }
    }

    // Shuffle options and create buttons
    options.sort(() => 0.5 - Math.random()).forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.className = 'spelling-bee-option-btn';
        button.onclick = () => checkAnswer(option);
        answerArea.appendChild(button);
    });
}

function setupTypingInput() {
    const answerArea = document.getElementById('spelling-bee-answer-area');
    answerArea.innerHTML = `
        <input type="text" id="spelling-input" placeholder="Type the word..." style="font-size: 1.5rem; text-align: center;">
        <button id="submit-spelling-btn" class="theme-button">Submit</button>
    `;
    const input = document.getElementById('spelling-input');
    const submitBtn = document.getElementById('submit-spelling-btn');

    const submit = () => {
        checkAnswer(input.value.trim().toUpperCase());
        input.value = '';
    };

    submitBtn.onclick = submit;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            submit();
        }
    };
}

function setupAnagramMode() {
    const answerArea = document.getElementById('spelling-bee-answer-area');
    const correctWord = appState.soloGameState.currentWord;
    const isHardMode = appState.soloGameState.gameMode === 'anagram-plus';

    let letters = correctWord.split('');
    if (isHardMode) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let i = 0; i < 3; i++) { // Add 3 extra random letters
            letters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
        }
    }

    // Shuffle the letters, and re-shuffle if it accidentally spells the correct word.
    // This is only relevant for the standard anagram mode, as hard mode has extra letters.
    do {
        letters.sort(() => 0.5 - Math.random());
    } while (!isHardMode && letters.join('') === correctWord);

    answerArea.innerHTML = `
        <div class="anagram-container">
            <div id="anagram-drop-zone" class="anagram-drop-zone"></div>
            <div id="anagram-letter-pool" class="anagram-letter-pool"></div>
            <button id="submit-spelling-btn" class="theme-button">Submit</button>
        </div>
    `;

    const letterPool = document.getElementById('anagram-letter-pool');
    const dropZone = document.getElementById('anagram-drop-zone');

    // --- Touch-based Drag and Drop Implementation ---
    let draggedTile = null;
    let startX, startY, offsetX, offsetY;

    letters.forEach((letter, index) => {
        const tile = document.createElement('div');
        tile.textContent = letter;
        tile.className = 'anagram-letter-tile';
        tile.draggable = true;
        tile.id = `tile-${index}`;
        tile.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.id);
            tile.classList.add('dragging');
        });
        tile.addEventListener('dragend', () => tile.classList.remove('dragging'));

        // Touch events for mobile
        tile.addEventListener('touchstart', (e) => {
            e.preventDefault();
            draggedTile = tile;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = tile.getBoundingClientRect();
            offsetX = startX - rect.left;
            offsetY = startY - rect.top;

            tile.style.position = 'fixed';
            tile.style.zIndex = '1000';
            tile.style.left = `${startX - offsetX}px`;
            tile.style.top = `${startY - offsetY}px`;
            tile.classList.add('dragging');
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!draggedTile) return;
            e.preventDefault();
            const touch = e.touches[0];
            draggedTile.style.left = `${touch.clientX - offsetX}px`;
            draggedTile.style.top = `${touch.clientY - offsetY}px`;
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!draggedTile) return;

            // Temporarily hide the dragged tile to find what's underneath
            draggedTile.style.visibility = 'hidden';

            const touch = e.changedTouches[0];
            const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);

            // Reset styles
            draggedTile.style.position = '';
            draggedTile.style.zIndex = '';
            draggedTile.style.visibility = 'visible'; // Make it visible again
            draggedTile.classList.remove('dragging');

            handleDrop(draggedTile, dropTarget);
            draggedTile = null;
        });

        letterPool.appendChild(tile);
    });

    const allowDrop = (e) => e.preventDefault();
    dropZone.addEventListener('dragover', allowDrop);
    letterPool.addEventListener('dragover', allowDrop);

    const handleDrop = (tile, dropTarget) => {
        if (!tile) return;

        if (dropTarget && dropTarget.closest('#anagram-drop-zone')) {
            const afterElement = getDragAfterElement(dropZone, parseFloat(tile.style.left) + offsetX);
            if (afterElement == null) {
                dropZone.appendChild(tile);
            } else {
                dropZone.insertBefore(tile, afterElement);
            }
        } else {
            // If dropped anywhere else, return to the letter pool
            letterPool.appendChild(tile);
        }
        dropZone.classList.remove('drag-over');
    };

    dropZone.addEventListener('drop', (e) => { // Mouse drop
        e.preventDefault();
        const tileId = e.dataTransfer.getData('text');
        handleDrop(document.getElementById(tileId), e.target);
    });
    letterPool.addEventListener('drop', (e) => { // Mouse drop
        e.preventDefault();
        const tileId = e.dataTransfer.getData('text');
        handleDrop(document.getElementById(tileId), e.target);
    });

    // Visual feedback for dragging over the drop zone
    dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

    document.getElementById('submit-spelling-btn').onclick = () => {
        const spelledWord = Array.from(dropZone.children).map(tile => tile.textContent).join('');
        checkAnswer(spelledWord);
    };
}

/**
 * Determines which element the dragged tile should be inserted before.
 * @param {HTMLElement} container - The container being dragged over.
 * @param {number} x - The horizontal coordinate of the mouse.
 * @returns {HTMLElement|null} The element to insert before, or null to append at the end.
 */
function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.anagram-letter-tile:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function checkAnswer(answer) {
    const gameState = appState.soloGameState;

    if (answer === gameState.currentWord) {
        gameState.score++;
        showToast('Correct!');
    } else {
        showToast(`Incorrect. The correct spelling is ${gameState.currentWord}.`, 'error');
    }

    gameState.currentWordIndex++;
    setTimeout(() => {
        setupQuestion();
    }, 2000); // Wait 2 seconds before the next question
}

export function speakWord(word) {
    if (!('speechSynthesis' in window) || !word) {
        alert("Sorry, your browser does not support text-to-speech, or there is no word to speak.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(word);
    
    // Find the selected voice from the dropdown
    const voices = window.speechSynthesis.getVoices();
    const selectedVoiceName = dom.voiceSelect.value;
    const selectedVoice = voices.find(v => v.name === selectedVoiceName);

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.pitch = 1;
    utterance.rate = 0.8; // Speak a bit slower for clarity
    window.speechSynthesis.speak(utterance);
}

/**
 * Creates a plausible-looking misspelled version of a word.
 * @param {string} word The correct word.
 * @returns {string} A misspelled version of the word.
 */
function createMisspelledWord(word) {
    if (word.length < 3) return word + 'X';
    const type = Math.floor(Math.random() * 4);
    const chars = word.split('');
    const pos = 1 + Math.floor(Math.random() * (word.length - 2)); // Avoid start/end

    switch (type) {
        case 0: // Swap letters
            if (pos < chars.length - 1) {
                [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
            }
            break;
        case 1: // Replace a vowel
            const vowels = "AEIOU";
            if (vowels.includes(chars[pos])) {
                let newVowel = vowels[Math.floor(Math.random() * vowels.length)];
                while (newVowel === chars[pos]) {
                    newVowel = vowels[Math.floor(Math.random() * vowels.length)];
                }
                chars[pos] = newVowel;
            }
            break;
        case 2: // Double a consonant
            const consonants = "BCDFGHJKLMNPQRSTVWXYZ";
            if (consonants.includes(chars[pos])) {
                chars.splice(pos, 0, chars[pos]);
            }
            break;
        case 3: // Drop a letter
            chars.splice(pos, 1);
            break;
    }
    return chars.join('');
}