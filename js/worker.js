/**
 * worker.js - Background Web Worker Timer
 * Prevents browser background-tab timer throttling (PRD Section 9)
 */

let timerId = null;

self.onmessage = function (e) {
    if (e.data === 'start') {
        if (!timerId) {
            timerId = setInterval(() => {
                self.postMessage({ type: 'tick', timestamp: Date.now() });
            }, 1000);
        }
    } else if (e.data === 'stop') {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }
};

