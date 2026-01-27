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
    remoteState: null
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
    shareBtn.addEventListener('click', copyShareLink);

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

function setType(type) {
    state.type = type;
    if (type === 'countdown') {
        typeCountdown.classList.add('active');
        typeStopwatch.classList.remove('active');
        countdownSettings.classList.remove('hidden');
        createBtn.textContent = '타이머 생성하기';
    } else {
        typeStopwatch.classList.add('active');
        typeCountdown.classList.remove('active');
        countdownSettings.classList.add('hidden');
        createBtn.textContent = '스톱워치 시작하기';
    }
}

function handleRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#/')) {
        const id = hash.substring(2);
        joinRoom(id);
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
            const minutes = parseInt(countdownInput.value) || 10;
            initialSeconds = minutes * 60;
        } else {
            const dateVal = targetDateInput.value;
            let hourVal = parseInt(targetHourInput.value) || 12;
            const minuteVal = targetMinuteInput.value || '00';
            const ampm = targetAmpmInput.value;

            // Convert to 24h format
            if (ampm === 'PM' && hourVal < 12) hourVal += 12;
            if (ampm === 'AM' && hourVal === 12) hourVal = 0;

            const targetDate = new Date(`${dateVal}T${hourVal.toString().padStart(2, '0')}:${minuteVal.padStart(2, '0')}:00`);
            const targetTime = targetDate.getTime();
            const now = Date.now();
            initialSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
            autoStart = true;
        }
    } else {
        // Stopwatch mode
        initialSeconds = 0;
        autoStart = true;
    }

    state.timerActive = autoStart;
    state.pauseTime = initialSeconds;
    state.duration = initialSeconds;
    state.startTime = autoStart ? Date.now() : null;

    const initialState = {
        type: state.type,
        active: state.timerActive,
        pauseTime: state.pauseTime,
        startTime: state.startTime,
        duration: state.duration,
        isCreator: true,
        roomId: id
    };

    sessionStorage.setItem(`timer_owner_${id}`, 'true');
    localStorage.setItem(`timer_state_${id}`, JSON.stringify(initialState));

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        await set(ref(db, 'timers/' + id), {
            type: state.type,
            active: state.timerActive,
            pauseTime: state.pauseTime,
            startTime: state.startTime,
            duration: state.duration,
            createdAt: serverTimestamp()
        });
    }

    window.location.hash = `/${id}`;
}

function joinRoom(id) {
    state.roomId = id;
    state.isCreator = sessionStorage.getItem(`timer_owner_${id}`) === 'true';

    showTimer(id);

    if (db && firebaseConfig.apiKey !== "DEMO_KEY") {
        const timerRef = ref(db, 'timers/' + id);
        onValue(timerRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                state.remoteState = data;
                syncFromRemote(data);
                syncStatus.classList.add('online');
            } else {
                if (!state.isCreator) {
                    alert('존재하지 않는 타이머입니다.');
                    window.location.hash = '';
                }
            }
        });
    } else {
        // Local mode fallback via BroadcastChannel
        const bc = new BroadcastChannel('timer_' + id);

        // 1. Listen for messages
        bc.onmessage = (event) => {
            if (event.data.msgType === 'SYNC') {
                syncFromRemote(event.data.state);
                syncStatus.classList.add('online');
            } else if (event.data.msgType === 'REQUEST_STATE' && state.isCreator) {
                // If someone asks for state and I am the creator, send it
                broadcastSync();
            }
        };

        // 2. Try to load from localStorage first (for the creator or same-browser tabs)
        const savedState = localStorage.getItem(`timer_state_${id}`);
        if (savedState) {
            syncFromRemote(JSON.parse(savedState));
            syncStatus.classList.add('online');
        }

        // 3. Ask for the latest state from other tabs (in case the timer is already running)
        bc.postMessage({ msgType: 'REQUEST_STATE' });

        if (!savedState) syncStatus.classList.remove('online');
    }
}

function syncFromRemote(data) {
    state.type = data.type;
    state.timerActive = data.active;
    state.pauseTime = data.pauseTime;
    state.startTime = data.startTime;
    state.duration = data.duration;

    typeLabel.textContent = state.type === 'countdown' ? '카운트다운' : '스톱워치';

    if (state.isCreator) {
        controls.classList.remove('hidden');
        viewerControls.classList.add('hidden');
        updateToggleButton();
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

function copyShareLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const originalText = shareBtn.textContent;
        shareBtn.textContent = '복사됨!';
        setTimeout(() => shareBtn.textContent = originalText, 2000);
    });
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

    if (state.timerActive && state.startTime) {
        const elapsed = (Date.now() - state.startTime) / 1000;
        if (state.type === 'countdown') {
            displaySeconds = state.pauseTime - elapsed;
            if (displaySeconds <= 0) {
                displaySeconds = 0;
                if (state.isCreator) {
                    stopTimerAtZero();
                }
            }
        } else {
            displaySeconds = state.pauseTime + elapsed;
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
            duration: state.duration
        });
    } else {
        const bc = new BroadcastChannel('timer_' + state.roomId);
        bc.postMessage({ msgType: 'SYNC', state: { ...state, remoteState: null } });
        bc.close();
    }
}

init();
