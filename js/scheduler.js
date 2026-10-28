/**
 * scheduler.js - Scheduling, tick management, concurrent alarm queue, and tab sync
 * Conforms to PRD Section 4 (FR-01, FR-06, FR-10, FR-11, FR-13, FR-14) and Section 7, 9
 */

import { getAllAlarms, updateAlarm, addHistory } from './db.js';

let alarmsCache = [];
let snoozedAlarms = []; // { alarm, triggerAt, snoozeMinutes }
let ringingQueue = []; // Queue for concurrent alarms (FR-11)
let worker = null;
let fallbackInterval = null;
let syncChannel = null;
let tabId = 'tab_' + Math.random().toString(36).substr(2, 9);
let isPrimaryTab = true;

// Callbacks
let onAlarmTriggerCallback = null;
let onQueueUpdatedCallback = null;
let onMissedAlarmsCallback = null;
let onTickSecondCallback = null;

/**
 * Initialize the Scheduler
 */
export async function initScheduler(callbacks = {}) {
    onAlarmTriggerCallback = callbacks.onAlarmTrigger || null;
    onQueueUpdatedCallback = callbacks.onQueueUpdated || null;
    onMissedAlarmsCallback = callbacks.onMissedAlarms || null;
    onTickSecondCallback = callbacks.onTickSecond || null;

    // 1. Initialize Inter-tab communication (BroadcastChannel)
    setupBroadcastChannel();

    // 2. Load alarms into memory cache
    await refreshAlarmsCache();

    // 3. FR-13: Detect missed alarms while app was closed
    checkMissedAlarms();

    // 4. Start 1-second tick via Web Worker (with fallback to setInterval)
    startTickEngine();
}

/**
 * Setup BroadcastChannel for cross-tab synchronization
 */
function setupBroadcastChannel() {
    if ('BroadcastChannel' in window) {
        try {
            syncChannel = new BroadcastChannel('alarm_app_sync');
            syncChannel.onmessage = async (event) => {
                const data = event.data;
                if (!data) return;

                if (data.type === 'DATA_CHANGED') {
                    await refreshAlarmsCache();
                } else if (data.type === 'ALARM_DISMISSED_REMOTE') {
                    // Remove from local queue if present
                    ringingQueue = ringingQueue.filter(a => a.id !== data.alarmId);
                    if (onQueueUpdatedCallback) onQueueUpdatedCallback(ringingQueue);
                } else if (data.type === 'ALARM_SNOOZED_REMOTE') {
                    // Sync snoozed list
                    snoozedAlarms = snoozedAlarms.filter(s => s.alarm.id !== data.alarmId);
                    if (onQueueUpdatedCallback) onQueueUpdatedCallback(ringingQueue);
                }
            };
        } catch (e) {
            console.warn('BroadcastChannel initialization error:', e);
        }
    }
}

/**
 * Broadcast event to other tabs
 */
export function broadcastSync(type, payload = {}) {
    if (syncChannel) {
        try {
            syncChannel.postMessage({ type, sender: tabId, ...payload });
        } catch (e) {}
    }
}

/**
 * Reload alarms from IndexedDB into memory
 */
export async function refreshAlarmsCache() {
    try {
        alarmsCache = await getAllAlarms();
    } catch (e) {
        console.error('Failed to refresh alarms cache:', e);
    }
    return alarmsCache;
}

export function getAlarmsCache() {
    return alarmsCache;
}

/**
 * Starts the 1-second ticker using Web Worker or setInterval fallback
 */
function startTickEngine() {
    // Try launching Web Worker
    let workerStarted = false;
    try {
        worker = new Worker('./js/worker.js');
        worker.onmessage = (e) => {
            if (e.data?.type === 'tick') {
                handleSecondTick();
            }
        };
        worker.postMessage('start');
        workerStarted = true;
    } catch (e) {
        console.warn('Web Worker could not be loaded directly (possibly file:// protocol). Falling back to setInterval:', e);
    }

    if (!workerStarted) {
        if (fallbackInterval) clearInterval(fallbackInterval);
        fallbackInterval = setInterval(handleSecondTick, 1000);
    }
}

/**
 * Executed every 1000ms
 */
function handleSecondTick() {
    const now = new Date();
    const currentHHMM = formatHHMM(now);
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const currentMinuteKey = Math.floor(now.getTime() / 60000);

    // Save timestamp for missed alarms detection
    try {
        localStorage.setItem('alarm_last_tick', Date.now().toString());
    } catch (e) {}

    if (typeof onTickSecondCallback === 'function') {
        onTickSecondCallback(now, currentHHMM);
    }

    // 1. Check Snoozed Alarms
    const readySnoozes = [];
    const remainingSnoozes = [];
    const nowTs = now.getTime();

    for (const item of snoozedAlarms) {
        if (nowTs >= item.triggerAt) {
            readySnoozes.push(item.alarm);
        } else {
            remainingSnoozes.push(item);
        }
    }
    snoozedAlarms = remainingSnoozes;

    // Trigger ready snoozes
    for (const alarm of readySnoozes) {
        enqueueAlarm(alarm, true);
    }

    // 2. Check Standard Enabled Alarms
    for (const alarm of alarmsCache) {
        if (!alarm.enabled) continue;

        // Check time match (HH:MM)
        if (alarm.time !== currentHHMM) continue;

        // Check day match
        // days: [] means once (any day), otherwise [0..6]
        const matchesDay = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(currentDay);
        if (!matchesDay) continue;

        // Double trigger check within the same minute
        const lastMinuteKey = alarm.lastTriggeredAt ? Math.floor(alarm.lastTriggeredAt / 60000) : 0;
        if (lastMinuteKey === currentMinuteKey) continue;

        // Alarm is due!
        alarm.lastTriggeredAt = now.getTime();

        // Update lastTriggeredAt in DB
        updateAlarm({ id: alarm.id, lastTriggeredAt: alarm.lastTriggeredAt }).catch(console.error);

        // Add to ringing queue
        enqueueAlarm(alarm, false);
    }
}

/**
 * Adds an alarm to the ringing queue (FR-11 Concurrent alarms)
 */
function enqueueAlarm(alarm, isSnoozedReTrigger = false) {
    // Avoid duplicate in current queue
    if (ringingQueue.some(item => item.id === alarm.id)) {
        return;
    }

    ringingQueue.push(alarm);

    // Notify UI of queue update
    if (typeof onQueueUpdatedCallback === 'function') {
        onQueueUpdatedCallback(ringingQueue);
    }

    // If this is the only alarm in queue, trigger it immediately
    if (ringingQueue.length === 1 && typeof onAlarmTriggerCallback === 'function') {
        onAlarmTriggerCallback(alarm, ringingQueue);
    }

    // Trigger browser notification (FR-14)
    showNotification(alarm);
}

/**
 * Handle user dismissing the current active alarm (FR-08)
 */
export async function handleAlarmDismissed(alarm, ringSession) {
    if (!alarm) return;

    // 1. Record in History store
    await addHistory({
        alarmId: alarm.id,
        alarmLabel: alarm.label,
        alarmTime: alarm.time,
        startedAt: ringSession?.startedAt || Date.now(),
        endedAt: Date.now(),
        endReason: 'dismissed'
    }).catch(console.error);

    // 2. FR-10: Recurring vs One-time rule
    // Alarm sekali pakai otomatis nonaktif setelah berbunyi; alarm mingguan tetap aktif
    if (!alarm.days || alarm.days.length === 0) {
        alarm.enabled = false;
        await updateAlarm({ id: alarm.id, enabled: false }).catch(console.error);
        await refreshAlarmsCache();
        broadcastSync('DATA_CHANGED');
    }

    // 3. Remove from ringing queue
    ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);
    broadcastSync('ALARM_DISMISSED_REMOTE', { alarmId: alarm.id });

    if (typeof onQueueUpdatedCallback === 'function') {
        onQueueUpdatedCallback(ringingQueue);
    }

    // 4. If more alarms in queue, ring next one (FR-11)
    if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
        onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
    }
}

/**
 * Handle user snoozing the active alarm (FR-09)
 */
export async function handleAlarmSnoozed(alarm, ringSession) {
    if (!alarm) return;

    const snoozeMins = Number(alarm.snoozeMinutes) || 5;
    const triggerAt = Date.now() + (snoozeMins * 60 * 1000);

    // 1. Record in History
    await addHistory({
        alarmId: alarm.id,
        alarmLabel: alarm.label,
        alarmTime: alarm.time,
        startedAt: ringSession?.startedAt || Date.now(),
        endedAt: Date.now(),
        endReason: 'snoozed'
    }).catch(console.error);

    // 2. Add to snoozed list
    snoozedAlarms = snoozedAlarms.filter(s => s.alarm.id !== alarm.id);
    snoozedAlarms.push({
        alarm,
        triggerAt,
        snoozeMinutes: snoozeMins
    });

    // 3. Remove from ringing queue
    ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);
    broadcastSync('ALARM_SNOOZED_REMOTE', { alarmId: alarm.id, triggerAt });

    if (typeof onQueueUpdatedCallback === 'function') {
        onQueueUpdatedCallback(ringingQueue);
    }

    // 4. Ring next alarm in queue if available
    if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
        onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
    }

    return triggerAt;
}

/**
 * Handle 30-minute auto-stop triggered by player (FR-07)
 */
export async function handleAlarmAutoStopped(alarm, startedAt, endedAt) {
    if (!alarm) return;

    // 1. Record in History store
    await addHistory({
        alarmId: alarm.id,
        alarmLabel: alarm.label,
        alarmTime: alarm.time,
        startedAt: startedAt || Date.now() - (30 * 60 * 1000),
        endedAt: endedAt || Date.now(),
        endReason: 'auto-stopped'
    }).catch(console.error);

    // 2. FR-10: One-time alarms turn off
    if (!alarm.days || alarm.days.length === 0) {
        alarm.enabled = false;
        await updateAlarm({ id: alarm.id, enabled: false }).catch(console.error);
        await refreshAlarmsCache();
        broadcastSync('DATA_CHANGED');
    }

    // 3. Remove from queue
    ringingQueue = ringingQueue.filter(item => item.id !== alarm.id);

    if (typeof onQueueUpdatedCallback === 'function') {
        onQueueUpdatedCallback(ringingQueue);
    }

    // 4. Ring next queued alarm if any
    if (ringingQueue.length > 0 && typeof onAlarmTriggerCallback === 'function') {
        onAlarmTriggerCallback(ringingQueue[0], ringingQueue);
    }
}

/**
 * FR-13: Detect missed alarms when browser was closed
 */
async function checkMissedAlarms() {
    const lastTickStr = localStorage.getItem('alarm_last_tick');
    if (!lastTickStr) return;

    const lastTick = Number(lastTickStr);
    const now = Date.now();
    const elapsedMinutes = (now - lastTick) / (1000 * 60);

    // If app was offline/closed for between 2 minutes and 24 hours
    if (elapsedMinutes >= 2 && elapsedMinutes <= 24 * 60) {
        const lastDate = new Date(lastTick);
        const currentDate = new Date(now);

        const missed = [];

        for (const alarm of alarmsCache) {
            if (!alarm.enabled) continue;

            const [alarmH, alarmM] = alarm.time.split(':').map(Number);
            const scheduledToday = new Date(currentDate);
            scheduledToday.setHours(alarmH, alarmM, 0, 0);

            // Check if alarm time falls between lastTick and now
            if (scheduledToday.getTime() > lastTick && scheduledToday.getTime() < now) {
                const dayMatch = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(scheduledToday.getDay());
                if (dayMatch) {
                    missed.push(alarm);
                    // Record in history as 'missed'
                    await addHistory({
                        alarmId: alarm.id,
                        alarmLabel: alarm.label,
                        alarmTime: alarm.time,
                        startedAt: scheduledToday.getTime(),
                        endedAt: scheduledToday.getTime(),
                        endReason: 'missed'
                    }).catch(console.error);

                    // If one-time, disable it
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

/**
 * FR-14: Browser Notification API
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    const permission = await Notification.requestPermission();
    return permission;
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
            notif.onclick = () => {
                window.focus();
                notif.close();
            };
        } catch (e) {
            console.warn('Could not display notification:', e);
        }
    }
}

/**
 * Format Date to HH:MM (24-hour)
 */
export function formatHHMM(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

export function getRingingQueue() {
    return ringingQueue;
}

export function getSnoozedAlarms() {
    return snoozedAlarms;
}

if (typeof window !== 'undefined') {
    window.AlarmScheduler = {
        initScheduler,
        refreshAlarmsCache,
        getAlarmsCache,
        handleAlarmDismissed,
        handleAlarmSnoozed,
        handleAlarmAutoStopped,
        requestNotificationPermission,
        broadcastSync,
        getRingingQueue,
        getSnoozedAlarms,
        formatHHMM
    };
}

