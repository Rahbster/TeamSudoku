// A state variable to hold the timer ID and the elapsed time
let timerInterval = null;
let seconds = 0;

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
}

export function startTimer() {
    // Clear any existing timer to prevent duplicates
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    seconds = 0; // Reset the timer
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = formatTime(seconds);

    timerInterval = setInterval(() => {
        seconds++;
        timerDisplay.textContent = formatTime(seconds);
    }, 1000); // 1000 milliseconds = 1 second
}

export function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}