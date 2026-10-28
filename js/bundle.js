/**
 * bundle.js - Standalone Bundle for direct file:// protocol execution
 * Allows running by double-clicking index.html without local server CORS restrictions.
 */

(function () {
    console.log('🔄 Loading Standalone Alarm App Bundle...');

    // ==========================================
    // 1. DATABASE (db.js)
    // ==========================================
    const DB_NAME = 'alarm-app';
    const DB_VERSION = 1;
    let dbInstance = null;

    function initDB() {
        if (dbInstance) return Promise.resolve(dbInstance);
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('Browser ini tidak mendukung IndexedDB.'));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('alarms')) {
                    const alarmStore = db.createObjectStore('alarms', { keyPath: 'id', autoIncrement: true });
                    alarmStore.createIndex('enabled', 'enabled', { unique: false });
                    alarmStore.createIndex('time', 'time', { unique: false });
                }
                if (!db.objectStoreNames.contains('sounds')) {
                    db.createObjectStore('sounds', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                    historyStore.createIndex('alarmId', 'alarmId', { unique: false });
                    historyStore.createIndex('startedAt', 'startedAt', { unique: false });
                }
            };
            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };
            request.onerror = (event) => {
                reject(new Error('Gagal membuka IndexedDB: ' + (event.target.error?.message || 'Error')));
            };
        });
    }

    function getTransaction(storeName, mode = 'readonly') {
        return initDB().then(db => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            return { tx, store };
        });
    }

    async function getAllAlarms() {
        const { store } = await getTransaction('alarms', 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const alarms = request.result || [];
                alarms.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                resolve(alarms);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function getAlarm(id) {
        const { store } = await getTransaction('alarms', 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(Number(id));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function addAlarm(alarmData) {
        const { store } = await getTransaction('alarms', 'readwrite');
        const record = {
            label: alarmData.label?.trim() || 'Alarm',
            time: alarmData.time,
            days: Array.isArray(alarmData.days) ? alarmData.days : [],
            soundId: alarmData.soundId || null,
            soundName: alarmData.soundName || 'Default Chime',
            presetSound: alarmData.presetSound || null,
            enabled: alarmData.enabled !== undefined ? Boolean(alarmData.enabled) : true,
            snoozeMinutes: Number(alarmData.snoozeMinutes) || 5,
            lastTriggeredAt: null,
            createdAt: Date.now()
        };
        return new Promise((resolve, reject) => {
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function updateAlarm(alarmData) {
        const oldAlarm = await getAlarm(alarmData.id);
        const { store } = await getTransaction('alarms', 'readwrite');
        return new Promise((resolve, reject) => {
            const updated = { ...oldAlarm, ...alarmData, id: Number(alarmData.id) };
            const request = store.put(updated);
            request.onsuccess = async () => {
                if (oldAlarm?.soundId && oldAlarm.soundId !== updated.soundId) {
                    await cleanupOrphanSounds().catch(console.warn);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteAlarm(id) {
        const alarm = await getAlarm(id);
        const { store } = await getTransaction('alarms', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(Number(id));
            request.onsuccess = async () => {
                if (alarm?.soundId) {
                    await cleanupOrphanSounds().catch(console.warn);
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function saveSound(file, name) {
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) throw new Error('Ukuran file MP3 maksimal adalah 10 MB.');
        const { store } = await getTransaction('sounds', 'readwrite');
        const record = {
            name: name || file.name || 'custom_sound.mp3',
            blob: file,
            size: file.size,
            createdAt: Date.now()
        };
        return new Promise((resolve, reject) => {
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(request.error);
        });
    }

    async function getSound(id) {
        if (!id) return null;
        const { store } = await getTransaction('sounds', 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(Number(id));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteSound(id) {
        const { store } = await getTransaction('sounds', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(Number(id));
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function cleanupOrphanSounds() {
        const alarms = await getAllAlarms();
        const usedSoundIds = new Set(alarms.map(a => a.soundId).filter(Boolean));
        const { store } = await getTransaction('sounds', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = async () => {
                const allKeys = request.result || [];
                for (const key of allKeys) {
                    if (!usedSoundIds.has(key)) {
                        await deleteSound(key).catch(console.warn);
                    }
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function addHistory(record) {
        const { store } = await getTransaction('history', 'readwrite');
        return new Promise((resolve, reject) => {
            const entry = {
                alarmId: record.alarmId,
                alarmLabel: record.alarmLabel || 'Alarm',
                alarmTime: record.alarmTime || '',
                startedAt: record.startedAt || Date.now(),
                endedAt: record.endedAt || Date.now(),
                endReason: record.endReason || 'dismissed',
                createdAt: Date.now()
            };
            const request = store.add(entry);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getHistory(limit = 50) {
        const { store } = await getTransaction('history', 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const list = request.result || [];
                list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
                resolve(list.slice(0, limit));
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function clearHistory() {
        const { store } = await getTransaction('history', 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // 2. AUDIO PLAYER & AUTO-STOP (player.js)
    // ==========================================
    const AUTO_STOP_DURATION_MS = 30 * 60 * 1000;
    let audioContext = null;
    let currentAudioElement = null;
    let currentBlobUrl = null;
    let currentSynthInterval = null;
    let previewAudioElement = null;
    let previewBlobUrl = null;
    let previewSynthInterval = null;
    let autoStopTimer = null;
    let activeAlarm = null;
    let alarmStartedAt = null;
    let isRinging = false;
    let currentVolume = 0.9;

    function getAudioContext() {
        if (!audioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) audioContext = new AudioCtx();
        }
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(console.warn);
        }
        return audioContext;
    }

    async function unlockAudio() {
        try {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') await ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.001;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
            return true;
        } catch (e) {
            return false;
        }
    }

    function playSynthesizedTone(presetName = 'reimu_chime', loop = true) {
        const ctx = getAudioContext();
        if (!ctx) return null;
        let isPlaying = true;
        const activeNodes = [];

        const playSequence = () => {
            if (!isPlaying) return;
            const now = ctx.currentTime;
            if (presetName === 'reimu_chime') {
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
                for (let i = 0; i < 4; i++) {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const startTime = now + (i * 0.15);
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(1046.5, startTime);
                    gain.gain.setValueAtTime(0.25 * currentVolume, startTime);
                    gain.gain.linearRampToValueAtTime(0.001, startTime + 0.08);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + 0.09);
                    activeNodes.push(osc);
                }
            } else {
                const freqs = [523.25, 659.25, 783.99, 1046.5];
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
                if (isPlaying) playSequence();
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

    function startAlarm(alarm, soundBlob, onTickCallback, onAutoStopCallback) {
        stopAlarm('replaced');
        activeAlarm = alarm;
        isRinging = true;
        alarmStartedAt = Date.now();

        if (soundBlob && soundBlob.size > 0) {
            try {
                currentBlobUrl = URL.createObjectURL(soundBlob);
                currentAudioElement = new Audio(currentBlobUrl);
                currentAudioElement.loop = true;
                currentAudioElement.volume = currentVolume;
                currentAudioElement.play().catch(err => {
                    console.warn('Fallback to synth tone:', err);
                    const synth = playSynthesizedTone(alarm.presetSound || 'reimu_chime', true);
                    if (synth) currentSynthInterval = synth;
                });
            } catch (err) {
                const synth = playSynthesizedTone(alarm.presetSound || 'reimu_chime', true);
                if (synth) currentSynthInterval = synth;
            }
        } else {
            const synth = playSynthesizedTone(alarm.presetSound || 'reimu_chime', true);
            if (synth) currentSynthInterval = synth;
        }

        // FR-07 Auto-stop 30 menit
        const checkAutoStop = () => {
            if (!isRinging || !alarmStartedAt) return;
            const elapsed = Date.now() - alarmStartedAt;
            const remainingMs = Math.max(0, AUTO_STOP_DURATION_MS - elapsed);
            if (typeof onTickCallback === 'function') onTickCallback(remainingMs, elapsed);
            if (remainingMs <= 0) {
                const finishedAlarm = activeAlarm;
                const started = alarmStartedAt;
                stopAlarm('auto-stopped');
                if (typeof onAutoStopCallback === 'function') {
                    onAutoStopCallback(finishedAlarm, started, Date.now());
                }
            }
        };

        checkAutoStop();
        autoStopTimer = setInterval(checkAutoStop, 1000);
    }

    function stopAlarm(reason = 'dismissed') {
        if (!isRinging && !activeAlarm) return null;
        const ringSummary = {
            alarm: activeAlarm,
            startedAt: alarmStartedAt || Date.now(),
            endedAt: Date.now(),
            durationMs: alarmStartedAt ? Date.now() - alarmStartedAt : 0,
            reason
        };

        if (autoStopTimer) {
            clearInterval(autoStopTimer);
            autoStopTimer = null;
        }
        if (currentAudioElement) {
            try {
                currentAudioElement.pause();
                currentAudioElement.currentTime = 0;
                currentAudioElement.removeAttribute('src');
                currentAudioElement.load();
            } catch (e) {}
            currentAudioElement = null;
        }
        if (currentBlobUrl) {
            try { URL.revokeObjectURL(currentBlobUrl); } catch (e) {}
            currentBlobUrl = null;
        }
        if (currentSynthInterval) {
            try { currentSynthInterval.stop(); } catch (e) {}
            currentSynthInterval = null;
        }

        isRinging = false;
        activeAlarm = null;
        alarmStartedAt = null;
        return ringSummary;
    }

    function previewSound(soundBlob, presetName = 'reimu_chime', onEnded) {
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
                    const synth = playSynthesizedTone(presetName, false);
                    previewSynthInterval = synth;
                    setTimeout(() => {
                        stopPreview();
                        if (typeof onEnded === 'function') onEnded();
                    }, 3000);
                });
            } catch (e) {}
        } else {
            const synth = playSynthesizedTone(presetName, false);
            previewSynthInterval = synth;
            setTimeout(() => {
                stopPreview();
                if (typeof onEnded === 'function') onEnded();
            }, 3000);
        }
    }

    function stopPreview() {
        if (previewAudioElement) {
            try {
                previewAudioElement.pause();
                previewAudioElement.currentTime = 0;
                previewAudioElement.removeAttribute('src');
            } catch (e) {}
            previewAudioElement = null;
        }
        if (previewBlobUrl) {
            try { URL.revokeObjectURL(previewBlobUrl); } catch (e) {}
            previewBlobUrl = null;
        }
        if (previewSynthInterval) {
            try { previewSynthInterval.stop(); } catch (e) {}
            previewSynthInterval = null;
        }
    }

    function setVolume(vol) {
        currentVolume = Math.max(0, Math.min(1, Number(vol) || 0.8));
        if (currentAudioElement) currentAudioElement.volume = currentVolume;
        if (previewAudioElement) previewAudioElement.volume = currentVolume;
    }

    function getVolume() {
        return currentVolume;
    }

    // ==========================================
    // 3. SCHEDULER & TAB SYNC (scheduler.js)
    // ==========================================
    let alarmsCache = [];
    let snoozedAlarms = [];
    let ringingQueue = [];
    let fallbackInterval = null;
    let syncChannel = null;
    const tabId = 'tab_' + Math.random().toString(36).substr(2, 9);

    let onAlarmTriggerCallback = null;
    let onQueueUpdatedCallback = null;
    let onMissedAlarmsCallback = null;
    let onTickSecondCallback = null;

    function formatHHMM(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    async function initScheduler(callbacks = {}) {
        onAlarmTriggerCallback = callbacks.onAlarmTrigger || null;
        onQueueUpdatedCallback = callbacks.onQueueUpdated || null;
        onMissedAlarmsCallback = callbacks.onMissedAlarms || null;
        onTickSecondCallback = callbacks.onTickSecond || null;

        if ('BroadcastChannel' in window) {
            try {
                syncChannel = new BroadcastChannel('alarm_app_sync');
                syncChannel.onmessage = async (event) => {
                    const data = event.data;
                    if (!data) return;
                    if (data.type === 'DATA_CHANGED') {
                        await refreshAlarmsCache();
                        renderAlarms();
                    } else if (data.type === 'ALARM_DISMISSED_REMOTE') {
                        ringingQueue = ringingQueue.filter(a => a.id !== data.alarmId);
                    }
                };
            } catch (e) {}
        }

        await refreshAlarmsCache();
        checkMissedAlarms();

        if (fallbackInterval) clearInterval(fallbackInterval);
        fallbackInterval = setInterval(handleSecondTick, 1000);
    }

    function broadcastSync(type, payload = {}) {
        if (syncChannel) {
            try { syncChannel.postMessage({ type, sender: tabId, ...payload }); } catch (e) {}
        }
    }

    async function refreshAlarmsCache() {
        try { alarmsCache = await getAllAlarms(); } catch (e) {}
        return alarmsCache;
    }

    function handleSecondTick() {
        const now = new Date();
        const currentHHMM = formatHHMM(now);
        const currentDay = now.getDay();
        const currentMinuteKey = Math.floor(now.getTime() / 60000);

        try { localStorage.setItem('alarm_last_tick', Date.now().toString()); } catch (e) {}
        if (typeof onTickSecondCallback === 'function') onTickSecondCallback(now, currentHHMM);

        // Check Snoozes
        const readySnoozes = [];
        const remainingSnoozes = [];
        const nowTs = now.getTime();
        for (const item of snoozedAlarms) {
            if (nowTs >= item.triggerAt) readySnoozes.push(item.alarm);
            else remainingSnoozes.push(item);
        }
        snoozedAlarms = remainingSnoozes;
        for (const alarm of readySnoozes) enqueueAlarm(alarm);

        // Check Active Alarms
        for (const alarm of alarmsCache) {
            if (!alarm.enabled) continue;
            if (alarm.time !== currentHHMM) continue;
            const matchesDay = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(currentDay);
            if (!matchesDay) continue;

            const lastMinuteKey = alarm.lastTriggeredAt ? Math.floor(alarm.lastTriggeredAt / 60000) : 0;
            if (lastMinuteKey === currentMinuteKey) continue;

            alarm.lastTriggeredAt = now.getTime();
            updateAlarm({ id: alarm.id, lastTriggeredAt: alarm.lastTriggeredAt }).catch(console.error);
            enqueueAlarm(alarm);
        }
    }

    function enqueueAlarm(alarm) {
        if (ringingQueue.some(item => item.id === alarm.id)) return;
        ringingQueue.push(alarm);
        if (typeof onQueueUpdatedCallback === 'function') onQueueUpdatedCallback(ringingQueue);
        if (ringingQueue.length === 1 && typeof onAlarmTriggerCallback === 'function') {
            onAlarmTriggerCallback(alarm, ringingQueue);
        }
        showNotification(alarm);
    }

    async function handleAlarmDismissed(alarm, ringSession) {
        if (!alarm) return;
        await addHistory({
            alarmId: alarm.id,
            alarmLabel: alarm.label,
            alarmTime: alarm.time,
            startedAt: ringSession?.startedAt || Date.now(),
            endedAt: Date.now(),
            endReason: 'dismissed'
        }).catch(console.error);

        // FR-10: One-off alarm disables itself
        if (!alarm.days || alarm.days.length === 0) {
            alarm.enabled = false;
            await updateAlarm({ id: alarm.id, enabled: false }).catch(console.error);
            await refreshAlarmsCache();
            broadcastSync('DATA_CHANGED');
        }

        ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);
        broadcastSync('ALARM_DISMISSED_REMOTE', { alarmId: alarm.id });

        if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
            onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
        }
    }

    async function handleAlarmSnoozed(alarm, ringSession) {
        if (!alarm) return;
        const snoozeMins = Number(alarm.snoozeMinutes) || 5;
        const triggerAt = Date.now() + (snoozeMins * 60 * 1000);

        await addHistory({
            alarmId: alarm.id,
            alarmLabel: alarm.label,
            alarmTime: alarm.time,
            startedAt: ringSession?.startedAt || Date.now(),
            endedAt: Date.now(),
            endReason: 'snoozed'
        }).catch(console.error);

        snoozedAlarms = snoozedAlarms.filter(s => s.alarm.id !== alarm.id);
        snoozedAlarms.push({ alarm, triggerAt, snoozeMinutes: snoozeMins });

        ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);
        broadcastSync('ALARM_SNOOZED_REMOTE', { alarmId: alarm.id, triggerAt });

        if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
            onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
        }
    }

    async function handleAlarmAutoStopped(alarm, startedAt, endedAt) {
        if (!alarm) return;
        await addHistory({
            alarmId: alarm.id,
            alarmLabel: alarm.label,
            alarmTime: alarm.time,
            startedAt: startedAt || Date.now() - (30 * 60 * 1000),
            endedAt: endedAt || Date.now(),
            endReason: 'auto-stopped'
        }).catch(console.error);

        if (!alarm.days || alarm.days.length === 0) {
            alarm.enabled = false;
            await updateAlarm({ id: alarm.id, enabled: false }).catch(console.error);
            await refreshAlarmsCache();
            broadcastSync('DATA_CHANGED');
        }

        ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);
        if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
            onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
        }
    }

    async function checkMissedAlarms() {
        const lastTickStr = localStorage.getItem('alarm_last_tick');
        if (!lastTickStr) return;
        const lastTick = Number(lastTickStr);
        const now = Date.now();
        const elapsedMinutes = (now - lastTick) / (1000 * 60);

        if (elapsedMinutes >= 2 && elapsedMinutes <= 24 * 60) {
            const currentDate = new Date(now);
            const missed = [];
            for (const alarm of alarmsCache) {
                if (!alarm.enabled) continue;
                const [alarmH, alarmM] = alarm.time.split(':').map(Number);
                const scheduledToday = new Date(currentDate);
                scheduledToday.setHours(alarmH, alarmM, 0, 0);
                if (scheduledToday.getTime() > lastTick && scheduledToday.getTime() < now) {
                    const dayMatch = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(scheduledToday.getDay());
                    if (dayMatch) {
                        missed.push(alarm);
                        await addHistory({
                            alarmId: alarm.id,
                            alarmLabel: alarm.label,
                            alarmTime: alarm.time,
                            startedAt: scheduledToday.getTime(),
                            endedAt: scheduledToday.getTime(),
                            endReason: 'missed'
                        }).catch(console.error);
                        if (!alarm.days || alarm.days.length === 0) {
                            alarm.enabled = false;
                            await updateAlarm({ id: alarm.id, enabled: false }).catch(console.error);
                        }
                    }
                }
            }
            if (missed.length > 0 && typeof onMissedAlarmsCallback === 'function') {
                onMissedAlarmsCallback(missed);
            }
        }
    }

    async function requestNotificationPermission() {
        if (!('Notification' in window)) return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        return await Notification.requestPermission();
    }

    function showNotification(alarm) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            try {
                const notif = new Notification(`🔔 ALARM: ${alarm.time}`, {
                    body: `${alarm.label || 'Alarm berbunyi!'}\nKlik untuk mematikan atau tunda.`,
                    icon: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=128&auto=format&fit=crop',
                    tag: 'alarm-' + alarm.id,
                    requireInteraction: true
                });
                notif.onclick = () => { window.focus(); notif.close(); };
            } catch (e) {}
        }
    }

    // ==========================================
    // 4. USER INTERFACE (ui.js)
    // ==========================================
    const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const FULL_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    let currentFilter = 'all';
    let searchQuery = '';
    let editingAlarmId = null;
    let currentPreviewingId = null;
    let activeRingingAlarm = null;
    let titleBlinkInterval = null;
    const originalDocumentTitle = document.title || '拔剑 Sketon - Anime Alarm';
    let stagedSoundFile = null;
    let isAudioUnlocked = false;

    function initUI() {
        setupClock();
        setupEventListeners();
        setupDragAndDrop();
        renderAlarms();
        updateNextAlarmIndicator();
        updateStats();
    }

    function setupClock() {
        const clockEl = document.getElementById('hero-clock');
        const dateEl = document.getElementById('hero-date');
        const navClockEl = document.getElementById('nav-clock');

        const update = () => {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
            if (navClockEl) navClockEl.textContent = `${hh}:${mm}`;
            if (dateEl) {
                const dayName = FULL_DAY_NAMES[now.getDay()];
                const dayNum = now.getDate();
                const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
                dateEl.textContent = `${dayName}, ${dayNum} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
            }
        };
        update();
        setInterval(update, 1000);
    }

    function setupEventListeners() {
        document.addEventListener('click', async () => {
            if (!isAudioUnlocked) {
                const ok = await unlockAudio();
                if (ok) {
                    isAudioUnlocked = true;
                    updateAudioStatusPill(true);
                }
            }
        });

        const audioPill = document.getElementById('audio-unlock-pill');
        if (audioPill) {
            audioPill.addEventListener('click', async (e) => {
                e.stopPropagation();
                await unlockAudio();
                isAudioUnlocked = true;
                updateAudioStatusPill(true);
                showToast('Audio browser telah diaktifkan!', 'success');
            });
        }

        const notifBtn = document.getElementById('btn-request-notif');
        if (notifBtn) {
            notifBtn.addEventListener('click', async () => {
                const perm = await requestNotificationPermission();
                if (perm === 'granted') {
                    showToast('Izin notifikasi diberikan!', 'success');
                    notifBtn.classList.add('text-emerald-500');
                } else {
                    showToast('Notifikasi belum diizinkan.', 'warning');
                }
            });
        }

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = getVolume() * 100;
            volumeSlider.addEventListener('input', (e) => setVolume(e.target.value / 100));
        }

        const btnOpenAdd = document.getElementById('btn-add-alarm');
        const fabAdd = document.getElementById('fab-add-alarm');
        if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openAlarmModal());
        if (fabAdd) fabAdd.addEventListener('click', () => openAlarmModal());

        const btnCloseModal = document.getElementById('btn-close-modal');
        const btnCancelModal = document.getElementById('btn-cancel-modal');
        if (btnCloseModal) btnCloseModal.addEventListener('click', closeAlarmModal);
        if (btnCancelModal) btnCancelModal.addEventListener('click', closeAlarmModal);

        const alarmForm = document.getElementById('alarm-form');
        if (alarmForm) alarmForm.addEventListener('submit', handleAlarmFormSubmit);

        const filterButtons = document.querySelectorAll('[data-filter]');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('bg-red-500', 'text-white'));
                filterButtons.forEach(b => b.classList.add('bg-white', 'text-gray-600'));
                btn.classList.add('bg-red-500', 'text-white');
                btn.classList.remove('bg-white', 'text-gray-600');
                currentFilter = btn.dataset.filter;
                renderAlarms();
            });
        });

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.toLowerCase();
                renderAlarms();
            });
        }

        const btnOpenHistory = document.getElementById('btn-open-history');
        const btnCloseHistory = document.getElementById('btn-close-history');
        const btnClearHistory = document.getElementById('btn-clear-history');
        if (btnOpenHistory) btnOpenHistory.addEventListener('click', openHistoryModal);
        if (btnCloseHistory) btnCloseHistory.addEventListener('click', closeHistoryModal);
        if (btnClearHistory) {
            btnClearHistory.addEventListener('click', async () => {
                if (confirm('Hapus seluruh riwayat alarm?')) {
                    await clearHistory();
                    renderHistoryList();
                    updateStats();
                    showToast('Riwayat alarm telah dibersihkan.', 'info');
                }
            });
        }

        const btnDismiss = document.getElementById('btn-dismiss-ringing');
        const btnSnooze = document.getElementById('btn-snooze-ringing');
        if (btnDismiss) btnDismiss.addEventListener('click', dismissActiveRinging);
        if (btnSnooze) btnSnooze.addEventListener('click', snoozeActiveRinging);

        const btnPreviewForm = document.getElementById('btn-preview-form-sound');
        if (btnPreviewForm) btnPreviewForm.addEventListener('click', toggleFormSoundPreview);

        document.querySelectorAll('[data-time-offset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const minutesToAdd = parseInt(btn.dataset.timeOffset, 10);
                const timeInput = document.getElementById('alarm-time');
                if (timeInput) {
                    const target = new Date(Date.now() + minutesToAdd * 60 * 1000);
                    timeInput.value = formatHHMM(target);
                }
            });
        });

        const btnDaysAll = document.getElementById('btn-days-all');
        const btnDaysWork = document.getElementById('btn-days-work');
        const btnDaysOnce = document.getElementById('btn-days-once');
        if (btnDaysAll) btnDaysAll.addEventListener('click', () => setFormDays([0, 1, 2, 3, 4, 5, 6]));
        if (btnDaysWork) btnDaysWork.addEventListener('click', () => setFormDays([1, 2, 3, 4, 5]));
        if (btnDaysOnce) btnDaysOnce.addEventListener('click', () => setFormDays([]));

        const miniPlayBtn = document.getElementById('sidebar-mini-play');
        if (miniPlayBtn) {
            let isMiniPlaying = false;
            miniPlayBtn.addEventListener('click', async () => {
                await unlockAudio();
                if (isMiniPlaying) {
                    stopPreview();
                    miniPlayBtn.innerHTML = '<i class="fa-solid fa-play text-xs ml-0.5"></i>';
                    isMiniPlaying = false;
                } else {
                    miniPlayBtn.innerHTML = '<i class="fa-solid fa-stop text-xs"></i>';
                    isMiniPlaying = true;
                    previewSound(null, 'reimu_chime', () => {
                        miniPlayBtn.innerHTML = '<i class="fa-solid fa-play text-xs ml-0.5"></i>';
                        isMiniPlaying = false;
                    });
                }
            });
        }

        document.querySelectorAll('.day-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('bg-red-500');
                btn.classList.toggle('text-white');
                btn.classList.toggle('border-red-500');
                btn.classList.toggle('bg-gray-50');
                btn.classList.toggle('text-gray-600');
                btn.classList.toggle('border-gray-200');
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAlarmModal();
                closeHistoryModal();
            }
            if (activeRingingAlarm && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault();
                dismissActiveRinging();
            }
        });
    }

    function setupDragAndDrop() {
        const dropZone = document.getElementById('sound-drop-zone');
        const fileInput = document.getElementById('alarm-sound-file');
        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover'].forEach(name => {
            dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                dropZone.classList.add('border-red-500', 'bg-red-50/50');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-red-500', 'bg-red-50/50');
            });
        });
        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) handleSelectedSoundFile(files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (fileInput.files && fileInput.files.length > 0) handleSelectedSoundFile(fileInput.files[0]);
        });
    }

    function handleSelectedSoundFile(file) {
        const errorEl = document.getElementById('sound-file-error');
        const infoEl = document.getElementById('sound-file-info');
        const nameEl = document.getElementById('sound-file-name');
        const sizeEl = document.getElementById('sound-file-size');
        if (errorEl) errorEl.textContent = '';

        const MAX_SIZE = 10 * 1024 * 1024;
        const isMp3OrAudio = file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3');

        if (!isMp3OrAudio) {
            if (errorEl) errorEl.textContent = 'File harus berformat audio (.mp3). File lain ditolak.';
            showToast('Format file ditolak. Harap pilih file MP3.', 'error');
            return;
        }
        if (file.size > MAX_SIZE) {
            if (errorEl) errorEl.textContent = `Ukuran file (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas 10 MB.`;
            showToast('Ukuran file melebihi batas maksimal 10 MB.', 'error');
            return;
        }

        stagedSoundFile = file;
        if (infoEl) infoEl.classList.remove('hidden');
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

        const presetSelect = document.getElementById('alarm-preset-sound');
        if (presetSelect) presetSelect.value = 'custom';
        showToast(`File audio "${file.name}" siap disimpan.`, 'success');
    }

    async function renderAlarms() {
        const container = document.getElementById('alarms-list-container');
        const emptyState = document.getElementById('alarms-empty-state');
        if (!container) return;

        const alarms = await getAllAlarms();
        let filtered = alarms;
        if (currentFilter === 'active') filtered = alarms.filter(a => a.enabled);
        else if (currentFilter === 'inactive') filtered = alarms.filter(a => !a.enabled);

        if (searchQuery) {
            filtered = filtered.filter(a => 
                (a.label && a.label.toLowerCase().includes(searchQuery)) ||
                (a.time && a.time.includes(searchQuery)) ||
                (a.soundName && a.soundName.toLowerCase().includes(searchQuery))
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        container.innerHTML = filtered.map(alarm => {
            const daysHtml = DAY_NAMES.map((dName, idx) => {
                const isMatch = alarm.days && alarm.days.includes(idx);
                const cls = isMatch ? 'bg-red-500 text-white font-semibold' : 'bg-gray-100 text-gray-400';
                return `<span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${cls}">${dName}</span>`;
            }).join('');

            const isOnce = !alarm.days || alarm.days.length === 0;
            const recurrenceLabel = isOnce 
                ? '<span class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">Sekali Saja</span>'
                : (alarm.days.length === 7 
                    ? '<span class="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200">Setiap Hari</span>'
                    : '<span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200">Hari Tertentu</span>');

            const isCardActive = alarm.enabled;
            const soundLabel = alarm.soundName || (alarm.presetSound ? formatPresetName(alarm.presetSound) : 'Chime Bawaan');

            return `
                <article class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-50 dark:border-gray-700 p-5 card-hover transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${!isCardActive ? 'opacity-70 bg-gray-50/70 dark:bg-gray-900/40' : ''}" data-id="${alarm.id}">
                    <div class="flex items-start sm:items-center space-x-4">
                        <div class="text-center min-w-[90px]">
                            <span class="text-3xl sm:text-4xl font-black ${isCardActive ? 'text-red-500' : 'text-gray-400'} tracking-tight font-mono">
                                ${alarm.time}
                            </span>
                            <div class="text-[11px] font-medium text-gray-400 mt-0.5">
                                ${formatAmPm(alarm.time)}
                            </div>
                        </div>

                        <div class="space-y-1.5 flex-1">
                            <div class="flex items-center space-x-2 flex-wrap gap-y-1">
                                <h3 class="font-bold text-base text-gray-800 dark:text-white">${escapeHtml(alarm.label || 'Alarm')}</h3>
                                ${recurrenceLabel}
                            </div>
                            <div class="flex items-center space-x-1 pt-1">
                                ${daysHtml}
                            </div>
                            <div class="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 pt-1">
                                <span class="flex items-center space-x-1 bg-red-50/80 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-lg border border-red-100 dark:border-red-900/40">
                                    <i class="fa-solid fa-music text-[10px]"></i>
                                    <span class="truncate max-w-[150px] sm:max-w-[200px]">${escapeHtml(soundLabel)}</span>
                                </span>
                                <button class="btn-card-preview p-1 text-gray-400 hover:text-red-500 transition-colors" data-alarm-id="${alarm.id}" title="Dengarkan Nada">
                                    <i class="fa-solid fa-volume-high text-xs"></i>
                                </button>
                                <span class="text-[11px] text-gray-400">· Tunda: ${alarm.snoozeMinutes || 5} mnt</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between md:justify-end space-x-4 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-700">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer alarm-toggle-switch" data-id="${alarm.id}" ${isCardActive ? 'checked' : ''}>
                            <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500 shadow-inner"></div>
                        </label>

                        <button class="btn-edit-alarm p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer" data-id="${alarm.id}" title="Ubah Alarm">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>

                        <button class="btn-test-ring p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer" data-id="${alarm.id}" title="Uji Bunyi Sekarang">
                            <i class="fa-solid fa-bell"></i>
                        </button>

                        <button class="btn-delete-alarm p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer" data-id="${alarm.id}" title="Hapus Alarm">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        bindAlarmCardEvents();
        updateNextAlarmIndicator();
        updateStats();
    }

    function bindAlarmCardEvents() {
        document.querySelectorAll('.alarm-toggle-switch').forEach(switchEl => {
            switchEl.addEventListener('change', async (e) => {
                const id = Number(e.target.dataset.id);
                const enabled = e.target.checked;
                await updateAlarm({ id, enabled });
                await refreshAlarmsCache();
                broadcastSync('DATA_CHANGED');
                renderAlarms();
                showToast(`Alarm ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`, 'info');
            });
        });

        document.querySelectorAll('.btn-edit-alarm').forEach(btn => {
            btn.addEventListener('click', () => openAlarmModal(Number(btn.dataset.id)));
        });

        document.querySelectorAll('.btn-delete-alarm').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.id);
                const alarm = await getAlarm(id);
                if (!alarm) return;
                if (confirm(`Hapus alarm "${alarm.label || alarm.time}"? Nada yang tidak dipakai alarm lain akan dibersihkan.`)) {
                    await deleteAlarm(id);
                    await refreshAlarmsCache();
                    broadcastSync('DATA_CHANGED');
                    renderAlarms();
                    showToast('Alarm berhasil dihapus.', 'success');
                }
            });
        });

        document.querySelectorAll('.btn-test-ring').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.id);
                const alarm = await getAlarm(id);
                if (alarm) {
                    await unlockAudio();
                    triggerAlarmOverlay(alarm);
                }
            });
        });

        document.querySelectorAll('.btn-card-preview').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.alarmId);
                const icon = btn.querySelector('i');
                if (currentPreviewingId === id) {
                    stopPreview();
                    currentPreviewingId = null;
                    icon.className = 'fa-solid fa-volume-high text-xs';
                } else {
                    stopPreview();
                    document.querySelectorAll('.btn-card-preview i').forEach(ic => ic.className = 'fa-solid fa-volume-high text-xs');
                    currentPreviewingId = id;
                    icon.className = 'fa-solid fa-stop text-xs text-red-500';

                    const alarm = await getAlarm(id);
                    let soundBlob = null;
                    if (alarm?.soundId) {
                        const sound = await getSound(alarm.soundId);
                        soundBlob = sound?.blob;
                    }
                    previewSound(soundBlob, alarm?.presetSound || 'reimu_chime', () => {
                        icon.className = 'fa-solid fa-volume-high text-xs';
                        currentPreviewingId = null;
                    });
                }
            });
        });
    }

    async function openAlarmModal(editId = null) {
        editingAlarmId = editId;
        stagedSoundFile = null;
        const modal = document.getElementById('alarm-modal');
        const modalTitle = document.getElementById('modal-title');
        const form = document.getElementById('alarm-form');
        const timeInput = document.getElementById('alarm-time');
        const labelInput = document.getElementById('alarm-label');
        const snoozeSelect = document.getElementById('alarm-snooze');
        const presetSelect = document.getElementById('alarm-preset-sound');
        const soundInfo = document.getElementById('sound-file-info');
        const soundError = document.getElementById('sound-file-error');

        if (!modal) return;
        if (soundError) soundError.textContent = '';
        if (soundInfo) soundInfo.classList.add('hidden');

        if (editId) {
            modalTitle.textContent = 'Ubah Alarm';
            const alarm = await getAlarm(editId);
            if (alarm) {
                timeInput.value = alarm.time;
                labelInput.value = alarm.label || '';
                snoozeSelect.value = alarm.snoozeMinutes || 5;
                setFormDays(alarm.days || []);
                if (alarm.soundId) {
                    presetSelect.value = 'custom';
                    const sound = await getSound(alarm.soundId);
                    if (sound && soundInfo) {
                        soundInfo.classList.remove('hidden');
                        document.getElementById('sound-file-name').textContent = sound.name;
                        document.getElementById('sound-file-size').textContent = `${(sound.size / (1024 * 1024)).toFixed(2)} MB`;
                    }
                } else {
                    presetSelect.value = alarm.presetSound || 'reimu_chime';
                }
            }
        } else {
            modalTitle.textContent = 'Tambah Alarm Baru';
            form.reset();
            const defaultTime = new Date(Date.now() + 5 * 60 * 1000);
            timeInput.value = formatHHMM(defaultTime);
            labelInput.value = '';
            snoozeSelect.value = '5';
            presetSelect.value = 'reimu_chime';
            setFormDays([0, 1, 2, 3, 4, 5, 6]);
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        timeInput.focus();
    }

    function closeAlarmModal() {
        stopPreview();
        const modal = document.getElementById('alarm-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        editingAlarmId = null;
        stagedSoundFile = null;
    }

    function setFormDays(daysArray) {
        document.querySelectorAll('.day-toggle-btn').forEach(btn => {
            const dayVal = Number(btn.dataset.day);
            if (daysArray.includes(dayVal)) {
                btn.classList.add('bg-red-500', 'text-white', 'border-red-500');
                btn.classList.remove('bg-gray-50', 'text-gray-600', 'border-gray-200');
            } else {
                btn.classList.remove('bg-red-500', 'text-white', 'border-red-500');
                btn.classList.add('bg-gray-50', 'text-gray-600', 'border-gray-200');
            }
        });
    }

    function getFormDays() {
        const selected = [];
        document.querySelectorAll('.day-toggle-btn').forEach(btn => {
            if (btn.classList.contains('bg-red-500')) selected.push(Number(btn.dataset.day));
        });
        return selected;
    }

    async function handleAlarmFormSubmit(e) {
        e.preventDefault();
        const timeInput = document.getElementById('alarm-time');
        const labelInput = document.getElementById('alarm-label');
        const snoozeSelect = document.getElementById('alarm-snooze');
        const presetSelect = document.getElementById('alarm-preset-sound');

        const time = timeInput.value;
        if (!time) {
            showToast('Waktu alarm wajib diisi.', 'error');
            return;
        }

        const label = labelInput.value.trim() || 'Alarm';
        const days = getFormDays();
        const snoozeMinutes = Number(snoozeSelect.value) || 5;
        const selectedPreset = presetSelect.value;

        let soundId = null;
        let soundName = 'Chime Reimu';
        let presetSound = 'reimu_chime';

        try {
            if (stagedSoundFile) {
                soundId = await saveSound(stagedSoundFile, stagedSoundFile.name);
                soundName = stagedSoundFile.name;
                presetSound = null;
            } else if (editingAlarmId) {
                const existing = await getAlarm(editingAlarmId);
                if (selectedPreset === 'custom' && existing?.soundId) {
                    soundId = existing.soundId;
                    soundName = existing.soundName;
                    presetSound = null;
                } else {
                    presetSound = selectedPreset;
                    soundName = formatPresetName(selectedPreset);
                }
            } else {
                presetSound = selectedPreset;
                soundName = formatPresetName(selectedPreset);
            }

            const alarmData = {
                time,
                label,
                days,
                soundId,
                soundName,
                presetSound,
                snoozeMinutes,
                enabled: true
            };

            if (editingAlarmId) {
                await updateAlarm({ id: editingAlarmId, ...alarmData });
                showToast('Alarm berhasil diperbarui.', 'success');
            } else {
                await addAlarm(alarmData);
                showToast('Alarm baru berhasil disimpan!', 'success');
            }

            await refreshAlarmsCache();
            broadcastSync('DATA_CHANGED');
            closeAlarmModal();
            renderAlarms();
        } catch (err) {
            showToast('Gagal menyimpan alarm: ' + err.message, 'error');
        }
    }

    async function toggleFormSoundPreview() {
        const btn = document.getElementById('btn-preview-form-sound');
        const presetSelect = document.getElementById('alarm-preset-sound');
        const icon = btn.querySelector('i');
        await unlockAudio();

        if (btn.dataset.playing === 'true') {
            stopPreview();
            btn.dataset.playing = 'false';
            icon.className = 'fa-solid fa-play mr-1.5';
        } else {
            btn.dataset.playing = 'true';
            icon.className = 'fa-solid fa-stop mr-1.5 text-red-500';

            let blob = stagedSoundFile || null;
            if (!blob && editingAlarmId && presetSelect.value === 'custom') {
                const current = await getAlarm(editingAlarmId);
                if (current?.soundId) {
                    const s = await getSound(current.soundId);
                    blob = s?.blob;
                }
            }

            previewSound(blob, presetSelect.value, () => {
                btn.dataset.playing = 'false';
                icon.className = 'fa-solid fa-play mr-1.5';
            });
        }
    }

    async function triggerAlarmOverlay(alarm, queue = []) {
        activeRingingAlarm = alarm;
        const overlay = document.getElementById('ringing-overlay');
        const timeEl = document.getElementById('ringing-time');
        const labelEl = document.getElementById('ringing-label');
        const countdownEl = document.getElementById('ringing-countdown');
        const queueEl = document.getElementById('ringing-queue-badge');

        if (timeEl) timeEl.textContent = alarm.time;
        if (labelEl) labelEl.textContent = alarm.label || 'Waktunya Bangun!';

        if (queueEl) {
            if (queue && queue.length > 1) {
                queueEl.classList.remove('hidden');
                queueEl.textContent = `Alarm 1 dari ${queue.length} antrean bersamaan`;
            } else {
                queueEl.classList.add('hidden');
            }
        }

        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        startTitleBlink(alarm);

        let soundBlob = null;
        if (alarm.soundId) {
            const sound = await getSound(alarm.soundId);
            soundBlob = sound?.blob || null;
        }

        startAlarm(
            alarm,
            soundBlob,
            (remainingMs) => {
                if (countdownEl) {
                    const totalSec = Math.floor(remainingMs / 1000);
                    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
                    const ss = String(totalSec % 60).padStart(2, '0');
                    countdownEl.textContent = `Berhenti otomatis dalam: ${mm}:${ss}`;
                }
            },
            async (stoppedAlarm, startedAt, endedAt) => {
                closeRingingOverlay();
                showToast(`Alarm "${stoppedAlarm.label}" berhenti otomatis setelah 30 menit.`, 'info');
                await handleAlarmAutoStopped(stoppedAlarm, startedAt, endedAt);
                renderAlarms();
            }
        );
    }

    async function dismissActiveRinging() {
        if (!activeRingingAlarm) return;
        const alarm = activeRingingAlarm;
        const ringSession = stopAlarm('dismissed');
        closeRingingOverlay();
        showToast(`Alarm "${alarm.label || alarm.time}" dimatikan.`, 'success');
        await handleAlarmDismissed(alarm, ringSession);
        renderAlarms();
    }

    async function snoozeActiveRinging() {
        if (!activeRingingAlarm) return;
        const alarm = activeRingingAlarm;
        const ringSession = stopAlarm('snoozed');
        closeRingingOverlay();
        const snoozeMins = alarm.snoozeMinutes || 5;
        showToast(`Alarm ditunda selama ${snoozeMins} menit.`, 'info');
        await handleAlarmSnoozed(alarm, ringSession);
        renderAlarms();
    }

    function closeRingingOverlay() {
        const overlay = document.getElementById('ringing-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
        stopTitleBlink();
        activeRingingAlarm = null;
    }

    function startTitleBlink(alarm) {
        stopTitleBlink();
        let state = false;
        titleBlinkInterval = setInterval(() => {
            document.title = state ? `🔔 [${alarm.time}] ALARM BERBUNYI!` : `⏰ ${alarm.label || 'Waktunya Bangun!'}`;
            state = !state;
        }, 700);
    }

    function stopTitleBlink() {
        if (titleBlinkInterval) {
            clearInterval(titleBlinkInterval);
            titleBlinkInterval = null;
        }
        document.title = originalDocumentTitle;
    }

    async function openHistoryModal() {
        const modal = document.getElementById('history-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            await renderHistoryList();
        }
    }

    function closeHistoryModal() {
        const modal = document.getElementById('history-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    async function renderHistoryList() {
        const container = document.getElementById('history-list-container');
        const empty = document.getElementById('history-empty-state');
        if (!container) return;

        const list = await getHistory(50);
        if (list.length === 0) {
            container.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');

        container.innerHTML = list.map(item => {
            const dateObj = new Date(item.startedAt);
            const dateFormatted = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()} ${formatHHMM(dateObj)}`;
            let badge = '';
            if (item.endReason === 'dismissed') {
                badge = '<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-medium">Dimatikan Manual</span>';
            } else if (item.endReason === 'snoozed') {
                badge = '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium">Ditunda (Snooze)</span>';
            } else if (item.endReason === 'auto-stopped') {
                badge = '<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full text-xs font-medium">Berhenti Otomatis (30 Mnt)</span>';
            } else {
                badge = '<span class="bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-medium">Terlewat</span>';
            }

            return `
                <div class="p-3.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-between text-xs border border-gray-100 dark:border-gray-700">
                    <div class="space-y-0.5">
                        <div class="font-bold text-gray-800 dark:text-white text-sm flex items-center space-x-2">
                            <span>${escapeHtml(item.alarmLabel)}</span>
                            <span class="text-xs text-gray-400 font-mono">(${item.alarmTime || '-'})</span>
                        </div>
                        <div class="text-gray-400">${dateFormatted}</div>
                    </div>
                    <div>${badge}</div>
                </div>
            `;
        }).join('');
    }

    function showMissedAlarmsBanner(missedList) {
        const banner = document.getElementById('missed-alarms-banner');
        const textEl = document.getElementById('missed-alarms-text');
        if (!banner || !missedList || missedList.length === 0) return;
        if (textEl) {
            textEl.textContent = `Ada ${missedList.length} alarm yang terlewat saat browser tertutup (${missedList.map(a => a.time).join(', ')}). Alarm telah dicatat ke riwayat.`;
        }
        banner.classList.remove('hidden');
        const btnDismissBanner = document.getElementById('btn-dismiss-missed-banner');
        if (btnDismissBanner) btnDismissBanner.onclick = () => banner.classList.add('hidden');
    }

    async function updateStats() {
        const alarms = await getAllAlarms();
        const history = await getHistory(100);
        const totalEl = document.getElementById('stat-total-alarms');
        const activeEl = document.getElementById('stat-active-alarms');
        const historyEl = document.getElementById('stat-total-history');
        if (totalEl) totalEl.textContent = alarms.length;
        if (activeEl) activeEl.textContent = alarms.filter(a => a.enabled).length;
        if (historyEl) historyEl.textContent = history.length;
    }

    async function updateNextAlarmIndicator() {
        const labelEl = document.getElementById('next-alarm-countdown');
        if (!labelEl) return;
        const alarms = await getAllAlarms();
        const activeAlarms = alarms.filter(a => a.enabled);
        if (activeAlarms.length === 0) {
            labelEl.textContent = 'Tidak ada alarm aktif';
            return;
        }

        const now = new Date();
        let minDiffMs = Infinity;
        let nextAlarm = null;

        for (const alarm of activeAlarms) {
            const [ah, am] = alarm.time.split(':').map(Number);
            for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
                const candidate = new Date(now);
                candidate.setDate(now.getDate() + dayOffset);
                candidate.setHours(ah, am, 0, 0);
                if (candidate.getTime() <= now.getTime()) continue;
                const matchesDay = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(candidate.getDay());
                if (matchesDay) {
                    const diff = candidate.getTime() - now.getTime();
                    if (diff < minDiffMs) {
                        minDiffMs = diff;
                        nextAlarm = { alarm, time: candidate };
                    }
                    break;
                }
            }
        }

        if (nextAlarm) {
            const totalMinutes = Math.floor(minDiffMs / (1000 * 60));
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            let diffStr = '';
            if (hours > 0) diffStr += `${hours} jam `;
            diffStr += `${mins} menit`;
            labelEl.textContent = `Berikutnya: ${nextAlarm.alarm.time} (${diffStr} lagi)`;
        } else {
            labelEl.textContent = 'Tidak ada alarm terjadwal';
        }
    }

    function updateAudioStatusPill(unlocked) {
        const pill = document.getElementById('audio-unlock-pill');
        if (!pill) return;
        if (unlocked) {
            pill.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-emerald-600 font-semibold text-xs">Audio Siap</span>
            `;
            pill.classList.remove('bg-amber-50', 'border-amber-200');
            pill.classList.add('bg-emerald-50', 'border-emerald-200');
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        const colors = {
            success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
            error: 'bg-rose-50 border-rose-200 text-rose-800',
            warning: 'bg-amber-50 border-amber-200 text-amber-800',
            info: 'bg-white border-red-100 text-gray-800'
        };
        const icons = {
            success: 'fa-circle-check text-emerald-500',
            error: 'fa-triangle-exclamation text-rose-500',
            warning: 'fa-circle-exclamation text-amber-500',
            info: 'fa-bell text-red-500'
        };

        toast.className = `flex items-center space-x-3 p-3.5 rounded-2xl shadow-lg border text-xs font-medium transition-all duration-300 transform translate-y-4 opacity-0 ${colors[type] || colors.info}`;
        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info} text-base flex-shrink-0"></i>
            <span class="flex-1">${escapeHtml(message)}</span>
            <button class="text-gray-400 hover:text-gray-600 p-1"><i class="fa-solid fa-xmark"></i></button>
        `;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.remove('translate-y-4', 'opacity-0'));

        const close = () => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        };
        toast.querySelector('button').onclick = close;
        setTimeout(close, 4000);
    }

    function formatAmPm(hhmm) {
        if (!hhmm) return '';
        const [h, m] = hhmm.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
    }

    function formatPresetName(preset) {
        if (preset === 'reimu_chime') return 'Reimu Shrine Chime';
        if (preset === 'digital_beep') return 'Digital Cyber Beep';
        if (preset === 'morning_bell') return 'Morning Sunlight';
        return preset || 'Default Chime';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);
    }

    // ==========================================
    // 5. BOOTSTRAP INITIALIZATION
    // ==========================================
    async function seedInitialDataIfEmpty() {
        const existing = await getAllAlarms();
        if (existing.length === 0) {
            await addAlarm({
                time: '06:30',
                label: '🌅 Bangun Pagi & Journaling',
                days: [1, 2, 3, 4, 5],
                presetSound: 'morning_bell',
                soundName: 'Morning Sunlight Chime',
                snoozeMinutes: 5,
                enabled: true
            });
            await addAlarm({
                time: '08:00',
                label: '⚔️ Sesi Belajar & Hexo Coding',
                days: [1, 2, 3, 4, 5, 6],
                presetSound: 'reimu_chime',
                soundName: 'Reimu Shrine Chime',
                snoozeMinutes: 5,
                enabled: true
            });
            await addAlarm({
                time: '22:00',
                label: '🌙 Istirahat & Matikan Layar',
                days: [0, 1, 2, 3, 4, 5, 6],
                presetSound: 'digital_beep',
                soundName: 'Digital Cyber Beep',
                snoozeMinutes: 10,
                enabled: false
            });
        }
    }

    function setupThemeToggle() {
        const themeBtn = document.getElementById('btn-toggle-theme');
        const isDarkSaved = localStorage.getItem('alarm_theme') === 'dark';
        if (isDarkSaved) document.documentElement.classList.add('dark');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                const isDark = document.documentElement.classList.contains('dark');
                localStorage.setItem('alarm_theme', isDark ? 'dark' : 'light');
                showToast(`Mode ${isDark ? 'Gelap' : 'Terang'} diaktifkan.`, 'info');
            });
        }
    }

    async function bootstrap() {
        try {
            await initDB();
            await seedInitialDataIfEmpty();
            await initScheduler({
                onAlarmTrigger: (alarm, queue) => triggerAlarmOverlay(alarm, queue),
                onMissedAlarms: (missedList) => showMissedAlarmsBanner(missedList),
                onTickSecond: (now) => {
                    if (now.getSeconds() % 30 === 0) updateNextAlarmIndicator();
                }
            });
            initUI();
            setupThemeToggle();
            console.log('✅ Standalone bundle initialized successfully.');
        } catch (err) {
            console.error('Initialization error:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();

