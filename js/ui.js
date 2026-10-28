/**
 * ui.js - User Interface Controller & DOM Management
 * Implements Touhou Reimu / Anime Theme from DESIGN.md and all requirements from PRD.md
 */

import { getAllAlarms, getAlarm, addAlarm, updateAlarm, deleteAlarm, saveSound, getSound, getHistory, clearHistory } from './db.js';
import { previewSound, stopPreview, setVolume, getVolume, unlockAudio } from './player.js';
import { handleAlarmDismissed, handleAlarmSnoozed, requestNotificationPermission, formatHHMM } from './scheduler.js';

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const FULL_DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let currentFilter = 'all'; // 'all' | 'active' | 'inactive'
let searchQuery = '';
let editingAlarmId = null;
let currentPreviewingId = null;
let activeRingingAlarm = null;
let activeRingSession = null;
let titleBlinkInterval = null;
let originalDocumentTitle = document.title || '拔剑 Sketon - Anime Alarm';

// State for Form Upload
let stagedSoundFile = null;
let isAudioUnlocked = false;

/**
 * Initialize UI Elements and Event Listeners
 */
export function initUI() {
    setupClock();
    setupEventListeners();
    setupDragAndDrop();
    renderAlarms();
    updateNextAlarmIndicator();
    updateStats();
}

/**
 * Real-time Clock in Header & Navbar
 */
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
            const monthName = monthNames[now.getMonth()];
            const year = now.getFullYear();
            dateEl.textContent = `${dayName}, ${dayNum} ${monthName} ${year}`;
        }
    };

    update();
    setInterval(update, 1000);
}

/**
 * Setup main UI event listeners
 */
function setupEventListeners() {
    // 1. Audio Unlock on first interaction
    document.addEventListener('click', async () => {
        if (!isAudioUnlocked) {
            const ok = await unlockAudio();
            if (ok) {
                isAudioUnlocked = true;
                updateAudioStatusPill(true);
            }
        }
    }, { once: false });

    // 2. Audio status pill click
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

    // 3. Notification permission request
    const notifBtn = document.getElementById('btn-request-notif');
    if (notifBtn) {
        notifBtn.addEventListener('click', async () => {
            const perm = await requestNotificationPermission();
            if (perm === 'granted') {
                showToast('Izin notifikasi diberikan!', 'success');
                notifBtn.classList.add('text-emerald-500');
            } else {
                showToast('Notifikasi belum diizinkan oleh browser.', 'warning');
            }
        });
    }

    // 4. Volume slider
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
        volumeSlider.value = getVolume() * 100;
        volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value / 100;
            setVolume(val);
        });
    }

    // 5. Open Add Alarm Modal
    const btnOpenAdd = document.getElementById('btn-add-alarm');
    const fabAdd = document.getElementById('fab-add-alarm');
    if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openAlarmModal());
    if (fabAdd) fabAdd.addEventListener('click', () => openAlarmModal());

    // 6. Close Modal
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeAlarmModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeAlarmModal);

    // 7. Alarm Form Submit
    const alarmForm = document.getElementById('alarm-form');
    if (alarmForm) {
        alarmForm.addEventListener('submit', handleAlarmFormSubmit);
    }

    // 8. Filter tabs
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

    // 9. Search Input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderAlarms();
        });
    }

    // 10. History Modal
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

    // 11. Ringing Overlay Action Buttons
    const btnDismiss = document.getElementById('btn-dismiss-ringing');
    const btnSnooze = document.getElementById('btn-snooze-ringing');
    if (btnDismiss) {
        btnDismiss.addEventListener('click', () => {
            if (activeRingingAlarm) {
                dismissActiveRinging();
            }
        });
    }
    if (btnSnooze) {
        btnSnooze.addEventListener('click', () => {
            if (activeRingingAlarm) {
                snoozeActiveRinging();
            }
        });
    }

    // 12. Modal Sound Preview
    const btnPreviewForm = document.getElementById('btn-preview-form-sound');
    if (btnPreviewForm) {
        btnPreviewForm.addEventListener('click', toggleFormSoundPreview);
    }

    // 13. Preset offset buttons (+5m, +15m, +30m, +1h)
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

    // 14. Day Preset buttons (Setiap Hari, Hari Kerja, Sekali Saja)
    const btnDaysAll = document.getElementById('btn-days-all');
    const btnDaysWork = document.getElementById('btn-days-work');
    const btnDaysOnce = document.getElementById('btn-days-once');

    if (btnDaysAll) {
        btnDaysAll.addEventListener('click', () => setFormDays([0, 1, 2, 3, 4, 5, 6]));
    }
    if (btnDaysWork) {
        btnDaysWork.addEventListener('click', () => setFormDays([1, 2, 3, 4, 5]));
    }
    if (btnDaysOnce) {
        btnDaysOnce.addEventListener('click', () => setFormDays([]));
    }

    // 15. Mini Sidebar Player controls
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

    // 16. Keyboard accessibility
    document.addEventListener('keydown', (e) => {
        // Esc key closes modals
        if (e.key === 'Escape') {
            closeAlarmModal();
            closeHistoryModal();
        }
        // Space or Enter on Ringing Overlay triggers dismiss
        if (activeRingingAlarm && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            dismissActiveRinging();
        }
    });
}

/**
 * Setup drag-and-drop for MP3 upload in form (FR-04)
 */
function setupDragAndDrop() {
    const dropZone = document.getElementById('sound-drop-zone');
    const fileInput = document.getElementById('alarm-sound-file');

    if (!dropZone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-red-500', 'bg-red-50/50');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-red-500', 'bg-red-50/50');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            handleSelectedSoundFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files.length > 0) {
            handleSelectedSoundFile(fileInput.files[0]);
        }
    });
}

/**
 * Validate and stage selected MP3 sound file (FR-04)
 */
function handleSelectedSoundFile(file) {
    const errorEl = document.getElementById('sound-file-error');
    const infoEl = document.getElementById('sound-file-info');
    const nameEl = document.getElementById('sound-file-name');
    const sizeEl = document.getElementById('sound-file-size');

    if (errorEl) errorEl.textContent = '';

    // FR-04: Accept audio/mpeg (.mp3), max 10MB
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const isMp3OrAudio = file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3');

    if (!isMp3OrAudio) {
        if (errorEl) errorEl.textContent = 'File harus berformat audio (.mp3). File lain ditolak.';
        showToast('Format file ditolak. Harap pilih file audio MP3.', 'error');
        return;
    }

    if (file.size > MAX_SIZE) {
        if (errorEl) errorEl.textContent = `Ukuran file (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas 10 MB.`;
        showToast('Ukuran file melebihi batas maksimal 10 MB.', 'error');
        return;
    }

    // Success
    stagedSoundFile = file;
    if (infoEl) infoEl.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // Also select "Custom MP3" option in preset dropdown
    const presetSelect = document.getElementById('alarm-preset-sound');
    if (presetSelect) presetSelect.value = 'custom';

    showToast(`File audio "${file.name}" siap disimpan.`, 'success');
}

/**
 * Render list of alarms to DOM (FR-01)
 */
export async function renderAlarms() {
    const container = document.getElementById('alarms-list-container');
    const emptyState = document.getElementById('alarms-empty-state');
    if (!container) return;

    const alarms = await getAllAlarms();

    // Filter
    let filtered = alarms;
    if (currentFilter === 'active') {
        filtered = alarms.filter(a => a.enabled);
    } else if (currentFilter === 'inactive') {
        filtered = alarms.filter(a => !a.enabled);
    }

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
        // Day indicators
        const daysHtml = DAY_NAMES.map((dName, idx) => {
            const isMatch = alarm.days && alarm.days.includes(idx);
            const cls = isMatch 
                ? 'bg-red-500 text-white font-semibold shadow-xs' 
                : 'bg-gray-100 text-gray-400';
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
            <article class="bg-white rounded-2xl shadow-sm border border-red-50 p-5 card-hover transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${!isCardActive ? 'opacity-70 bg-gray-50/70' : ''}" data-id="${alarm.id}">
                <!-- Left: Time & Information -->
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
                            <h3 class="font-bold text-base text-gray-800">${escapeHtml(alarm.label || 'Alarm')}</h3>
                            ${recurrenceLabel}
                        </div>

                        <!-- Days bubbles -->
                        <div class="flex items-center space-x-1 pt-1">
                            ${daysHtml}
                        </div>

                        <!-- Audio file badge & preview -->
                        <div class="flex items-center space-x-2 text-xs text-gray-500 pt-1">
                            <span class="flex items-center space-x-1 bg-red-50/80 text-red-600 px-2.5 py-0.5 rounded-lg border border-red-100">
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

                <!-- Right: Switch & Actions -->
                <div class="flex items-center justify-between md:justify-end space-x-4 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                    <!-- Instant Toggle Switch (FR-01, US-05) -->
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only peer alarm-toggle-switch" data-id="${alarm.id}" ${isCardActive ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500 shadow-inner"></div>
                    </label>

                    <!-- Edit Button -->
                    <button class="btn-edit-alarm p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors" data-id="${alarm.id}" title="Ubah Alarm">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>

                    <!-- Test Trigger Button -->
                    <button class="btn-test-ring p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-colors" data-id="${alarm.id}" title="Uji Bunyi Sekarang">
                        <i class="fa-solid fa-bell"></i>
                    </button>

                    <!-- Delete Button -->
                    <button class="btn-delete-alarm p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" data-id="${alarm.id}" title="Hapus Alarm">
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

/**
 * Bind interactive events to rendered alarm cards
 */
function bindAlarmCardEvents() {
    // 1. Toggle Active / Inactive Switch
    document.querySelectorAll('.alarm-toggle-switch').forEach(switchEl => {
        switchEl.addEventListener('change', async (e) => {
            const id = Number(e.target.dataset.id);
            const enabled = e.target.checked;
            await updateAlarm({ id, enabled });
            if (window.AlarmScheduler) {
                await window.AlarmScheduler.refreshAlarmsCache();
                window.AlarmScheduler.broadcastSync('DATA_CHANGED');
            }
            renderAlarms();
            showToast(`Alarm ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`, 'info');
        });
    });

    // 2. Edit Alarm
    document.querySelectorAll('.btn-edit-alarm').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.dataset.id);
            openAlarmModal(id);
        });
    });

    // 3. Delete Alarm (FR-03 with confirmation)
    document.querySelectorAll('.btn-delete-alarm').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const alarm = await getAlarm(id);
            if (!alarm) return;

            if (confirm(`Hapus alarm "${alarm.label || alarm.time}"? File nada yang tidak dipakai alarm lain akan dibersihkan otomatis.`)) {
                await deleteAlarm(id);
                if (window.AlarmScheduler) {
                    await window.AlarmScheduler.refreshAlarmsCache();
                    window.AlarmScheduler.broadcastSync('DATA_CHANGED');
                }
                renderAlarms();
                showToast('Alarm berhasil dihapus.', 'success');
            }
        });
    });

    // 4. Test Ring Immediately
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

    // 5. Sound preview on card
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

/**
 * Open Modal to Add or Edit Alarm (FR-02, FR-03)
 */
export async function openAlarmModal(editId = null) {
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
        // Default to current time + 5 minutes
        const defaultTime = new Date(Date.now() + 5 * 60 * 1000);
        timeInput.value = formatHHMM(defaultTime);
        labelInput.value = '';
        snoozeSelect.value = '5';
        presetSelect.value = 'reimu_chime';
        setFormDays([0, 1, 2, 3, 4, 5, 6]); // default everyday
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    timeInput.focus();
}

/**
 * Close Alarm Modal
 */
export function closeAlarmModal() {
    stopPreview();
    const modal = document.getElementById('alarm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    editingAlarmId = null;
    stagedSoundFile = null;
}

/**
 * Set selected day chips in form
 */
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

/**
 * Read selected day chips from form
 */
function getFormDays() {
    const selected = [];
    document.querySelectorAll('.day-toggle-btn').forEach(btn => {
        if (btn.classList.contains('bg-red-500')) {
            selected.push(Number(btn.dataset.day));
        }
    });
    return selected;
}

// Toggle individual day button on click
document.addEventListener('DOMContentLoaded', () => {
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
});

/**
 * Handle form submission (FR-02, FR-03, FR-04)
 */
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
        // Handle MP3 file if uploaded
        if (stagedSoundFile) {
            soundId = await saveSound(stagedSoundFile, stagedSoundFile.name);
            soundName = stagedSoundFile.name;
            presetSound = null;
        } else if (editingAlarmId) {
            // Keep existing sound if not replaced
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

        if (window.AlarmScheduler) {
            await window.AlarmScheduler.refreshAlarmsCache();
            window.AlarmScheduler.broadcastSync('DATA_CHANGED');
        }

        closeAlarmModal();
        renderAlarms();
    } catch (err) {
        console.error('Error saving alarm:', err);
        showToast('Gagal menyimpan alarm: ' + err.message, 'error');
    }
}

/**
 * Toggle sound preview in Form
 */
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

/**
 * Ringing Overlay Presentation (FR-06, FR-07, FR-08, FR-09)
 */
export async function triggerAlarmOverlay(alarm, queue = []) {
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

    // Blink document title
    startTitleBlink(alarm);

    // Fetch sound blob if any
    let soundBlob = null;
    if (alarm.soundId) {
        const sound = await getSound(alarm.soundId);
        soundBlob = sound?.blob || null;
    }

    // Start Player with 30-minute auto-stop monitoring (FR-07)
    if (window.AlarmPlayer) {
        window.AlarmPlayer.startAlarm(
            alarm,
            soundBlob,
            (remainingMs) => {
                // Tick callback: update live 30-minute auto-stop countdown
                if (countdownEl) {
                    const totalSec = Math.floor(remainingMs / 1000);
                    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
                    const ss = String(totalSec % 60).padStart(2, '0');
                    countdownEl.textContent = `Berhenti otomatis dalam: ${mm}:${ss}`;
                }
            },
            async (stoppedAlarm, startedAt, endedAt) => {
                // Auto-stop triggered!
                closeRingingOverlay();
                showToast(`Alarm "${stoppedAlarm.label}" berhenti otomatis setelah 30 menit.`, 'info');
                if (window.AlarmScheduler) {
                    await window.AlarmScheduler.handleAlarmAutoStopped(stoppedAlarm, startedAt, endedAt);
                }
                renderAlarms();
            }
        );
    }
}

/**
 * User Dismisses Active Ringing Alarm (FR-08)
 */
export async function dismissActiveRinging() {
    if (!activeRingingAlarm) return;

    const alarm = activeRingingAlarm;
    let ringSession = null;
    if (window.AlarmPlayer) {
        ringSession = window.AlarmPlayer.stopAlarm('dismissed');
    }

    closeRingingOverlay();
    showToast(`Alarm "${alarm.label || alarm.time}" dimatikan.`, 'success');

    if (window.AlarmScheduler) {
        await window.AlarmScheduler.handleAlarmDismissed(alarm, ringSession);
    }

    renderAlarms();
}

/**
 * User Snoozes Active Ringing Alarm (FR-09)
 */
export async function snoozeActiveRinging() {
    if (!activeRingingAlarm) return;

    const alarm = activeRingingAlarm;
    let ringSession = null;
    if (window.AlarmPlayer) {
        ringSession = window.AlarmPlayer.stopAlarm('snoozed');
    }

    closeRingingOverlay();
    const snoozeMins = alarm.snoozeMinutes || 5;
    showToast(`Alarm ditunda selama ${snoozeMins} menit.`, 'info');

    if (window.AlarmScheduler) {
        await window.AlarmScheduler.handleAlarmSnoozed(alarm, ringSession);
    }

    renderAlarms();
}

/**
 * Close Ringing Overlay Screen
 */
function closeRingingOverlay() {
    const overlay = document.getElementById('ringing-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    stopTitleBlink();
    activeRingingAlarm = null;
}

/**
 * Flashing document title and favicon when ringing
 */
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

/**
 * Open History Modal (FR-01, FR-07, FR-08, FR-09, FR-13)
 */
export async function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        await renderHistoryList();
    }
}

export function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Render history entries into table/cards
 */
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
            <div class="p-3.5 bg-gray-50 rounded-xl flex items-center justify-between text-xs border border-gray-100 hover:border-red-100 transition-colors">
                <div class="space-y-0.5">
                    <div class="font-bold text-gray-800 text-sm flex items-center space-x-2">
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

/**
 * Banner for Missed Alarms (FR-13)
 */
export function showMissedAlarmsBanner(missedList) {
    const banner = document.getElementById('missed-alarms-banner');
    const textEl = document.getElementById('missed-alarms-text');
    if (!banner || !missedList || missedList.length === 0) return;

    if (textEl) {
        textEl.textContent = `Ada ${missedList.length} alarm yang terlewat saat browser tertutup (${missedList.map(a => a.time).join(', ')}). Alarm telah dicatat ke riwayat.`;
    }

    banner.classList.remove('hidden');

    const btnDismissBanner = document.getElementById('btn-dismiss-missed-banner');
    if (btnDismissBanner) {
        btnDismissBanner.onclick = () => banner.classList.add('hidden');
    }
}

/**
 * Update Sidebar Statistics
 */
export async function updateStats() {
    const alarms = await getAllAlarms();
    const history = await getHistory(100);

    const totalEl = document.getElementById('stat-total-alarms');
    const activeEl = document.getElementById('stat-active-alarms');
    const historyEl = document.getElementById('stat-total-history');

    if (totalEl) totalEl.textContent = alarms.length;
    if (activeEl) activeEl.textContent = alarms.filter(a => a.enabled).length;
    if (historyEl) historyEl.textContent = history.length;
}

/**
 * Calculate and display countdown to next upcoming alarm
 */
export async function updateNextAlarmIndicator() {
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

        // Check next 7 days for recurrence
        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
            const candidate = new Date(now);
            candidate.setDate(now.getDate() + dayOffset);
            candidate.setHours(ah, am, 0, 0);

            if (candidate.getTime() <= now.getTime()) continue;

            const dayOfWeek = candidate.getDay();
            const matchesDay = (!alarm.days || alarm.days.length === 0) || alarm.days.includes(dayOfWeek);

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

/**
 * Audio Context Status Pill Helper
 */
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

/**
 * Modern Animated Toast Notification
 */
export function showToast(message, type = 'info') {
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

    // Fade in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    });

    const close = () => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('button').onclick = close;
    setTimeout(close, 4000);
}

// Helpers
function formatAmPm(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
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
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[m]);
}

if (typeof window !== 'undefined') {
    window.AlarmUI = {
        initUI,
        renderAlarms,
        openAlarmModal,
        closeAlarmModal,
        triggerAlarmOverlay,
        dismissActiveRinging,
        snoozeActiveRinging,
        showMissedAlarmsBanner,
        updateNextAlarmIndicator,
        updateStats,
        showToast
    };
}

