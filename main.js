import { v4 as uuidv4 } from 'uuid';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, update, serverTimestamp } from 'firebase/database';

// Firebase Configuration - User should replace this with their own
const firebaseConfig = {
    apiKey: "DEMO_KEY",
    authDomain: "online-timer-demo.firebaseapp.com",
    databaseURL: "https://online-timer-demo-default-rtdb.firebaseio.com",
    projectId: "online-timer-demo",
    storageBucket: "online-timer-demo.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// Initialize Firebase (wrapped in try-catch to allow local demo if config is invalid)
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
} catch (e) {
    console.warn("Firebase initialization failed. Using local mode.", e);
}

// Generate or retrieve a unique ID for this specific tab instance
// window.name persists across reloads but is not usually copied to new tabs like sessionStorage is.
if (!window.name || !window.name.startsWith('OnlineTimer_')) {
    window.name = 'OnlineTimer_' + uuidv4();
}
const tabId = window.name;

// Simple State Manager
const state = {
    view: 'landing',
    type: 'countdown',
    countdownMode: 'duration', // 'duration' or 'target'
    roomId: null,
    isCreator: false,
    timerActive: false,
    startTime: null,
    pauseTime: 0,
    duration: 600,
    remoteState: null,
    isStandalone: false,
    bc: null,
    stopwatchMode: 'immediate', // 'immediate' or 'target'
    actualStartTime: null // Original starting point for display
};

// UI Elements
const landingView = document.getElementById('landing-view');
const timerView = document.getElementById('timer-view');
const createBtn = document.getElementById('create-btn');
const typeCountdown = document.getElementById('type-countdown');
const typeStopwatch = document.getElementById('type-stopwatch');
const countdownSettings = document.getElementById('countdown-settings');
const stopwatchSettings = document.getElementById('stopwatch-settings');
const countdownInput = document.getElementById('countdown-minutes');
const countdownHoursInput = document.getElementById('countdown-hours');
const countdownSecondsInput = document.getElementById('countdown-seconds');
const timerDisplay = document.getElementById('timer-display');
const toggleBtn = document.getElementById('toggle-btn');
const resetBtn = document.getElementById('reset-btn');
const backBtn = document.getElementById('back-to-home');
const shareBtn = document.getElementById('share-btn');
const roomIdDisplay = document.getElementById('room-id-display');
const syncStatus = document.getElementById('sync-status');
const typeLabel = document.getElementById('timer-type-label');
const controls = document.getElementById('controls');
const viewerControls = document.getElementById('viewer-controls');

// New UI Elements for target mode
const modeDuration = document.getElementById('mode-duration');
const modeTarget = document.getElementById('mode-target');
const durationInputGroup = document.getElementById('duration-input-group');
const targetInputGroup = document.getElementById('target-input-group');
const targetDateInput = document.getElementById('target-date');
const targetAmpmInput = document.getElementById('target-ampm');
const targetHourInput = document.getElementById('target-hour');
const targetMinuteInput = document.getElementById('target-minute');
const targetSecondInput = document.getElementById('target-second');

// New UI Elements for stopwatch target mode
const swModeImmediate = document.getElementById('sw-mode-immediate');
const swModeTarget = document.getElementById('sw-mode-target');
const swTargetInputGroup = document.getElementById('sw-target-input-group');
const swTargetDateInput = document.getElementById('sw-target-date');
const swTargetAmpmInput = document.getElementById('sw-target-ampm');
const swTargetHourInput = document.getElementById('sw-target-hour');
const swTargetMinuteInput = document.getElementById('sw-target-minute');
const swTargetSecondInput = document.getElementById('sw-target-second');
const timerInfo = document.getElementById('timer-info');

// Modal Elements
const shareModal = document.getElementById('share-modal');
const closeShareModal = document.getElementById('close-modal-btn');
const shareOnlineBtn = document.getElementById('share-online-btn');
const shareStandaloneBtn = document.getElementById('share-standalone-btn');
const shareSubtitle = document.getElementById('share-subtitle');
const shareStandaloneLabel = document.getElementById('share-standalone-label');

// Init
function init() {
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    setupListeners();
    startTicker();

    // Set default target time to +1 hour
    const now = new Date();
    now.setHours(now.getHours() + 1);

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12

    // Correctly get local date string (YYYY-MM-DD)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    targetDateInput.value = `${year}-${month}-${day}`;
    targetAmpmInput.value = ampm;
    targetHourInput.value = hours;
    targetMinuteInput.value = now.getMinutes().toString().padStart(2, '0');
    targetSecondInput.value = '00';

    // Duplicate for stopwatch
    swTargetDateInput.value = `${year}-${month}-${day}`;
    swTargetAmpmInput.value = ampm;
    swTargetHourInput.value = hours;
    swTargetMinuteInput.value = now.getMinutes().toString().padStart(2, '0');
    swTargetSecondInput.value = '00';
}

function setupListeners() {
    typeCountdown.addEventListener('click', () => setType('countdown'));
    typeStopwatch.addEventListener('click', () => setType('stopwatch'));
    modeDuration.addEventListener('click', () => setCountdownMode('duration'));
    modeTarget.addEventListener('click', () => setCountdownMode('target'));
    createBtn.addEventListener('click', createTimer);
    backBtn.addEventListener('click', () => window.location.hash = '');
    toggleBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);
    shareBtn.addEventListener('click', () => {
        if (state.isStandalone) {
            const typeName = state.type === 'countdown' ? '타이머' : '스톱워치';
            shareStandaloneLabel.textContent = `${typeName} 링크 복사`;
        }
        shareModal.classList.remove('hidden');
    });
    closeShareModal.addEventListener('click', () => shareModal.classList.add('hidden'));
    shareOnlineBtn.addEventListener('click', () => copyLink(false));
    shareStandaloneBtn.addEventListener('click', () => copyLink(true));

    swModeImmediate.addEventListener('click', () => setStopwatchMode('immediate'));
    swModeTarget.addEventListener('click', () => setStopwatchMode('target'));

    // Constraint enforcement for duration inputs
    const enforceRange = (el, min, max) => {
        el.addEventListener('input', () => {
            let val = parseInt(el.value);
            if (isNaN(val)) return;
            if (val < min) el.value = min;
            if (val > max) el.value = max;
        });
        el.addEventListener('blur', () => {
            if (el.value === '') el.value = min;
        });
    };

    enforceRange(countdownHoursInput, 0, 99);
    enforceRange(countdownInput, 0, 59);
    enforceRange(countdownSecondsInput, 0, 59);
    enforceRange(targetHourInput, 1, 12);
    enforceRange(targetMinuteInput, 0, 59);
    enforceRange(targetSecondInput, 0, 59);
    enforceRange(swTargetHourInput, 1, 12);
    enforceRange(swTargetMinuteInput, 0, 59);
    enforceRange(swTargetSecondInput, 0, 59);

    // Auto-conversion logic for 24h -> 12h + AM/PM with 0.3s delay
    let conversionTimeout;
    targetHourInput.addEventListener('input', (e) => {
        clearTimeout(conversionTimeout);

        const val = parseInt(e.target.value);
        if (isNaN(val)) return;

        conversionTimeout = setTimeout(() => {
            if (val >= 13 && val <= 23) {
                targetAmpmInput.value = 'PM';
                targetHourInput.value = val - 12;
            } else if (val === 0) {
                targetAmpmInput.value = 'AM';
                targetHourInput.value = 12;
            } else if (val === 12) {
                targetAmpmInput.value = 'PM';
            } else if (val >= 24) {
                targetHourInput.value = 12; // Cap at 12
            }
        }, 300);
    });

    // Ensure minute is always 0-59
    targetMinuteInput.addEventListener('blur', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) e.target.value = '00';
        else e.target.value = Math.min(59, Math.max(0, val)).toString().padStart(2, '0');
    });

    // Auto-conversion for stopwatch inputs
    swTargetHourInput.addEventListener('input', (e) => {
        clearTimeout(conversionTimeout);
        const val = parseInt(e.target.value);
        if (isNaN(val)) return;
        conversionTimeout = setTimeout(() => {
            if (val >= 13 && val <= 23) {
                swTargetAmpmInput.value = 'PM';
                swTargetHourInput.value = val - 12;
            } else if (val === 0) {
                swTargetAmpmInput.value = 'AM';
                swTargetHourInput.value = 12;
            } else if (val === 12) {
                swTargetAmpmInput.value = 'PM';
            } else if (val >= 24) {
                swTargetHourInput.value = 12;
            }
        }, 300);
    });

    swTargetMinuteInput.addEventListener('blur', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) e.target.value = '00';
        else e.target.value = Math.min(59, Math.max(0, val)).toString().padStart(2, '0');
    });
}

function setCountdownMode(mode) {
    state.countdownMode = mode;
    if (mode === 'duration') {
        modeDuration.classList.add('active');
        modeTarget.classList.remove('active');
        durationInputGroup.classList.remove('hidden');
        targetInputGroup.classList.add('hidden');
    } else {
        modeTarget.classList.add('active');
        modeDuration.classList.remove('active');
        targetInputGroup.classList.remove('hidden');
        durationInputGroup.classList.add('hidden');
    }
}

function setStopwatchMode(mode) {
    state.stopwatchMode = mode;
    if (mode === 'immediate') {
        swModeImmediate.classList.add('active');
        swModeTarget.classList.remove('active');
        swTargetInputGroup.classList.add('hidden');
        createBtn.textContent = '스톱워치 시작하기';
    } else {
        swModeTarget.classList.add('active');
        swModeImmediate.classList.remove('active');
        swTargetInputGroup.classList.remove('hidden');
        createBtn.textContent = '스톱워치 생성하기';
    }
}

function setType(type) {
    state.type = type;
    if (type === 'countdown') {
        typeCountdown.classList.add('active');
        typeStopwatch.classList.remove('active');
        countdownSettings.classList.remove('hidden');
        stopwatchSettings.classList.add('hidden');
        createBtn.textContent = '타이머 생성하기';
    } else {
        typeStopwatch.classList.add('active');
        typeCountdown.classList.remove('active');
        countdownSettings.classList.add('hidden');
        stopwatchSettings.classList.remove('hidden');
        setStopwatchMode(state.stopwatchMode);
    }
}

function handleRoute() {
    const hash = window.location.hash;
    console.log('[Timer] Route changed:', hash);
    if (hash.startsWith('#/')) {
        const fullPath = hash.substring(2);
        const [rawId, search] = fullPath.split('?');
        const id = rawId.replace(/\/$/, ''); // Strip trailing slash
        const params = new URLSearchParams(search);
        joinRoom(id, params);
    } else {
        showLanding();
    }
}

function showLanding() {
    state.view = 'landing';
    landingView.classList.remove('hidden');
    timerView.classList.add('hidden');
    state.timerActive = false;
    state.roomId = null;
    state.isCreator = false;
    setType('countdown'); // Reset to default mode visually and in state
}

function showTimer(id) {
    state.view = 'timer';
    landingView.classList.add('hidden');
    timerView.classList.remove('hidden');
}

async function createTimer() {
    const id = uuidv4();
    state.isCreator = true;
    state.roomId = id;

    let initialSeconds = 0;
    let autoStart = false;

    if (state.type === 'countdown') {
        if (state.countdownMode === 'duration') {
            const hours = parseInt(countdownHoursInput.value) || 0;
            const minutes = parseInt(countdownInput.value) || 0;
            const seconds = parseInt(countdownSecondsInput.value) || 0;
            initialSeconds = (hours * 3600) + (minutes * 60) + seconds;

            if (initialSeconds <= 0) {
                alert('시간을 1초 이상으로 설정해주세요.');
                return;
            }
            state.startTime = Date.now();
            autoStart = false; // Duration timer starts paused usually
        } else {
            const dateVal = targetDateInput.value;
            let hourVal = parseInt(targetHourInput.value) || 12;
            const minuteVal = targetMinuteInput.value || '00';
            const secondVal = targetSecondInput.value || '00';
            const ampm = targetAmpmInput.value;

            // Convert to 24h format
            if (ampm === 'PM' && hourVal < 12) hourVal += 12;
            if (ampm === 'AM' && hourVal === 12) hourVal = 0;

            const targetDate = new Date(`${dateVal}T${hourVal.toString().padStart(2, '0')}:${minuteVal.padStart(2, '0')}:${secondVal.padStart(2, '0')}`);
            const targetTime = targetDate.getTime();
            const now = Date.now();
            initialSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
            state.startTime = now;
            state.actualStartTime = now;
            autoStart = true;
        }
    } else {
        // Stopwatch mode
        if (state.stopwatchMode === 'immediate') {
            initialSeconds = 0;
            autoStart = true;
            state.startTime = Date.now();
            state.actualStartTime = state.startTime;
        } else {
            const dateVal = swTargetDateInput.value;
            let hourVal = parseInt(swTargetHourInput.value) || 12;
            const minuteVal = swTargetMinuteInput.value || '00';
            const secondVal = swTargetSecondInput.value || '00';
            const ampm = swTargetAmpmInput.value;

            // Convert to 24h format
            if (ampm === 'PM' && hourVal < 12) hourVal += 12;
            if (ampm === 'AM' && hourVal === 12) hourVal = 0;

            const targetDate = new Date(`${dateVal}T${hourVal.toString().padStart(2, '0')}:${minuteVal.padStart(2, '0')}:${secondVal.padStart(2, '0')}`);
            state.startTime = targetDate.getTime();
            state.actualStartTime = state.startTime;
            initialSeconds = 0;
            autoStart = true;
        }
    }

    state.timerActive = autoStart;
    state.pauseTime = initialSeconds;
    state.duration = initialSeconds;

    const initialState = {
        type: state.type,
        active: state.timerActive,
        pauseTime: state.pauseTime,
        startTime: state.startTime,
        actualStartTime: state.actualStartTime,
        duration: state.duration,
        isCreator: true,
        roomId: id
    };

    sessionStorage.setItem(`timer_owner_${id}`, tabId);
    localStorage.setItem(`timer_state_${id}`, JSON.stringify(initialState));

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        await set(ref(db, 'timers/' + id), {
            type: state.type,
            active: state.timerActive,
            pauseTime: state.pauseTime,
            startTime: state.startTime,
            actualStartTime: state.actualStartTime,
            duration: state.duration,
            createdAt: serverTimestamp()
        });
    }

    window.location.hash = `/${id}`;
}
function joinRoom(id, params = new URLSearchParams()) {
    console.log(`[Timer] Entering joinRoom for ID: ${id}`);
    state.roomId = id;
    state.isStandalone = params.get('standalone') === 'true';

    // Ownership check via sessionStorage (scoped to this room/tab)
    const ownerToken = sessionStorage.getItem(`timer_owner_${id}`);
    state.isCreator = ownerToken === tabId;

    showTimer(id);

    if (state.isStandalone) {
        viewerControls.classList.add('hidden'); // Hide viewer message in standalone
        syncStatus.title = "Standalone Mode (Not synced)";
        shareOnlineBtn.classList.add('hidden'); // Hide sync link option in standalone mode
        shareSubtitle.classList.add('hidden'); // Hide subtitle when only one option exists
    } else {
        shareOnlineBtn.classList.remove('hidden');
        shareSubtitle.classList.remove('hidden');
        shareStandaloneLabel.textContent = '개별 관전 링크';
    }

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        const timerRef = ref(db, 'timers/' + id);
        const unsubscribe = onValue(timerRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                state.remoteState = data;
                syncFromRemote(data);
                syncStatus.classList.add('online');

                if (state.isStandalone) {
                    // One-time sync for standalone
                    unsubscribe();
                    syncStatus.classList.remove('online');
                    syncStatus.title = "Standalone Mode (Not synced)";
                }
            } else {
                if (!state.isCreator) {
                    alert('존재하지 않는 타이머입니다.');
                    window.location.hash = '';
                }
            }
        });
    } else {
        // Local mode fallback via BroadcastChannel
        console.log(`[Timer] Joining room ${id} in local mode (standalone: ${state.isStandalone})`);

        if (state.bc) state.bc.close();
        state.bc = new BroadcastChannel('timer_' + id);

        state.bc.onmessage = (event) => {
            console.log('[Timer] Received BC message:', event.data.msgType);
            if (event.data.msgType === 'SYNC') {
                syncFromRemote(event.data.state);
                syncStatus.classList.add('online');
                document.getElementById('sync-text').textContent = state.isStandalone ? '개별 모드' : '동기화됨';

                if (state.isStandalone) {
                    console.log('[Timer] Standalone sync complete, closing channel.');
                    state.bc.close();
                    state.bc = null;
                    syncStatus.classList.remove('online');
                }
            } else if (event.data.msgType === 'REQUEST_STATE' && state.isCreator) {
                console.log('[Timer] Host received REQUEST_STATE, broadcasting...');
                broadcastSync();
            }
        };

        const savedState = localStorage.getItem(`timer_state_${id}`);
        if (savedState) {
            console.log('[Timer] Found saved state in localStorage');
            const data = JSON.parse(savedState);
            syncFromRemote(data);
            syncStatus.classList.add('online');
            document.getElementById('sync-text').textContent = state.isStandalone ? '개별 모드' : '동기화됨';
            // Even if we have saved state, standalone might want to hear the LATEST from host at least once
            // So we don't close the channel immediately here. It will be closed after the first sync.
        }

        if (!state.isCreator) {
            console.log('[Timer] Requesting state from host...');
            try {
                state.bc.postMessage({ msgType: 'REQUEST_STATE' });
                // Backup request after 1.5 seconds if still nothing
                setTimeout(() => {
                    if (document.getElementById('sync-text').textContent.includes('대기')) {
                        console.log('[Timer] Still waiting for sync, retrying request...');
                        state.bc.postMessage({ msgType: 'REQUEST_STATE' });
                    }
                }, 1500);
            } catch (e) {
                console.error('[Timer] Failed to send REQUEST_STATE:', e);
            }
        }

        if (!savedState && !state.isStandalone) {
            syncStatus.classList.remove('online');
            document.getElementById('sync-text').textContent = '동기화 대기 중...';
        }
    }
}

function syncFromRemote(data) {
    console.log('[Timer] Syncing from remote data:', data);
    state.type = data.type;
    state.countdownMode = data.countdownMode || 'duration';
    state.timerActive = state.isStandalone ? true : data.active;
    state.pauseTime = data.pauseTime;
    state.actualStartTime = data.actualStartTime;

    // If standalone and timer should be active but startTime is null (host was paused)
    // We set startTime to NOW to start it from the pauseTime.
    if (state.isStandalone && state.timerActive && !data.startTime) {
        state.startTime = Date.now();
    } else {
        state.startTime = data.startTime;
    }

    state.duration = data.duration;

    typeLabel.textContent = state.type === 'countdown' ? '카운트다운' : '스톱워치';

    if (state.isStandalone) {
        const typeName = state.type === 'countdown' ? '타이머' : '스톱워치';
        shareStandaloneLabel.textContent = `${typeName} 링크 복사`;
    }

    if (state.isCreator) {
        controls.classList.remove('hidden');
        viewerControls.classList.add('hidden');
        updateToggleButton();
    } else if (state.isStandalone) {
        controls.classList.add('hidden');
        viewerControls.classList.add('hidden');
    } else {
        controls.classList.add('hidden');
        viewerControls.classList.remove('hidden');
    }
}

function updateToggleButton() {
    if (state.timerActive) {
        toggleBtn.textContent = '일시정지';
        toggleBtn.style.background = '#e53e3e';
    } else {
        toggleBtn.textContent = '시작';
        toggleBtn.style.background = 'var(--primary-teal)';
    }
}

async function toggleTimer() {
    if (!state.isCreator) return;

    const now = Date.now();
    const newActive = !state.timerActive;
    let newPauseTime = state.pauseTime;

    if (!newActive) {
        // Pausing: calculate new pauseTime
        const elapsed = (now - (state.startTime || now)) / 1000;
        if (state.type === 'countdown') {
            newPauseTime -= elapsed;
        } else {
            newPauseTime += elapsed;
        }
    }

    const updates = {
        active: newActive,
        startTime: newActive ? now : null,
        pauseTime: newPauseTime
    };

    if (newActive && state.type === 'stopwatch' && !state.actualStartTime) {
        updates.actualStartTime = now;
        state.actualStartTime = now;
    }

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        await update(ref(db, 'timers/' + state.roomId), updates);
    } else {
        // Update local state for offline demo
        Object.assign(state, updates);
        state.timerActive = newActive;
        updateToggleButton();
        // Notify other tabs
        broadcastSync();
    }
}

async function resetTimer() {
    if (!state.isCreator) return;

    const updates = {
        active: false,
        startTime: null,
        actualStartTime: null,
        pauseTime: state.type === 'countdown' ? state.duration : 0
    };

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        await update(ref(db, 'timers/' + state.roomId), updates);
    } else {
        Object.assign(state, updates);
        state.timerActive = false;
        updateToggleButton();
        // Notify other tabs
        broadcastSync();
    }
}

function copyLink(standalone) {
    let url = window.location.href;
    if (standalone) {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}standalone=true`;
    }

    navigator.clipboard.writeText(url).then(() => {
        const btn = standalone ? shareStandaloneBtn : shareOnlineBtn;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<strong>복사되었습니다!</strong>';
        setTimeout(() => {
            btn.innerHTML = originalText;
            shareModal.classList.add('hidden');
        }, 1500);
    });
}

// Helper to get only serializable data from state (to avoid DataCloneError with DOM elements)
function getSerializableState() {
    return {
        type: state.type,
        active: state.timerActive,
        startTime: state.startTime,
        pauseTime: state.pauseTime,
        duration: state.duration,
        countdownMode: state.countdownMode,
        actualStartTime: state.actualStartTime
    };
}

function startTicker() {
    function tick() {
        if (state.view === 'timer') {
            updateDisplay();
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function updateDisplay() {
    let displaySeconds = state.pauseTime;
    let isWaiting = false;

    if (state.timerActive && state.startTime) {
        const now = Date.now();
        const elapsed = (now - state.startTime) / 1000;

        if (state.type === 'countdown') {
            displaySeconds = state.pauseTime - elapsed;
            if (displaySeconds <= 0) {
                displaySeconds = 0;
                if (state.isCreator) {
                    stopTimerAtZero();
                }
            }
        } else {
            if (elapsed < 0) {
                displaySeconds = 0;
                isWaiting = true;
            } else {
                displaySeconds = Math.max(0, state.pauseTime + elapsed);
            }
        }
    }

    // Update Timer Info Message
    if (state.view === 'timer') {
        if (state.type === 'stopwatch') {
            timerInfo.classList.remove('hidden');
            if (state.actualStartTime) {
                const startPoint = new Date(state.actualStartTime);
                const now = new Date();
                const isToday = startPoint.toDateString() === now.toDateString();

                let detailStr = '';
                if (!isToday) {
                    detailStr += (startPoint.getMonth() + 1).toString().padStart(2, '0') + '/' +
                        startPoint.getDate().toString().padStart(2, '0') + ' ';
                }
                detailStr += startPoint.toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

                if (isWaiting) {
                    timerInfo.textContent = `⏱️ 스톱워치 시작 대기 중... (${detailStr} 시작)`;
                    timerInfo.className = 'timer-info waiting';
                } else {
                    timerInfo.textContent = `시작 시간: ${detailStr}`;
                    timerInfo.className = 'timer-info';
                }
            } else {
                timerInfo.textContent = '';
                timerInfo.classList.add('hidden');
            }
        } else {
            // Countdown mode info - hide as requested
            timerInfo.textContent = '';
            timerInfo.classList.add('hidden');
        }
    }

    const absSeconds = Math.abs(Math.round(displaySeconds));
    const h = Math.floor(absSeconds / 3600);
    const m = Math.floor((absSeconds % 3600) / 60);
    const s = absSeconds % 60;

    const formatted = [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].join(':');

    timerDisplay.textContent = formatted;
}

function stopTimerAtZero() {
    state.timerActive = false;
    state.pauseTime = 0;
    state.startTime = null;
    updateToggleButton();
    broadcastSync();
}

function broadcastSync() {
    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        update(ref(db, 'timers/' + state.roomId), {
            type: state.type,
            active: state.timerActive,
            pauseTime: state.pauseTime,
            startTime: state.startTime,
            actualStartTime: state.actualStartTime,
            duration: state.duration
        });
    } else {
        if (!state.bc) {
            state.bc = new BroadcastChannel('timer_' + state.roomId);
        }
        console.log('[Timer] Broadcasting state via BC:', getSerializableState());
        try {
            state.bc.postMessage({ msgType: 'SYNC', state: getSerializableState() });
        } catch (e) {
            console.error('[Timer] Failed to post SYNC message:', e);
        }
    }
}

console.log('=== OnlineTimer App Script Loaded ===');
init();
