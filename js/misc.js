// Function to play a simple beep sound
export function playBeepSound() {
    const audioContext = new(window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Connect the nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set the tone and duration
    oscillator.type = 'sine'; // A smooth tone
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz is A4
    gainNode.gain.setValueAtTime(1, audioContext.currentTime); // Start at full volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1); // Fade out quickly

    // Start and stop the oscillator
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

/**
 * Plays a slightly higher-pitched beep sound to indicate a remote move.
 */
export function playRemoteMoveSound() {
    const audioContext = new(window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Connect the nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set the tone and duration (higher pitch)
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime); // 660 Hz is E5
    gainNode.gain.setValueAtTime(0.8, audioContext.currentTime); // Slightly softer
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

//Creates QR code chunks with embedded index and total count.
export function createQrCodeChunks(data) {
    const MAX_CHUNK_SIZE = 128;
    const chunks = [];
    const totalChunks = Math.ceil(data.length / MAX_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
        const chunkData = data.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
        chunks.push(`[${i + 1}/${totalChunks}]:${chunkData}`);
    }
    return chunks;
}

// Function to clear the content of a specific textarea
export function clearTextbox(id) {
    const textarea = document.getElementById(id);
    if (textarea) {
        textarea.value = '';
    }
}

// Function to get a string without a prefix
export function removePrefix(str, prefix) {
  // Check if the string actually starts with the given prefix
  if (str.startsWith(prefix)) {
    // Return a new string from the end of the prefix
    return str.slice(prefix.length);
  }
  // If the prefix is not found, return the original string or handle the error
  return str;
}
