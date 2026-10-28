/**
 * app.js - Main Application Entry Point
 * Orchestrates IndexedDB, Audio Player, Scheduler, and UI
 */

import { initDB, getAllAlarms, addAlarm } from './db.js';
import { initScheduler } from './scheduler.js';
import { initUI, renderAlarms, triggerAlarmOverlay, showMissedAlarmsBanner, updateNextAlarmIndicator, updateStats, showToast } from './ui.js';

async function bootstrap() {
    try {
        console.log('🚀 Menginisialisasi Aplikasi Alarm Web (Anime Reimu Style)...');

        // 1. Initialize IndexedDB
        await initDB();

        // 2. Seed initial demo alarms if database is empty
        await seedInitialDataIfEmpty();

        // 3. Initialize Scheduler with reactive callbacks
        await initScheduler({
            onAlarmTrigger: (alarm, queue) => {
                triggerAlarmOverlay(alarm, queue);
            },
            onMissedAlarms: (missedList) => {
                showMissedAlarmsBanner(missedList);
            },
            onTickSecond: (now, hhmm) => {
                // Update countdown every 30 seconds
                if (now.getSeconds() % 30 === 0) {
                    updateNextAlarmIndicator();
                }
            }
        });

        // 4. Initialize User Interface
        initUI();

        // 5. Initialize Theme (Light / Dark mode)
        setupThemeToggle();

        console.log('✅ Aplikasi Alarm Web siap digunakan!');
    } catch (err) {
        console.error('Fatal initialization error:', err);
        showToast('Gagal memuat aplikasi: ' + err.message, 'error');
    }
}

/**
 * Seed initial helpful alarms on first run
 */
async function seedInitialDataIfEmpty() {
    const existing = await getAllAlarms();
    if (existing.length === 0) {
        console.log('🌱 Menyiapkan data awal alarm...');
        await addAlarm({
            time: '06:30',
            label: '🌅 Bangun Pagi & Journaling',
            days: [1, 2, 3, 4, 5], // Senin - Jumat
            presetSound: 'morning_bell',
            soundName: 'Morning Sunlight Chime',
            snoozeMinutes: 5,
            enabled: true
        });

        await addAlarm({
            time: '08:00',
            label: '⚔️ Sesi Belajar & Hexo Coding',
            days: [1, 2, 3, 4, 5, 6], // Senin - Sabtu
            presetSound: 'reimu_chime',
            soundName: 'Reimu Shrine Chime',
            snoozeMinutes: 5,
            enabled: true
        });

        await addAlarm({
            time: '22:00',
            label: '🌙 Istirahat & Matikan Layar',
            days: [0, 1, 2, 3, 4, 5, 6], // Setiap Hari
            presetSound: 'digital_beep',
            soundName: 'Digital Cyber Beep',
            snoozeMinutes: 10,
            enabled: false
        });
    }
}

/**
 * Dark Mode toggle
 */
function setupThemeToggle() {
    const themeBtn = document.getElementById('btn-toggle-theme');
    const isDarkSaved = localStorage.getItem('alarm_theme') === 'dark';

    if (isDarkSaved) {
        document.documentElement.classList.add('dark');
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('alarm_theme', isDark ? 'dark' : 'light');
            showToast(`Mode ${isDark ? 'Gelap' : 'Terang'} diaktifkan.`, 'info');
        });
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}

