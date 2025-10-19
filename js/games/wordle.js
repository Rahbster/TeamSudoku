//==============================
// Wordle Game Logic
//==============================

import { dom, appState } from '../scripts.js';
import { showWinnerScreen, showToast, createTimerHTML } from '../ui.js';
import { speakWord } from './spellingbee.js'; // Import the speakWord function
import { stopTimer } from '../timer.js';

// A small, curated list of possible answers.
const ANSWER_LIST = ["AGENT", "WORLD", "GAMES", "QUERY", "PROXY", "CODES", "THEME", "STYLE", "GREAT", "PLANT", "CHAIR", "AUDIO", "ALERT"];
// A larger list of valid 5-letter words for guessing.
const VALID_GUESSES = new Set([...ANSWER_LIST, "ABOUT", "ABOVE", "ADMIN", "ADULT", "AFTER", "ALARM", "ALERT", "ALIEN", "ALIKE", "ALIVE", "ALLOW", "ALONE", "ALONG", "ALTER", "AMONG", "ANGER", "ANGLE", "APPLE", "APPLY", "ARENA", "ARGUE", "ARISE", "ARRAY", "ASIDE", "ASSET", "AUDIT", "AVOID", "AWARD", "AWARE", "BADLY", "BAKER", "BASES", "BASIC", "BASIS", "BEACH", "BEGIN", "BEING", "BELOW", "BENCH", "BILLY", "BIRTH", "BLACK", "BLAME", "BLANK", "BLIND", "BLOCK", "BLOOD", "BOARD", "BOOST", "BOOTH", "BOUND", "BRAIN", "BRAND", "BREAD", "BREAK", "BREED", "BRIEF", "BRING", "BROAD", "BROKE", "BROWN", "BUILD", "BUILT", "BUYER", "CABIN", "CABLE", "CALIF", "CALLS", "CAMEL", "CARRY", "CATCH", "CAUSE", "CHAIN", "CHART", "CHASE", "CHEAP", "CHECK", "CHEST", "CHIEF", "CHILD", "CHINA", "CHOSE", "CIVIL", "CLAIM", "CLASS", "CLEAN", "CLEAR", "CLICK", "CLOCK", "CLOSE", "COACH", "COAST", "COULD", "COUNT", "COURT", "COVER", "CRAFT", "CRASH", "CREAM", "CRIME", "CROSS", "CROWD", "CROWN", "CURVE", "CYCLE", "DAILY", "DANCE", "DAVID", "DEALT", "DEATH", "DEBUT", "DELAY", "DEPTH", "DOING", "DOUBT", "DOZEN", "DRAFT", "DRAMA", "DRAWN", "DREAM", "DRESS", "DRILL", "DRINK", "DRIVE", "DROVE", "DYING", "EAGER", "EARLY", "EARTH", "EIGHT", "ELITE", "EMPTY", "ENEMY", "ENJOY", "ENTER", "ENTRY", "EQUAL", "ERROR", "EVENT", "EVERY", "EXACT", "EXIST", "EXTRA", "FAITH", "FALSE", "FAULT", "FIBER", "FIELD", "FIFTH", "FIFTY", "FIGHT", "FINAL", "FIRST", "FIXED", "FLASH", "FLEET", "FLOOR", "FLUID", "FOCUS", "FORCE", "FORTH", "FORTY", "FORUM", "FOUND", "FRAME", "FRANK", "FRAUD", "FRESH", "FRONT", "FRUIT", "FULLY", "FUNNY", "GIANT", "GIVEN", "GLASS", "GLOBE", "GOING", "GRACE", "GRADE", "GRAND", "GRANT", "GRASS", "GREEN", "GROSS", "GROUP", "GROWN", "GUARD", "GUESS", "GUEST", "GUIDE", "HAPPY", "HARRY", "HEART", "HEAVY", "HENCE", "HENRY", "HORSE", "HOTEL", "HUMAN", "IDEAL", "IMAGE", "INDEX", "INNER", "ISSUE", "IRONY", "JAPAN", "JOINT", "JONES", "JUDGE", "KNOWN", "LABEL", "LARGE", "LASER", "LATER", "LAUGH", "LAYER", "LEARN", "LEAST", "LEAVE", "LEGAL", "LEVEL", "LEWIS", "LIGHT", "LIMIT", "LINKS", "LIVES", "LOCAL", "LOGIC", "LOOSE", "LOWER", "LUCKY", "LUNCH", "LYING", "MAGIC", "MAJOR", "MAKER", "MARCH", "MARIA", "MATCH", "MAYBE", "MAYOR","METAL", "MEDIA", "METER", "MIGHT", "MINOR", "MINUS", "MIXED", "MODEL", "MONEY", "MONTH", "MORAL", "MOTOR", "MOUNT", "MOUSE", "MOUTH", "MOVIE", "MUSIC", "NEEDS", "NEVER", "NEWLY", "NIGHT", "NOISE", "NORTH", "NOTED", "NOVEL", "NURSE", "OCCUR", "OCEAN", "OFFER", "OFTEN", "ORDER", "OTHER", "OUGHT", "PAINT", "PANEL", "PAPER", "PARTY", "PEACE", "PETER", "PHASE", "PHONE", "PHOTO", "PIECE", "PILOT", "PITCH", "PLACE", "PLAIN", "PLANE", "PLATE", "POINT", "POUND", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRINT", "PRIOR", "PRIZE", "PROOF", "PROUD", "PROVE", "QUICK", "QUIET", "QUITE", "RADIO", "RAISE", "RANGE", "RAPID", "RATIO", "REACH", "REACT", "READY", "REALM", "REPLY", "RIGHT", "RIVAL", "RIVER", "ROBIN", "ROGER", "ROMAN", "ROUGH", "ROUND", "ROUTE", "ROYAL", "RURAL", "SCALE", "SCENE", "SCOPE", "SCORE", "SENSE", "SERVE", "SEVEN", "SHALL", "SHAPE", "SHARE", "SHARP", "SHEET", "SHELF", "SHELL", "SHIFT", "SHIRT", "SHOCK", "SHOOT", "SHORT", "SHOWN", "SIGHT", "SINCE", "SIXTH", "SIXTY", "SIZED", "SKILL", "SLEEP", "SLIDE", "SMALL", "SMART", "SMILE", "SMITH", "SMOKE", "SOLID", "SOLVE", "SORRY", "SOUND", "SOUTH", "SPACE", "SPARE", "SPEAK", "SPEED", "SPEND", "SPENT", "SPLIT", "SPOKE", "SPORT", "STAFF", "STAGE", "STAKE", "STAND", "START", "STATE", "STEAM", "STEEL", "STICK", "STILL", "STOCK", "STONE", "STOOD", "STORE", "STORM","STORY", "STRIP", "STUCK", "STUDY", "STUFF", "SUGAR", "SUITE", "SUPER", "SWEET", "TABLE", "TAKEN", "TASTE", "TAXES", "TEACH", "TEETH", "TERRY", "TEXAS", "THANK", "THEFT", "THEIR", "THICK", "THING", "THINK", "THIRD", "THOSE", "THREE", "THREW", "THROW", "TIGHT", "TIMES", "TIRED", "TITLE", "TODAY", "TOPIC", "TOTAL", "TOUCH", "TOUGH", "TOWER", "TRACK", "TRADE", "TRAIN", "TREAT", "TREND", "TRIAL", "TRIED", "TRIES", "TRUCK", "TRULY", "TRUST", "TRUTH", "TWICE", "UNDER", "UNDUE", "UNION", "UNIQUE", "UNTIL", "UPPER", "URBAN", "USAGE", "USUAL", "VALID", "VALUE", "VIDEO", "VIRUS", "VISIT", "VITAL", "VOICE", "WASTE", "WATCH", "WATER", "WEIGH", "WHEEL", "WHERE", "WHICH", "WHILE", "WHITE", "WHOLE", "WHOSE", "WOMAN", "WOMEN", "WORRY", "WORSE", "WORST", "WORTH", "WOULD", "WOUND", "WRITE", "WRONG", "WROTE", "YIELD", "YOUNG", "YOUTH"]);

export function initialize() {
    document.body.classList.add('wordle-active');
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Challenge';
    dom.newPuzzleButton.style.display = '';
    loadPuzzle();
}

export function cleanup() {
    document.body.classList.remove('wordle-active');
    // Remove keyboard listeners to prevent them from firing when not in the game
    document.removeEventListener('keydown', handleKeyPress);
}

export function createGrid() {
    dom.gameBoardArea.innerHTML = `
        <div id="wordle-container">
            <div id="wordle-grid"></div>
            <button id="wordle-hint-btn" class="theme-button hidden">Hint</button>
            <div id="wordle-keyboard"></div>
        </div>
        <!-- Sidebar is now a direct child of game-board-area for correct positioning -->
        <div id="wordle-sidebar" class="glass-panel hidden">
            ${createTimerHTML()}
            <h4>Possible Words</h4>
            <ul id="wordle-possible-words-list"></ul>
        </div>
    `;

    const grid = document.getElementById('wordle-grid');
    grid.innerHTML = ''; // Clear previous grid
    const keyboard = document.getElementById('wordle-keyboard');
    keyboard.innerHTML = ''; // Clear previous keyboard

    // Also clear and hide the possible words sidebar to ensure a clean start
    const sidebar = document.getElementById('wordle-sidebar');
    const wordList = document.getElementById('wordle-possible-words-list');
    if (sidebar) sidebar.classList.add('hidden');
    if (wordList) wordList.innerHTML = '';

    // Create the 6x5 grid for guesses
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('div');
        row.className = 'wordle-row';
        row.id = `row-${i}`;

        for (let j = 0; j < 5; j++) {
            const tile = document.createElement('div');
            tile.className = 'tile-container';
            tile.id = `tile-${i}-${j}`;
            tile.innerHTML = `
                <div class="wordle-tile">
                    <div class="front"></div>
                    <div class="back"></div>
                </div>
            `;
            row.appendChild(tile);
        }
        grid.appendChild(row);
    }

    // Create the on-screen keyboard
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

    // Add Enter and Backspace buttons
    const bottomRow = document.createElement('div');
    bottomRow.className = 'keyboard-row';
    const enterBtn = document.createElement('button');
    enterBtn.className = 'key wide';
    enterBtn.textContent = 'ENTER';
    enterBtn.dataset.key = 'Enter';
    const backspaceBtn = document.createElement('button');
    backspaceBtn.className = 'key wide';
    backspaceBtn.innerHTML = '&#9003;'; // Backspace symbol
    backspaceBtn.dataset.key = 'Backspace';
    bottomRow.appendChild(enterBtn);
    bottomRow.appendChild(backspaceBtn);

    // Initially disable both keys
    enterBtn.disabled = true;
    backspaceBtn.disabled = true;
    keyboard.appendChild(bottomRow);

    // Add event listeners
    keyboard.addEventListener('click', handleKeyboardClick);
    document.addEventListener('keydown', handleKeyPress);

    const hintButton = document.getElementById('wordle-hint-btn');
    if (hintButton) {
        // The hint button is now outside the keyboard area, so we need to find it in the main container
        hintButton.onclick = showHint;
    }
}

function handleKeyboardClick(event) {
    if (event.target.matches('[data-key]')) {
        processInput(event.target.dataset.key);
    }
}

function handleKeyPress(event) {
    const key = event.key;
    if (key === 'Enter' || key === 'Backspace') {
        processInput(key);
    } else if (key.length === 1 && key.match(/^[a-zA-Z]$/)) {
        processInput(key.toUpperCase());
    }
}

function processInput(key) {
    const gameState = appState.soloGameState;
    if (gameState.gameOver) return;

    if (key === 'Enter') {
        submitGuess();
    } else if (key === 'Backspace') {
        deleteLetter();
    } else if (gameState.currentCol < 5) {
        addLetter(key);
    }
}

function addLetter(letter) {
    const gameState = appState.soloGameState;
    const tileContainer = document.getElementById(`tile-${gameState.currentRow}-${gameState.currentCol}`);
    const tile = tileContainer.querySelector('.wordle-tile');
    const front = tile.querySelector('.front');
    front.textContent = letter;
    tile.classList.add('filled');
    gameState.currentCol++;

    // Enable Backspace since we've added a letter
    document.querySelector('.key[data-key="Backspace"]').disabled = false;

    // If the row is now full, make the Enter key blink.
    if (gameState.currentCol === 5) {
        const enterKey = document.querySelector('.key[data-key="Enter"]');
        enterKey?.classList.add('blinking');
        enterKey.disabled = false;
    }
}

function deleteLetter() {
    const gameState = appState.soloGameState;
    if (gameState.currentCol > 0) {
        gameState.currentCol--;
        const tileContainer = document.getElementById(`tile-${gameState.currentRow}-${gameState.currentCol}`);
        const tile = tileContainer.querySelector('.wordle-tile');
        const front = tile.querySelector('.front');
        front.textContent = '';
        tile.classList.remove('filled');

        // If we backspace, the row is no longer full, so stop blinking and disable Enter.
        const enterKey = document.querySelector('.key[data-key="Enter"]');
        enterKey?.classList.remove('blinking');
        enterKey.disabled = true;

        // If the row is now empty, disable Backspace.
        if (gameState.currentCol === 0) {
            document.querySelector('.key[data-key="Backspace"]').disabled = true;
        }
    }
}

function submitGuess() {
    const enterKey = document.querySelector('.key[data-key="Enter"]');
    enterKey?.classList.remove('blinking');
    enterKey.disabled = true; // Disable after submitting
    const gameState = appState.soloGameState;
    if (gameState.currentCol !== 5) {
        showToast("Not enough letters", "error");
        return;
    }

    let currentGuess = '';
    for (let i = 0; i < 5; i++) {
        currentGuess += document.getElementById(`tile-${gameState.currentRow}-${i}`).querySelector('.wordle-tile .front').textContent;
    }

    // Local word validation
    if (!VALID_GUESSES.has(currentGuess)) {
        showToast("Not in word list", "error");
        enterKey?.classList.add('invalid'); // Show invalid state
        shakeRow(gameState.currentRow);
        return;
    }

    checkGuess(currentGuess);

    if (currentGuess === gameState.targetWord) {
        gameState.gameOver = true;
        stopTimer();
        showToast("You Win!", "info");
        showWinnerScreen("You");
    } else {
        gameState.currentRow++;
        gameState.currentCol = 0;
        if (gameState.currentRow === 6) {
            gameState.gameOver = true;
            stopTimer();
            showToast(`Game Over! The word was ${gameState.targetWord}`, "error");
            showWinnerScreen(null, "You lost"); // Using the 'loser' parameter
        }
        document.querySelector('.key[data-key="Backspace"]').disabled = true;
    }

    updatePossibleWords();
}

function shakeRow(rowIndex) {
    const rowEl = document.getElementById(`row-${rowIndex}`);
    // When shaking, also remove the invalid class from the enter key after a delay
    // so the user knows they can try again.
    setTimeout(() => document.querySelector('.key[data-key="Enter"]')?.classList.remove('invalid'), 500);
    rowEl.classList.add('shake');
    rowEl.addEventListener('animationend', () => rowEl.classList.remove('shake'), { once: true });
}

function checkGuess(guess) {
    const target = appState.soloGameState.targetWord;
    const currentRow = appState.soloGameState.currentRow;
    const guessArray = guess.split('');
    const targetArray = target.split('');
    appState.soloGameState.guesses.push({ guess: guess, feedback: [] });
    const feedback = Array(5).fill(null);

    // First pass: Check for correct letters (green)
    for (let i = 0; i < 5; i++) {
        if (guessArray[i] === targetArray[i]) {
            feedback[i] = 'correct';
            targetArray[i] = null; // Mark as used
            appState.soloGameState.guesses[currentRow].feedback[i] = { letter: guessArray[i], status: 'correct' };
        }
    }

    // Second pass: Check for present letters (yellow)
    for (let i = 0; i < 5; i++) {
        if (feedback[i] === null) { // Only check letters not already marked 'correct'
            const targetIndex = targetArray.indexOf(guessArray[i]);
            if (targetIndex !== -1) {
                feedback[i] = 'present';
                targetArray[targetIndex] = null; // Mark as used
                appState.soloGameState.guesses[currentRow].feedback[i] = { letter: guessArray[i], status: 'present' };
            } else {
                feedback[i] = 'absent';
                appState.soloGameState.guesses[currentRow].feedback[i] = { letter: guessArray[i], status: 'absent' };
            }
        }
    }

    // Apply feedback with animation
    feedback.forEach((status, index) => {
        setTimeout(() => {
            const tileContainer = document.getElementById(`tile-${currentRow}-${index}`);
            const tile = tileContainer.querySelector('.wordle-tile');
            const frontFace = tile.querySelector('.front');
            const backFace = tile.querySelector('.back');
            
            frontFace.textContent = guessArray[index];
            backFace.textContent = guessArray[index];
            backFace.classList.add(status);
            tile.classList.add('flip');
            // After the animation, apply the class to the main tile so the color persists
            tile.addEventListener('transitionend', () => {
                tile.classList.add(status);
            }, { once: true });

            const key = document.querySelector(`.key[data-key="${guessArray[index]}"]`);
            if (key && !key.classList.contains('correct')) { // Don't downgrade a green key
                key.classList.add(status);
            }
        }, index * 300); // Stagger the flip animation
    });
}
export function getInitialState() {
    const difficulty = dom.difficultySelector.value;
    const targetWord = ANSWER_LIST[Math.floor(Math.random() * ANSWER_LIST.length)];
    return {
        targetWord: targetWord,
        guesses: [], // Array of submitted guesses with feedback
        currentRow: 0,
        currentCol: 0,
        gameOver: false,
        difficulty: difficulty
    };
}

function updatePossibleWords() {
    const gameState = appState.soloGameState;
    const container = document.getElementById('wordle-sidebar');
    const list = document.getElementById('wordle-possible-words-list');
    const hintButton = document.getElementById('wordle-hint-btn');

    container.classList.add('hidden');
    hintButton.classList.add('hidden');
    list.innerHTML = '';

    if (gameState.gameOver || gameState.difficulty === 'medium' || gameState.difficulty === 'hard') {
        if (gameState.difficulty === 'hard' && !gameState.gameOver) {
            hintButton.classList.remove('hidden');
        }
        return;
    }

    if (gameState.difficulty === 'easy') {
        hintButton.classList.remove('hidden');
    }

    const guessesToUse = gameState.difficulty === 'very-easy' ? gameState.guesses : gameState.guesses.slice(-1);
    if (guessesToUse.length === 0) return;

    const possibleWords = filterWordList(guessesToUse);

    list.innerHTML = ''; // Clear existing list
    possibleWords.forEach(word => {
        const li = document.createElement('li');
        li.textContent = word;
        li.onclick = () => speakWord(word);
        list.appendChild(li);
    });
    container.classList.remove('hidden');
}

function filterWordList(guesses) {
    const knownCorrect = {}; // { 0: 'A', 2: 'E' }
    const knownPresent = new Set(); // { 'R', 'T' }
    const knownAbsent = new Set(); // { 'S', 'O', 'U' }

    guesses.forEach(guessInfo => {
        guessInfo.feedback.forEach((fb, index) => {
            if (fb.status === 'correct') {
                knownCorrect[index] = fb.letter;
            } else if (fb.status === 'present') {
                knownPresent.add(fb.letter);
            } else if (fb.status === 'absent') {
                knownAbsent.add(fb.letter);
            }
        });
    });

    return Array.from(VALID_GUESSES).filter(word => {
        // Rule 1: Must match all correct letters in the right positions
        for (const pos in knownCorrect) {
            if (word[pos] !== knownCorrect[pos]) return false;
        }

        // Rule 2: Must contain all present letters
        for (const letter of knownPresent) {
            if (!word.includes(letter)) return false;
        }

        // Rule 3: Must not contain any absent letters (unless they are also present/correct)
        for (const letter of knownAbsent) {
            if (word.includes(letter) && ![...Object.values(knownCorrect), ...knownPresent].includes(letter)) {
                return false;
            }
        }

        return true;
    }).sort(); // Sort the final list alphabetically
}

function showHint() {
    const gameState = appState.soloGameState;
    if (gameState.difficulty === 'easy') {
        // Show the "very-easy" list (all guesses)
        const possibleWords = filterWordList(gameState.guesses);
        const list = document.getElementById('wordle-possible-words-list');
        list.innerHTML = ''; // Clear existing list
        possibleWords.forEach(word => {
            const li = document.createElement('li');
            li.textContent = word;
            li.onclick = () => speakWord(word);
            list.appendChild(li);
        });
        document.getElementById('wordle-sidebar').classList.remove('hidden');
    } else if (gameState.difficulty === 'hard') {
        // Reveal a correct letter the player hasn't found yet
        const guessedLetters = new Set(gameState.guesses.flatMap(g => g.guess.split('')));
        const unguessedCorrectLetter = gameState.targetWord.split('').find(letter => !guessedLetters.has(letter));
        if (unguessedCorrectLetter) {
            showToast(`Hint: The word contains the letter '${unguessedCorrectLetter}'.`, 'info');
        } else {
            showToast("No more letters to reveal!", 'info');
        }
    }
}

export function loadPuzzle() {
    appState.winner = null;
    appState.soloGameState = getInitialState();
    createGrid();
}

// Placeholder functions for multiplayer
export function processMove(moveData) {
    // To be implemented
}

export function processUIUpdate(data) {
    // To be implemented
}

export function updateGridForTeam(teamName) {
    // To be implemented
}