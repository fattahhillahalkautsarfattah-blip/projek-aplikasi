/**
 * player.js - Audio player and 30-minute auto-stop engine
 * Conforms to PRD Section 4 (FR-05, FR-06, FR-07, FR-08, FR-09) and Section 9
 */

const AUTO_STOP_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

let audioContext = null;
let currentAudioElement = null;
let currentBlobUrl = null;
let currentSynthInterval = null;
let currentSynthNodes = [];

let previewAudioElement = null;
let previewBlobUrl = null;
let previewSynthInterval = null;

let autoStopTimer = null;
let activeAlarm = null;
let alarmStartedAt = null;
let isRinging = false;
let currentVolume = 0.9;

/**
 * Get or initialize Web Audio Context
 */
function getAudioContext() {
    if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioContext = new AudioCtx();
        }
    }
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(console.warn);
    }
    return audioContext;
}

/**
 * Unlock Audio Context on user interaction (PRD Section 9 Autoplay policy mitigation)
 */
export async function unlockAudio() {
    try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
        }
        // Play silent sound to warm up audio subsystem
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
        return true;
    } catch (e) {
        console.warn('AudioContext unlock failed:', e);
        return false;
    }
}

/**
 * Synthesizes built-in anime/chime alert tones via Web Audio API
 * @param {string} presetName 'reimu_chime' | 'digital_beep' | 'morning_bell'
 * @param {boolean} loop
 * @returns {Object} controls { stop() }
 */
function playSynthesizedTone(presetName = 'reimu_chime', loop = true) {
    const ctx = getAudioContext();
    if (!ctx) return null;

    let isPlaying = true;
    const activeNodes = [];

    const playSequence = () => {
        if (!isPlaying) return;
        const now = ctx.currentTime;

        if (presetName === 'reimu_chime') {
            // Melodic Japanese Touhou-inspired pentatonic bells (E5, G5, A5, B5, D6, E6)
            const notes = [
                { f: 659.25, time: 0, dur: 0.6 },
                { f: 783.99, time: 0.25, dur: 0.6 },
                { f: 880.00, time: 0.5, dur: 0.8 },
                { f: 987.77, time: 0.9, dur: 0.6 },
                { f: 1174.66, time: 1.15, dur: 0.6 },
                { f: 1318.51, time: 1.4, dur: 1.2 }
            ];

            notes.forEach(note => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(note.f, now + note.time);

                gain.gain.setValueAtTime(0.001, now + note.time);
                gain.gain.linearRampToValueAtTime(0.35 * currentVolume, now + note.time + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + note.time + note.dur);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now + note.time);
                osc.stop(now + note.time + note.dur);
                activeNodes.push(osc);
            });
        } else if (presetName === 'digital_beep') {
            // High-tempo digital alarm beeps
            for (let i = 0; i < 4; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const startTime = now + (i * 0.15);

                osc.type = 'square';
                osc.frequency.setValueAtTime(1046.5, startTime); // C6

                gain.gain.setValueAtTime(0.25 * currentVolume, startTime);
                gain.gain.linearRampToValueAtTime(0.001, startTime + 0.08);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + 0.09);
                activeNodes.push(osc);
            }
        } else {
            // Morning soft chord
            const freqs = [523.25, 659.25, 783.99, 1046.5]; // C Major
            freqs.forEach((f, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const startTime = now + (idx * 0.12);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, startTime);

                gain.gain.setValueAtTime(0.001, startTime);
                gain.gain.linearRampToValueAtTime(0.3 * currentVolume, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + 1.25);
                activeNodes.push(osc);
            });
        }
    };

    playSequence();

    let loopInterval = null;
    if (loop) {
        const intervalMs = presetName === 'reimu_chime' ? 2800 : presetName === 'digital_beep' ? 1200 : 2500;
        loopInterval = setInterval(() => {
            if (isPlaying) {
                playSequence();
            }
        }, intervalMs);
    }

    return {
        stop: () => {
            isPlaying = false;
            if (loopInterval) clearInterval(loopInterval);
            activeNodes.forEach(node => {
                try { node.stop(); } catch (e) {}
            });
            activeNodes.length = 0;
        }
    };
}

/**
 * Start ringing for an alarm
 * @param {Object} alarm The alarm entity
 * @param {Blob|null} soundBlob Audio blob from IndexedDB (or null if preset)
 * @param {Function} onTickCallback Called every second with remaining auto-stop ms
 * @param {Function} onAutoStopCallback Called when 30-minute auto-stop triggers
 */
export function startAlarm(alarm, soundBlob, onTickCallback, onAutoStopCallback) {
    // If already ringing, stop previous first
    stopAlarm('replaced');

    activeAlarm = alarm;
    isRinging = true;
    alarmStartedAt = Date.now();

    // 1. Play Audio (either MP3 blob or synthesized preset)
    if (soundBlob && soundBlob.size > 0) {
        try {
            currentBlobUrl = URL.createObjectURL(soundBlob);
            currentAudioElement = new Audio(currentBlobUrl);
            currentAudioElement.loop = true;
            currentAudioElement.volume = currentVolume;
            currentAudioElement.play().catch(err => {
                console.warn('Audio element play error, falling back to synth tone:', err);
                // Fallback to synth tone if browser blocks blob autoplay
                const synth = playSynthesizedTone(alarm.presetSound || 'reimu_chime', true);
                if (synth) currentSynthInterval = synth;
            });
        } catch (err) {
            console.error('Error creating object URL for sound blob:', err);
            const synth = playSynthesizedTone(alarm.presetSound || 'reimu_chime', true);
            if (synth) currentSynthInterval = synth;
        }
    } else {
        // Use synthesized tone
        const preset = alarm.presetSound || 'reimu_chime';
        const synth = playSynthesizedTone(preset, true);
        if (synth) currentSynthInterval = synth;
    }

    // 2. FR-07: Auto-stop 30 menit
    // Timer dihitung dari selisih waktu (Date.now() - alarmStartedAt)
    const checkAutoStop = () => {
        if (!isRinging || !alarmStartedAt) return;

        const elapsed = Date.now() - alarmStartedAt;
        const remainingMs = Math.max(0, AUTO_STOP_DURATION_MS - elapsed);

        if (typeof onTickCallback === 'function') {
            onTickCallback(remainingMs, elapsed);
        }

        if (remainingMs <= 0) {
            // Auto stop reached!
            console.log('Auto-stop 30 menit tercapai untuk alarm:', alarm.label);
            const finishedAlarm = activeAlarm;
            const started = alarmStartedAt;
            stopAlarm('auto-stopped');
            if (typeof onAutoStopCallback === 'function') {
                onAutoStopCallback(finishedAlarm, started, Date.now());
            }
        }
    };

    // Run first tick immediately
    checkAutoStop();

    // Check every second
    autoStopTimer = setInterval(checkAutoStop, 1000);
}

/**
 * Stop alarm audio and clear 30-minute auto-stop timer
 * @param {string} reason 'dismissed' | 'snoozed' | 'auto-stopped' | 'replaced'
 * @returns {Object|null} Ringing session details
 */
export function stopAlarm(reason = 'dismissed') {
    if (!isRinging && !activeAlarm) {
        return null;
    }

    const ringSummary = {
        alarm: activeAlarm,
        startedAt: alarmStartedAt || Date.now(),
        endedAt: Date.now(),
        durationMs: alarmStartedAt ? Date.now() - alarmStartedAt : 0,
        reason
    };

    // Clear auto-stop interval
    if (autoStopTimer) {
        clearInterval(autoStopTimer);
        autoStopTimer = null;
    }

    // Stop HTML Audio Element
    if (currentAudioElement) {
        try {
            currentAudioElement.pause();
            currentAudioElement.currentTime = 0;
            currentAudioElement.removeAttribute('src');
            currentAudioElement.load();
        } catch (e) {}
        currentAudioElement = null;
    }

    // Revoke Blob URL to free memory (PRD Section 6)
    if (currentBlobUrl) {
        try {
            URL.revokeObjectURL(currentBlobUrl);
        } catch (e) {}
        currentBlobUrl = null;
    }

    // Stop synthesized tone
    if (currentSynthInterval) {
        try {
            currentSynthInterval.stop();
        } catch (e) {}
        currentSynthInterval = null;
    }

    isRinging = false;
    activeAlarm = null;
    alarmStartedAt = null;

    return ringSummary;
}

/**
 * Preview sound before saving (FR-05)
 * @param {Blob|null} soundBlob
 * @param {string} presetName
 * @param {Function} onEnded
 */
export function previewSound(soundBlob, presetName = 'reimu_chime', onEnded) {
    stopPreview();

    if (soundBlob && soundBlob.size > 0) {
        try {
            previewBlobUrl = URL.createObjectURL(soundBlob);
            previewAudioElement = new Audio(previewBlobUrl);
            previewAudioElement.volume = currentVolume;
            previewAudioElement.onended = () => {
                stopPreview();
                if (typeof onEnded === 'function') onEnded();
            };
            previewAudioElement.play().catch(e => {
                console.warn('Preview blob play error:', e);
                // Fallback to synth preview
                const synth = playSynthesizedTone(presetName, false);
                previewSynthInterval = synth;
                setTimeout(() => {
                    stopPreview();
                    if (typeof onEnded === 'function') onEnded();
                }, 3000);
            });
        } catch (e) {
            console.error('Error previewing sound:', e);
        }
    } else {
        const synth = playSynthesizedTone(presetName, false);
        previewSynthInterval = synth;
        setTimeout(() => {
            stopPreview();
            if (typeof onEnded === 'function') onEnded();
        }, 3000);
    }
}

/**
 * Stop sound preview
 */
export function stopPreview() {
    if (previewAudioElement) {
        try {
            previewAudioElement.pause();
            previewAudioElement.currentTime = 0;
            previewAudioElement.removeAttribute('src');
        } catch (e) {}
        previewAudioElement = null;
    }
    if (previewBlobUrl) {
        try {
            URL.revokeObjectURL(previewBlobUrl);
        } catch (e) {}
        previewBlobUrl = null;
    }
    if (previewSynthInterval) {
        try {
            previewSynthInterval.stop();
        } catch (e) {}
        previewSynthInterval = null;
    }
}

/**
 * Set master volume (0.0 to 1.0)
 * @param {number} vol
 */
export function setVolume(vol) {
    currentVolume = Math.max(0, Math.min(1, Number(vol) || 0.8));
    if (currentAudioElement) {
        currentAudioElement.volume = currentVolume;
    }
    if (previewAudioElement) {
        previewAudioElement.volume = currentVolume;
    }
}

export function getVolume() {
    return currentVolume;
}

export function isCurrentlyRinging() {
    return isRinging;
}

export function getActiveAlarm() {
    return activeAlarm;
}

export function getAlarmStartedAt() {
    return alarmStartedAt;
}

if (typeof window !== 'undefined') {
    window.AlarmPlayer = {
        unlockAudio,
        startAlarm,
        stopAlarm,
        previewSound,
        stopPreview,
        setVolume,
        getVolume,
        isCurrentlyRinging,
        getActiveAlarm,
        getAlarmStartedAt
    };
}

