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
    stopwatchMode: 'immediate',
    actualStartTime: null,
    timerName: '',
    lastIsWaiting: false
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
const timerNameInput = document.getElementById('timer-name-input');
const timerNameDisplay = document.getElementById('timer-name-display');

// Timer List Elements
const timerListSection = document.getElementById('timer-list-section');
const timerListContainer = document.getElementById('timer-list-container');

// Modal Elements
const shareModal = document.getElementById('share-modal');
const closeShareModal = document.getElementById('close-modal-btn');
const shareOnlineBtn = document.getElementById('share-online-btn');
const shareStandaloneBtn = document.getElementById('share-standalone-btn');
const shareSubtitle = document.getElementById('share-subtitle');
const shareStandaloneLabel = document.getElementById('share-standalone-label');

// Change Target Modal Elements
const changeTargetBtn = document.getElementById('change-target-btn');
const changeTargetModal = document.getElementById('change-target-modal');
const cancelChangeBtn = document.getElementById('cancel-change-btn');
const confirmChangeBtn = document.getElementById('confirm-change-btn');
const newTargetDate = document.getElementById('new-target-date');
const newTargetAmpm = document.getElementById('new-target-ampm');
const newTargetHour = document.getElementById('new-target-hour');
const newTargetMinute = document.getElementById('new-target-minute');
const newTargetSecond = document.getElementById('new-target-second');

// Init
function init() {
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    setupListeners();
    startTicker();
    loadTimerList();

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
        const typeName = state.type === 'countdown' ? '타이머' : '스톱워치';
        shareStandaloneLabel.textContent = `${typeName} 링크 복사`;
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

    // Change Target Modal listeners
    changeTargetBtn.addEventListener('click', () => {
        if (state.startTime && state.pauseTime) {
            const endPoint = new Date(state.startTime + state.pauseTime * 1000);
            newTargetDate.value = endPoint.toISOString().split('T')[0];
            let hours = endPoint.getHours();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            newTargetAmpm.value = ampm;
            newTargetHour.value = hours;
            newTargetMinute.value = endPoint.getMinutes().toString().padStart(2, '0');
            newTargetSecond.value = endPoint.getSeconds().toString().padStart(2, '0');
        }
        changeTargetModal.classList.remove('hidden');
    });
    cancelChangeBtn.addEventListener('click', () => changeTargetModal.classList.add('hidden'));
    confirmChangeBtn.addEventListener('click', applyNewTarget);

    enforceRange(newTargetHour, 1, 12);
    enforceRange(newTargetMinute, 0, 59);
    enforceRange(newTargetSecond, 0, 59);

    // Auto-conversion for new target modal
    newTargetHour.addEventListener('input', (e) => {
        clearTimeout(conversionTimeout);
        const val = parseInt(e.target.value);
        if (isNaN(val)) return;
        conversionTimeout = setTimeout(() => {
            if (val >= 13 && val <= 23) {
                newTargetAmpm.value = 'PM';
                newTargetHour.value = val - 12;
            } else if (val === 0) {
                newTargetAmpm.value = 'AM';
                newTargetHour.value = 12;
            } else if (val === 12) {
                newTargetAmpm.value = 'PM';
            } else if (val >= 24) {
                newTargetHour.value = 12;
            }
        }, 300);
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
        timerNameInput.placeholder = '타이머 이름을 입력하세요';
    } else {
        typeStopwatch.classList.add('active');
        typeCountdown.classList.remove('active');
        countdownSettings.classList.add('hidden');
        stopwatchSettings.classList.remove('hidden');
        setStopwatchMode(state.stopwatchMode);
        timerNameInput.placeholder = '스톱워치 이름을 입력하세요';
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
            initialSeconds = Math.max(0, (targetTime - now) / 1000);
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
    state.timerName = timerNameInput.value.trim();

    const initialState = {
        type: state.type,
        active: state.timerActive,
        pauseTime: state.pauseTime,
        startTime: state.startTime,
        actualStartTime: state.actualStartTime,
        duration: state.duration,
        timerName: state.timerName,
        countdownMode: state.countdownMode,
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
            timerName: state.timerName,
            countdownMode: state.countdownMode,
            createdAt: serverTimestamp()
        });
    }

    // Reset button states for new timer
    toggleBtn.classList.remove('hidden');
    resetBtn.classList.remove('full-width');

    // Add to timer list
    addTimerToList({
        id: id,
        type: state.type,
        name: state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치'),
        duration: state.duration,
        createdAt: Date.now()
    });

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
        const typeName = state.type === 'countdown' ? '타이머' : '스톱워치';
        shareStandaloneLabel.textContent = `${typeName} 링크 복사`;
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
    state.timerName = data.timerName || '';

    typeLabel.textContent = state.type === 'countdown' ? '타이머' : '스톱워치';
    timerNameDisplay.textContent = state.timerName;

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
    const now = Date.now();
    const isWaiting = state.type === 'stopwatch' && state.startTime && state.startTime > now && state.timerActive;

    // Reset visibility of button children to prevent broken layout
    resetBtn.classList.remove('hidden');
    resetBtn.classList.remove('full-width');
    toggleBtn.classList.remove('hidden');
    changeTargetBtn.classList.add('hidden');

    if (state.type === 'countdown' && state.countdownMode === 'target') {
        // Target Timer mode: show Change Target, hide others
        changeTargetBtn.classList.remove('hidden');
        resetBtn.classList.add('hidden');
        toggleBtn.classList.add('hidden');
    } else if (isWaiting) {
        // Scheduled stopwatch waiting: hide toggle, make reset full width
        toggleBtn.classList.add('hidden');
        resetBtn.classList.add('full-width');
    } else if (state.timerActive) {
        toggleBtn.textContent = '일시정지';
        toggleBtn.style.background = '#e53e3e';
    } else {
        // Check if timer has been started before
        const hasStarted = state.type === 'countdown'
            ? state.pauseTime < state.duration
            : (state.pauseTime > 0 || state.actualStartTime !== null);

        toggleBtn.textContent = hasStarted ? '재개' : '시작';
        toggleBtn.style.background = 'var(--primary-teal)';

        // If countdown finished
        if (state.type === 'countdown' && state.pauseTime <= 0 && hasStarted) {
            toggleBtn.classList.add('hidden');
            resetBtn.classList.add('full-width');
        }
    }
}

async function applyNewTarget() {
    if (!state.isCreator) return;

    const dateVal = newTargetDate.value;
    let hourVal = parseInt(newTargetHour.value) || 12;
    const minuteVal = newTargetMinute.value || '00';
    const secondVal = newTargetSecond.value || '00';
    const ampm = newTargetAmpm.value;

    if (ampm === 'PM' && hourVal < 12) hourVal += 12;
    if (ampm === 'AM' && hourVal === 12) hourVal = 0;

    const targetDate = new Date(`${dateVal}T${hourVal.toString().padStart(2, '0')}:${minuteVal.padStart(2, '0')}:${secondVal.padStart(2, '0')}`);
    const targetTime = targetDate.getTime();
    const now = Date.now();

    const newPauseTime = Math.max(0, (targetTime - now) / 1000);

    const updates = {
        pauseTime: newPauseTime,
        startTime: now,
        active: true
    };

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        await update(ref(db, 'timers/' + state.roomId), updates);
    } else {
        Object.assign(state, updates);
        state.timerActive = true;
        updateToggleButton();
        broadcastSync();
    }

    changeTargetModal.classList.add('hidden');
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
        toggleBtn.classList.remove('hidden'); // Show toggle button again
        resetBtn.classList.remove('full-width'); // Remove full width from reset button
        updateToggleButton();
        // Notify other tabs
        broadcastSync();
    }
}

function copyLink(standalone) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    let url = `${baseUrl}#/${state.roomId}`;

    if (standalone) {
        url += `?standalone=true`;
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
        actualStartTime: state.actualStartTime,
        timerName: state.timerName
    };
}

function startTicker() {
    function tick() {
        if (state.view === 'timer') {
            updateDisplay();
        } else if (state.view === 'landing') {
            updateTimerListDisplay();
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

                // Always include date for stopwatch
                let detailStr = (startPoint.getMonth() + 1).toString().padStart(2, '0') + '/' +
                    startPoint.getDate().toString().padStart(2, '0') + ' ';
                detailStr += startPoint.toLocaleTimeString('ko-KR', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

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
            // Countdown mode info
            const showInfo = (state.timerActive && state.startTime) || (state.countdownMode === 'target');
            if (showInfo && state.startTime) {
                timerInfo.classList.remove('hidden');

                // End time calculation: startTime + pauseTime * 1000
                const endPoint = new Date(state.startTime + state.pauseTime * 1000);

                let detailStr = (endPoint.getMonth() + 1).toString().padStart(2, '0') + '/' +
                    endPoint.getDate().toString().padStart(2, '0') + ' ';
                detailStr += endPoint.toLocaleTimeString('ko-KR', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });

                timerInfo.textContent = `종료 예정 시간: ${detailStr}`;
                timerInfo.className = 'timer-info';
            } else {
                timerInfo.textContent = '';
                timerInfo.classList.add('hidden');
            }
        }
    }

    // Check if we need to update buttons (e.g. waiting finished)
    if (state.isCreator && (state.lastIsWaiting !== isWaiting)) {
        state.lastIsWaiting = isWaiting;
        updateToggleButton();
    }

    const totalSeconds = Math.abs(state.type === 'stopwatch' ? Math.floor(displaySeconds) : Math.round(displaySeconds));
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    let formatted = '';
    if (d > 0) {
        formatted += `${d}일 `;
    }
    formatted += [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].join(':');

    if (state.type === 'stopwatch') {
        const ms = Math.floor((Math.abs(displaySeconds) % 1) * 100);
        timerDisplay.innerHTML = `${formatted}<span class="timer-ms">${ms.toString().padStart(2, '0')}</span>`;
    } else {
        timerDisplay.textContent = formatted;
    }
}

function stopTimerAtZero() {
    state.timerActive = false;
    state.pauseTime = 0;
    state.startTime = null;
    updateToggleButton();

    // Play alarm sound
    playAlarmSound();

    // Show browser notification
    showTimerNotification();

    broadcastSync();
}

function playAlarmSound() {
    // Create an AudioContext and generate a beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Frequency in Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // Play 3 beeps
    setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 800;
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc2.start();
        osc2.stop(audioContext.currentTime + 0.5);
    }, 600);

    setTimeout(() => {
        const osc3 = audioContext.createOscillator();
        const gain3 = audioContext.createGain();
        osc3.connect(gain3);
        gain3.connect(audioContext.destination);
        osc3.frequency.value = 800;
        osc3.type = 'sine';
        gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc3.start();
        osc3.stop(audioContext.currentTime + 0.5);
    }, 1200);
}

function showTimerNotification() {
    // Request notification permission if not granted
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            const timerName = state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치');
            new Notification('타이머 종료!', {
                body: `${timerName}이(가) 종료되었습니다.`,
                icon: '/favicon.ico',
                badge: '/favicon.ico'
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    const timerName = state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치');
                    new Notification('타이머 종료!', {
                        body: `${timerName}이(가) 종료되었습니다.`,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico'
                    });
                }
            });
        }
    }
}

function broadcastSync() {
    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        update(ref(db, 'timers/' + state.roomId), {
            type: state.type,
            active: state.timerActive,
            pauseTime: state.pauseTime,
            startTime: state.startTime,
            actualStartTime: state.actualStartTime,
            duration: state.duration,
            timerName: state.timerName
        });
    } else {
        // Save state to localStorage for persistence regardless of role
        if (state.roomId) {
            // Only save if we have valid data (e.g. Creator). Values might be null if we are just a viewer who hasn't synced yet.
            // But broadcastSync is usually called by creator or after sync.
            // Check if we are creator or standalone-master to avoid overwriting with empty state? 
            // Actually broadcastSync is called when WE change something.
            localStorage.setItem(`timer_state_${state.roomId}`, JSON.stringify(getSerializableState()));
        }

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

// Timer List Management Functions
function loadTimerList() {
    const savedList = localStorage.getItem('timerList');
    if (savedList) {
        const timers = JSON.parse(savedList);
        renderTimerList(timers);
    }
}

function addTimerToList(timer) {
    const savedList = localStorage.getItem('timerList');
    const timers = savedList ? JSON.parse(savedList) : [];

    // Check if timer already exists
    const existingIndex = timers.findIndex(t => t.id === timer.id);
    if (existingIndex >= 0) {
        timers[existingIndex] = timer;
    } else {
        timers.unshift(timer); // Add to beginning
    }

    localStorage.setItem('timerList', JSON.stringify(timers));
    renderTimerList(timers);
}

function removeTimerFromList(timerId) {
    const savedList = localStorage.getItem('timerList');
    if (!savedList) return;

    const timers = JSON.parse(savedList);
    const filtered = timers.filter(t => t.id !== timerId);

    localStorage.setItem('timerList', JSON.stringify(filtered));
    renderTimerList(filtered);
}

// Redefined renderTimerList
function renderTimerList(timers) {
    if (!timers || timers.length === 0) {
        timerListSection.classList.add('hidden');
        timerListContainer.innerHTML = '';
        return;
    }

    timerListSection.classList.remove('hidden');
    timerListContainer.innerHTML = timers.map(timer => createTimerListItem(timer)).join('');

    // Attach event listeners
    timers.forEach(timer => {
        const itemEl = document.getElementById(`timer-item-${timer.id}`);
        if (!itemEl) return;

        // Click to navigate
        const infoEl = itemEl.querySelector('.timer-list-info');
        if (infoEl) {
            infoEl.addEventListener('click', () => {
                window.location.hash = `/${timer.id}`;
            });
            infoEl.style.cursor = 'pointer';
        }

        // Delete button (2-step confirmation)
        const deleteBtn = itemEl.querySelector('.delete-timer-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (deleteBtn.classList.contains('confirming')) {
                    // Second click: Delete
                    removeTimerFromList(timer.id);
                } else {
                    // First click: Request confirmation
                    deleteBtn.classList.add('confirming');
                    const originalHTML = deleteBtn.innerHTML;

                    // Change icon to Red Checkbox (using SVG)
                    deleteBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <polyline points="9 11 12 14 22 4"/>
                        </svg>
                    `;
                    deleteBtn.style.color = '#e53e3e';
                    deleteBtn.style.background = '#fff5f5';

                    // Reset after 3 seconds if not clicked
                    setTimeout(() => {
                        if (document.body.contains(deleteBtn) && deleteBtn.classList.contains('confirming')) {
                            deleteBtn.classList.remove('confirming');
                            deleteBtn.innerHTML = originalHTML;
                            deleteBtn.style.color = '';
                            deleteBtn.style.background = '';
                        }
                    }, 3000);
                }
            });
        }

        // Share button (Open Modal)
        const shareBtn = itemEl.querySelector('.share-timer-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Set the roomId for the modal to use
                state.roomId = timer.id;

                // Update modal labels based on type
                const typeName = timer.type === 'countdown' ? '타이머' : '스톱워치';
                shareStandaloneLabel.textContent = `${typeName} 링크 복사`;

                // Show modal
                shareModal.classList.remove('hidden');
            });
        }
    });

    // Initial update for display
    updateTimerListDisplay();
}

function createTimerListItem(timer) {
    const typeLabel = timer.type === 'countdown' ? '타이머' : '스톱워치';

    return `
        <div id="timer-item-${timer.id}" class="timer-list-item" data-id="${timer.id}">
            <div class="timer-list-info">
                <div class="timer-list-name">${timer.name}</div>
                <div class="timer-list-time" id="timer-time-${timer.id}">--:--:--</div>
                <div class="timer-list-type" id="timer-type-${timer.id}">${typeLabel}</div>
            </div>
            <div class="timer-list-actions">
                <button class="timer-list-btn share-timer-btn" title="링크 공유">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                </button>
                <button class="timer-list-btn delete-timer-btn delete" title="삭제">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function formatDateShort(date) {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    let str = '';
    if (!isToday) {
        str += `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} `;
    }
    str += date.toLocaleTimeString('ko-KR', { hour12: true, hour: 'numeric', minute: '2-digit' });
    return str;
}

function updateTimerListDisplay() {
    const savedList = localStorage.getItem('timerList');
    if (!savedList) return;

    const timers = JSON.parse(savedList);
    timers.forEach(timer => {
        const itemEl = document.getElementById(`timer-item-${timer.id}`);
        if (!itemEl) return;

        const timeEl = document.getElementById(`timer-time-${timer.id}`);
        const typeLabelEl = document.getElementById(`timer-type-${timer.id}`);

        // Load latest state
        const savedState = localStorage.getItem(`timer_state_${timer.id}`);
        if (savedState) {
            const timerState = JSON.parse(savedState);
            const now = Date.now();
            let displayTime = '';
            let isActive = timerState.active;
            let extraInfo = '';

            // Calculate time based on type
            if (timerState.type === 'countdown') {
                let remaining = timerState.pauseTime;

                if (isActive && timerState.startTime) {
                    const elapsed = (now - timerState.startTime) / 1000;
                    remaining = timerState.pauseTime - elapsed;

                    // Countdown End Time
                    const endTime = new Date(timerState.startTime + timerState.pauseTime * 1000);
                    extraInfo = ` • 종료 예정: ${formatDateShort(endTime)}`;
                }

                if (remaining <= 0) {
                    remaining = 0;
                    isActive = false;
                    itemEl.classList.add('finished');
                    extraInfo = ' • 종료됨';
                } else {
                    itemEl.classList.remove('finished');
                }

                // Format D일 HH:MM:SS
                const absSeconds = Math.abs(Math.round(remaining));
                const d = Math.floor(absSeconds / 86400);
                const hours = Math.floor((absSeconds % 86400) / 3600);
                const minutes = Math.floor((absSeconds % 3600) / 60);
                const seconds = absSeconds % 60;

                displayTime = d > 0 ? `${d}일 ` : '';
                displayTime += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            } else {
                // Stopwatch
                let elapsedSeconds = timerState.pauseTime;

                if (isActive && timerState.startTime) {
                    elapsedSeconds = timerState.pauseTime + (now - timerState.startTime) / 1000;
                }

                // Stopwatch Start Time
                if (timerState.actualStartTime) {
                    const startTime = new Date(timerState.actualStartTime);
                    extraInfo = ` • 시작: ${formatDateShort(startTime)}`;
                }

                itemEl.classList.remove('finished');

                // Format D일 HH:MM:SS
                const absSeconds = Math.abs(Math.round(elapsedSeconds));
                const d = Math.floor(absSeconds / 86400);
                const hours = Math.floor((absSeconds % 86400) / 3600);
                const minutes = Math.floor((absSeconds % 3600) / 60);
                const seconds = absSeconds % 60;

                displayTime = d > 0 ? `${d}일 ` : '';
                displayTime += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }

            // Add status indicator text
            let statusText = '';
            if (isActive) statusText = ' (진행 중)';
            else if (timerState.type === 'countdown' && parseInt(displayTime.replace(/:/g, '')) === 0) statusText = ' (종료)';
            else statusText = ' (일시정지)';

            timeEl.textContent = displayTime + statusText;

            // Update type label with extra info
            let typeText = timerState.type === 'countdown' ? '타이머' : '스톱워치';
            if (typeLabelEl) {
                typeLabelEl.textContent = typeText + extraInfo;
            }

            // Update name if changed
            if (timerState.timerName && timerState.timerName !== timer.name) {
                const nameEl = itemEl.querySelector('.timer-list-name');
                if (nameEl) nameEl.textContent = timerState.timerName;
            }
        }
    });
}

console.log('=== OnlineTimer App Script Loaded ===');
init();
