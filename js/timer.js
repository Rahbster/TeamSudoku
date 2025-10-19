//==============================
// Timer Logic
//==============================
// This module manages the game timer, including starting, stopping, and formatting the display.

// State variables to hold the timer interval ID and the elapsed time in seconds.
let timerInterval = null;
let seconds = 0;

/**
 * Formats a total number of seconds into a MM:SS string.
 * @param {number} totalSeconds - The total seconds to format.
 * @returns {string} The formatted time string (e.g., "01:23").
 */
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Starts or restarts the game timer. It resets the elapsed time to zero
 * and updates the display every second.
 */
export function startTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    seconds = 0; // Reset the timer
    const timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return; // Guard against games without a timer

    // Use an IntersectionObserver to start the timer only when it's visible.
    const observer = new IntersectionObserver((entries) => {
        const timerEntry = entries[0];
        if (timerEntry.isIntersecting) {
            // Timer is visible, start the interval.
            if (!timerInterval) {
                timerDisplay.textContent = formatTime(seconds);
                timerInterval = setInterval(() => {
                    seconds++;
                    timerDisplay.textContent = formatTime(seconds);
                }, 1000);
            }
            // Once it's visible and started, we don't need to observe anymore.
            observer.unobserve(timerDisplay);
        }
    }, { threshold: 0.1 });

    // If the timer is already visible, the callback will fire immediately.
    // If not, it will wait until it becomes visible.
    observer.observe(timerDisplay);

    // Set initial display, which will be updated once visible.
    if (timerDisplay) {
        timerDisplay.textContent = formatTime(seconds);
    }
}

/**
 * Stops the game timer by clearing the interval.
 */
export function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}