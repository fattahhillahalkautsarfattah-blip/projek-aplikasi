/**
 * db.js - IndexedDB storage wrapper for Alarm App
 * Conforms to PRD Section 6 specification:
 * Database: alarm-app (v1)
 * Object Stores: alarms, sounds, history
 */

const DB_NAME = 'alarm-app';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initializes and returns the IndexedDB database instance
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
    if (dbInstance) {
        return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('Browser ini tidak mendukung IndexedDB. Silakan gunakan browser modern.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 1. Store: alarms
            if (!db.objectStoreNames.contains('alarms')) {
                const alarmStore = db.createObjectStore('alarms', { keyPath: 'id', autoIncrement: true });
                alarmStore.createIndex('enabled', 'enabled', { unique: false });
                alarmStore.createIndex('time', 'time', { unique: false });
            }

            // 2. Store: sounds
            if (!db.objectStoreNames.contains('sounds')) {
                db.createObjectStore('sounds', { keyPath: 'id', autoIncrement: true });
            }

            // 3. Store: history
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
            console.error('IndexedDB error:', event.target.error);
            reject(new Error('Gagal membuka database lokal: ' + (event.target.error?.message || 'Unknown error')));
        };
    });
}

/**
 * Helper to execute a transaction
 */
function getTransaction(storeName, mode = 'readonly') {
    return initDB().then(db => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        return { tx, store };
    });
}

// ================= ALARMS OPERATIONS =================

/**
 * Retrieve all alarms, sorted by time (HH:MM)
 * @returns {Promise<Array>}
 */
export async function getAllAlarms() {
    const { store } = await getTransaction('alarms', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const alarms = request.result || [];
            // Sort by time ascending
            alarms.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            resolve(alarms);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get single alarm by ID
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function getAlarm(id) {
    const { store } = await getTransaction('alarms', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(Number(id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Add a new alarm
 * @param {Object} alarmData
 * @returns {Promise<number>} ID of created alarm
 */
export async function addAlarm(alarmData) {
    const { store, tx } = await getTransaction('alarms', 'readwrite');
    const record = {
        label: alarmData.label?.trim() || 'Alarm',
        time: alarmData.time, // HH:MM
        days: Array.isArray(alarmData.days) ? alarmData.days : [], // [0..6] or []
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
        request.onerror = (e) => reject(request.error);
    });
}

/**
 * Update an existing alarm
 * @param {Object} alarmData
 * @returns {Promise<void>}
 */
export async function updateAlarm(alarmData) {
    const oldAlarm = await getAlarm(alarmData.id);
    const { store } = await getTransaction('alarms', 'readwrite');
    
    return new Promise((resolve, reject) => {
        const updated = {
            ...oldAlarm,
            ...alarmData,
            id: Number(alarmData.id)
        };
        const request = store.put(updated);
        request.onsuccess = async () => {
            // If sound was replaced, clean up orphan sounds
            if (oldAlarm && oldAlarm.soundId && oldAlarm.soundId !== updated.soundId) {
                await cleanupOrphanSounds().catch(console.warn);
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete an alarm by ID
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteAlarm(id) {
    const alarm = await getAlarm(id);
    const { store } = await getTransaction('alarms', 'readwrite');
    
    return new Promise((resolve, reject) => {
        const request = store.delete(Number(id));
        request.onsuccess = async () => {
            // FR-03: Menghapus alarm juga menghapus MP3 miliknya bila tidak dipakai alarm lain
            if (alarm && alarm.soundId) {
                await cleanupOrphanSounds().catch(console.warn);
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// ================= SOUNDS (MP3) OPERATIONS =================

/**
 * Save audio Blob to store `sounds`
 * @param {Blob|File} file
 * @param {string} name
 * @returns {Promise<number>} soundId
 */
export async function saveSound(file, name) {
    // Validate file size (10 MB max according to FR-04)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
        throw new Error('Ukuran file MP3 maksimal adalah 10 MB.');
    }

    const { store } = await getTransaction('sounds', 'readwrite');
    const record = {
        name: name || file.name || 'custom_sound.mp3',
        blob: file,
        size: file.size,
        createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
        try {
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                if (e.target.error?.name === 'QuotaExceededError') {
                    reject(new Error('Penyimpanan browser penuh. Hapus beberapa rekaman atau file audio.'));
                } else {
                    reject(request.error);
                }
            };
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Get audio Blob by sound ID
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function getSound(id) {
    if (!id) return null;
    const { store } = await getTransaction('sounds', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(Number(id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a sound by sound ID
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteSound(id) {
    const { store } = await getTransaction('sounds', 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(Number(id));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clean up sounds not referenced by any alarm (FR-03)
 */
export async function cleanupOrphanSounds() {
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

// ================= HISTORY OPERATIONS =================

/**
 * Record an alarm ring event
 * @param {Object} record { alarmId, alarmLabel, alarmTime, startedAt, endedAt, endReason }
 * endReason: 'dismissed' | 'snoozed' | 'auto-stopped' | 'missed'
 */
export async function addHistory(record) {
    const { store } = await getTransaction('history', 'readwrite');
    return new Promise((resolve, reject) => {
        const entry = {
            alarmId: record.alarmId,
            alarmLabel: record.alarmLabel || 'Alarm',
            alarmTime: record.alarmTime || '',
            startedAt: record.startedAt || Date.now(),
            endedAt: record.endedAt || Date.now(),
            endReason: record.endReason || 'dismissed', // 'dismissed' | 'snoozed' | 'auto-stopped' | 'missed'
            createdAt: Date.now()
        };
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get alarm ring history
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getHistory(limit = 50) {
    const { store } = await getTransaction('history', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const list = request.result || [];
            // Sort by startedAt descending (latest first)
            list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
            resolve(list.slice(0, limit));
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all history entries
 * @returns {Promise<void>}
 */
export async function clearHistory() {
    const { store } = await getTransaction('history', 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Expose on window object for compatibility
if (typeof window !== 'undefined') {
    window.AlarmDB = {
        initDB,
        getAllAlarms,
        getAlarm,
        addAlarm,
        updateAlarm,
        deleteAlarm,
        saveSound,
        getSound,
        deleteSound,
        cleanupOrphanSounds,
        addHistory,
        getHistory,
        clearHistory
    };
}

