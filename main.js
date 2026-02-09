// Short ID Generator
function generateShortId(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Base64 URL-safe encoding helpers for compact share links
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function toB64(n) {
    if (n === 0 || n === null || isNaN(n)) return "";
    let res = "";
    while (n > 0) {
        res = B64_CHARS[n % 64] + res;
        n = Math.floor(n / 64);
    }
    return res;
}
function fromB64(s) {
    if (!s) return 0;
    let res = 0;
    for (let i = 0; i < s.length; i++) {
        res = res * 64 + B64_CHARS.indexOf(s[i]);
    }
    return res;
}

// State Manager
const state = {
    view: 'landing',
    type: 'countdown',
    countdownMode: 'duration',
    timerId: null,
    timerActive: false,
    startTime: null,
    pauseTime: 0,
    duration: 600,
    stopwatchMode: 'immediate',
    actualStartTime: null,
    timerName: '',
    lastIsWaiting: false,
    displayMode: 'normal'
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
const typeLabel = document.getElementById('timer-type-label');
const controls = document.getElementById('controls');

// Target mode elements
const modeDuration = document.getElementById('mode-duration');
const modeTarget = document.getElementById('mode-target');
const durationInputGroup = document.getElementById('duration-input-group');
const targetInputGroup = document.getElementById('target-input-group');
const targetDateInput = document.getElementById('target-date');
const targetAmpmInput = document.getElementById('target-ampm');
const targetHourInput = document.getElementById('target-hour');
const targetMinuteInput = document.getElementById('target-minute');
const targetSecondInput = document.getElementById('target-second');

// Stopwatch target mode elements
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
const modeNormalBtn = document.getElementById('mode-normal-btn');
const modeMinutesBtn = document.getElementById('mode-minutes-btn');
const modeSecondsBtn = document.getElementById('mode-seconds-btn');

// Timer List Elements
const timerListSection = document.getElementById('timer-list-section');
const timerListContainer = document.getElementById('timer-list-container');

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

// Theme Elements
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('theme-icon-sun');
const moonIcon = document.getElementById('theme-icon-moon');

// Init
function init() {
    initTheme();
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    setupListeners();
    startTicker();
    loadTimerList();
    initDefaultTargetTime();
}

function initDefaultTargetTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);

    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    targetDateInput.value = `${year}-${month}-${day}`;
    targetAmpmInput.value = ampm;
    targetHourInput.value = hours;
    targetMinuteInput.value = now.getMinutes().toString().padStart(2, '0');
    targetSecondInput.value = '00';

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
    shareBtn.addEventListener('click', copyShareLink);
    modeNormalBtn.addEventListener('click', () => setDisplayMode('normal'));
    modeMinutesBtn.addEventListener('click', () => setDisplayMode('minutes'));
    modeSecondsBtn.addEventListener('click', () => setDisplayMode('seconds'));

    swModeImmediate.addEventListener('click', () => setStopwatchMode('immediate'));
    swModeTarget.addEventListener('click', () => setStopwatchMode('target'));

    // Input range enforcement
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

    // Auto 24h -> 12h conversion
    let conversionTimeout;
    const setupHourConversion = (hourInput, ampmInput) => {
        hourInput.addEventListener('input', (e) => {
            clearTimeout(conversionTimeout);
            const val = parseInt(e.target.value);
            if (isNaN(val)) return;
            conversionTimeout = setTimeout(() => {
                if (val >= 13 && val <= 23) {
                    ampmInput.value = 'PM';
                    hourInput.value = val - 12;
                } else if (val === 0) {
                    ampmInput.value = 'AM';
                    hourInput.value = 12;
                } else if (val === 12) {
                    ampmInput.value = 'PM';
                } else if (val >= 24) {
                    hourInput.value = 12;
                }
            }, 300);
        });
    };

    setupHourConversion(targetHourInput, targetAmpmInput);
    setupHourConversion(swTargetHourInput, swTargetAmpmInput);
    setupHourConversion(newTargetHour, newTargetAmpm);

    // Minute blur formatting
    const formatMinuteOnBlur = (el) => {
        el.addEventListener('blur', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val)) e.target.value = '00';
            else e.target.value = Math.min(59, Math.max(0, val)).toString().padStart(2, '0');
        });
    };

    formatMinuteOnBlur(targetMinuteInput);
    formatMinuteOnBlur(swTargetMinuteInput);

    // Change Target Modal
    changeTargetBtn.addEventListener('click', openChangeTargetModal);
    cancelChangeBtn.addEventListener('click', () => changeTargetModal.classList.add('hidden'));
    confirmChangeBtn.addEventListener('click', applyNewTarget);

    enforceRange(newTargetHour, 1, 12);
    enforceRange(newTargetMinute, 0, 59);
    enforceRange(newTargetSecond, 0, 59);
}

function setDisplayMode(mode) {
    state.displayMode = mode;

    // Update active UI
    modeNormalBtn.classList.toggle('active', mode === 'normal');
    modeMinutesBtn.classList.toggle('active', mode === 'minutes');
    modeSecondsBtn.classList.toggle('active', mode === 'seconds');

    saveTimerState(state.timerId);
    updateDisplay();
}

function setCountdownMode(mode) {
    state.countdownMode = mode;
    modeDuration.classList.toggle('active', mode === 'duration');
    modeTarget.classList.toggle('active', mode === 'target');
    durationInputGroup.classList.toggle('hidden', mode !== 'duration');
    targetInputGroup.classList.toggle('hidden', mode !== 'target');
}

function setStopwatchMode(mode) {
    state.stopwatchMode = mode;
    swModeImmediate.classList.toggle('active', mode === 'immediate');
    swModeTarget.classList.toggle('active', mode === 'target');
    swTargetInputGroup.classList.toggle('hidden', mode !== 'target');
    createBtn.textContent = mode === 'immediate' ? '스톱워치 시작하기' : '스톱워치 생성하기';
}

function setType(type) {
    state.type = type;
    typeCountdown.classList.toggle('active', type === 'countdown');
    typeStopwatch.classList.toggle('active', type === 'stopwatch');
    countdownSettings.classList.toggle('hidden', type !== 'countdown');
    stopwatchSettings.classList.toggle('hidden', type !== 'stopwatch');

    if (type === 'countdown') {
        createBtn.textContent = '타이머 생성하기';
        timerNameInput.placeholder = '타이머 이름을 입력하세요';
    } else {
        setStopwatchMode(state.stopwatchMode);
        timerNameInput.placeholder = '스톱워치 이름을 입력하세요';
    }
}

function handleRoute() {
    const hash = window.location.hash;

    // Compact share link format: #*[base64 data]
    if (hash.startsWith('#*')) {
        const data = hash.substring(2);
        loadFromShareLink(data);
        return;
    }

    if (hash.startsWith('#/')) {
        const id = hash.substring(2).replace(/\/$/, '');
        loadTimer(id);
    } else {
        showLanding();
    }
}

function showLanding() {
    state.view = 'landing';
    landingView.classList.remove('hidden');
    timerView.classList.add('hidden');
    state.timerActive = false;
    state.timerId = null;
    setType('countdown');
}

function showTimer() {
    state.view = 'timer';
    landingView.classList.add('hidden');
    timerView.classList.remove('hidden');
    controls.classList.remove('hidden');

    typeLabel.textContent = state.type === 'countdown' ? '타이머' : '스톱워치';
    timerNameDisplay.textContent = state.timerName;
    updateToggleButton();
}

function createTimer() {
    const id = generateShortId(6);
    state.timerId = id;

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
            autoStart = false;
        } else {
            const targetTime = getTargetTimeFromInputs(targetDateInput, targetHourInput, targetMinuteInput, targetSecondInput, targetAmpmInput);
            const now = Date.now();
            initialSeconds = Math.max(0, (targetTime - now) / 1000);
            state.startTime = now;
            state.actualStartTime = now;
            autoStart = true;
        }
    } else {
        if (state.stopwatchMode === 'immediate') {
            initialSeconds = 0;
            autoStart = true;
            state.startTime = Date.now();
            state.actualStartTime = state.startTime;
        } else {
            const targetTime = getTargetTimeFromInputs(swTargetDateInput, swTargetHourInput, swTargetMinuteInput, swTargetSecondInput, swTargetAmpmInput);
            state.startTime = targetTime;
            state.actualStartTime = targetTime;
            initialSeconds = 0;
            autoStart = true;
        }
    }

    state.timerActive = autoStart;
    state.pauseTime = initialSeconds;
    state.duration = initialSeconds;
    state.timerName = timerNameInput.value.trim();

    saveTimerState(id);
    addTimerToList({
        id: id,
        type: state.type,
        name: state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치'),
        duration: state.duration,
        createdAt: Date.now()
    });

    toggleBtn.classList.remove('hidden');
    resetBtn.classList.remove('full-width');

    window.location.hash = `/${id}`;
}

function getTargetTimeFromInputs(dateInput, hourInput, minuteInput, secondInput, ampmInput) {
    const dateVal = dateInput.value;
    let hourVal = parseInt(hourInput.value) || 12;
    const minuteVal = minuteInput.value || '00';
    const secondVal = secondInput.value || '00';
    const ampm = ampmInput.value;

    if (ampm === 'PM' && hourVal < 12) hourVal += 12;
    if (ampm === 'AM' && hourVal === 12) hourVal = 0;

    const targetDate = new Date(`${dateVal}T${hourVal.toString().padStart(2, '0')}:${minuteVal.padStart(2, '0')}:${secondVal.padStart(2, '0')}`);
    return targetDate.getTime();
}

function loadTimer(id) {
    const savedState = localStorage.getItem(`timer_state_${id}`);
    if (!savedState) {
        alert('존재하지 않는 타이머입니다.');
        window.location.hash = '';
        return;
    }

    const data = JSON.parse(savedState);
    state.timerId = id;
    state.type = data.type;
    state.countdownMode = data.countdownMode || 'duration';
    state.timerActive = data.active;
    state.pauseTime = data.pauseTime;
    state.startTime = data.startTime;
    state.actualStartTime = data.actualStartTime;
    state.duration = data.duration;
    state.timerName = data.timerName || '';
    state.displayMode = data.displayMode || 'normal';

    setDisplayMode(state.displayMode);

    showTimer();
}

function loadFromShareLink(data) {
    const parts = data.split(',');
    if (parts.length < 2) {
        showLanding();
        return;
    }

    const flags = fromB64(parts[0]);
    state.type = (flags & 1) ? 'stopwatch' : 'countdown';
    state.countdownMode = (flags & 2) ? 'target' : 'duration';
    state.stopwatchMode = (flags & 2) ? 'target' : 'immediate';
    state.timerActive = !!(flags & 4);

    const EPOCH = 1735689600000; // 2025-01-01
    state.pauseTime = fromB64(parts[1]) / 1000 || 0;

    if (parts[2]) {
        state.startTime = fromB64(parts[2]) + EPOCH;
    } else {
        state.startTime = null;
    }

    if (parts.length >= 4 && parts[3]) {
        state.actualStartTime = parts[3] === '-' ? state.startTime : fromB64(parts[3]) + EPOCH;
    }

    if (parts.length >= 5 && parts[4]) {
        state.duration = parts[4] === '-' ? state.pauseTime : fromB64(parts[4]) / 1000;
    }

    state.timerName = parts[5] ? decodeURIComponent(parts[5]) : '';
    state.timerId = 'shared_' + generateShortId(4);

    // For shared links, always keep timer active
    if (state.timerActive && !state.startTime) {
        state.startTime = Date.now();
    }

    saveTimerState(state.timerId);
    showTimer();
}

function saveTimerState(id) {
    const timerState = {
        type: state.type,
        active: state.timerActive,
        startTime: state.startTime,
        pauseTime: state.pauseTime,
        duration: state.duration,
        countdownMode: state.countdownMode,
        actualStartTime: state.actualStartTime,
        timerName: state.timerName,
        displayMode: state.displayMode
    };
    localStorage.setItem(`timer_state_${id}`, JSON.stringify(timerState));
}

function updateToggleButton() {
    const now = Date.now();
    const isWaiting = state.type === 'stopwatch' && state.startTime && state.startTime > now && state.timerActive;

    resetBtn.classList.remove('hidden', 'full-width');
    toggleBtn.classList.remove('hidden');
    changeTargetBtn.classList.add('hidden');

    if (state.type === 'countdown' && state.countdownMode === 'target') {
        changeTargetBtn.classList.remove('hidden');
        resetBtn.classList.add('hidden');
        toggleBtn.classList.add('hidden');
    } else if (isWaiting) {
        toggleBtn.classList.add('hidden');
        resetBtn.classList.add('full-width');
    } else if (state.timerActive) {
        toggleBtn.textContent = '일시정지';
        toggleBtn.style.background = '#e53e3e';
    } else {
        const hasStarted = state.type === 'countdown'
            ? state.pauseTime < state.duration
            : (state.pauseTime > 0 || state.actualStartTime !== null);

        toggleBtn.textContent = hasStarted ? '재개' : '시작';
        toggleBtn.style.background = 'var(--primary-teal)';

        if (state.type === 'countdown' && state.pauseTime <= 0 && hasStarted) {
            toggleBtn.classList.add('hidden');
            resetBtn.classList.add('full-width');
        }
    }
}

function openChangeTargetModal() {
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
}

function applyNewTarget() {
    const targetTime = getTargetTimeFromInputs(newTargetDate, newTargetHour, newTargetMinute, newTargetSecond, newTargetAmpm);
    const now = Date.now();

    state.pauseTime = Math.max(0, (targetTime - now) / 1000);
    state.startTime = now;
    state.timerActive = true;

    saveTimerState(state.timerId);
    updateToggleButton();
    changeTargetModal.classList.add('hidden');
}

function toggleTimer() {
    const now = Date.now();
    const newActive = !state.timerActive;

    if (!newActive) {
        const elapsed = (now - (state.startTime || now)) / 1000;
        if (state.type === 'countdown') {
            state.pauseTime -= elapsed;
        } else {
            state.pauseTime += elapsed;
        }
    }

    state.timerActive = newActive;
    state.startTime = newActive ? now : null;

    if (newActive && state.type === 'stopwatch' && !state.actualStartTime) {
        state.actualStartTime = now;
    }

    saveTimerState(state.timerId);
    updateToggleButton();
}

function resetTimer() {
    state.timerActive = false;
    state.startTime = null;
    state.actualStartTime = null;
    state.pauseTime = state.type === 'countdown' ? state.duration : 0;

    toggleBtn.classList.remove('hidden');
    resetBtn.classList.remove('full-width');

    saveTimerState(state.timerId);
    updateToggleButton();
}

function copyShareLink() {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    let flags = 0;
    if (state.type === 'stopwatch') flags |= 1;
    const mode = state.type === 'countdown' ? state.countdownMode : state.stopwatchMode;
    if (mode === 'target') flags |= 2;
    if (state.timerActive) flags |= 4;

    const EPOCH = 1735689600000;
    const p = toB64(Math.floor(state.pauseTime * 1000));
    const s = state.startTime ? toB64(state.startTime - EPOCH) : '';
    const ts = (state.actualStartTime === state.startTime && state.actualStartTime) ? '-' : (state.actualStartTime ? toB64(state.actualStartTime - EPOCH) : '');
    const d = (state.duration === state.pauseTime || !state.duration) ? '-' : toB64(Math.floor(state.duration * 1000));
    const n = encodeURIComponent(state.timerName || '');

    const compact = `${toB64(flags)},${p},${s},${ts},${d},${n}`.replace(/,+$/, '');
    const url = `${baseUrl}#*${compact}`;

    navigator.clipboard.writeText(url).then(() => {
        const originalText = shareBtn.textContent;
        shareBtn.textContent = '복사됨!';
        setTimeout(() => {
            shareBtn.textContent = originalText;
        }, 1500);
    });
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
                stopTimerAtZero();
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

    updateTimerInfo(isWaiting);

    if (state.lastIsWaiting !== isWaiting) {
        state.lastIsWaiting = isWaiting;
        updateToggleButton();
    }

    renderTime(displaySeconds);
}

function updateTimerInfo(isWaiting) {
    if (state.type === 'stopwatch') {
        if (state.actualStartTime) {
            timerInfo.classList.remove('hidden');
            const startPoint = new Date(state.actualStartTime);
            let detailStr = formatDateTime(startPoint);

            if (isWaiting) {
                timerInfo.textContent = `⏱️ 스톱워치 시작 대기 중... (${detailStr} 시작)`;
                timerInfo.className = 'timer-info waiting';
            } else {
                timerInfo.textContent = `시작 시간: ${detailStr}`;
                timerInfo.className = 'timer-info';
            }
        } else {
            timerInfo.classList.add('hidden');
        }
    } else {
        const showInfo = (state.timerActive && state.startTime) || (state.countdownMode === 'target');
        if (showInfo && state.startTime) {
            timerInfo.classList.remove('hidden');
            const endPoint = new Date(state.startTime + state.pauseTime * 1000);
            timerInfo.textContent = `종료 예정 시간: ${formatDateTime(endPoint)}`;
            timerInfo.className = 'timer-info';
        } else {
            timerInfo.classList.add('hidden');
        }
    }
}

function formatDateTime(date) {
    return (date.getMonth() + 1).toString().padStart(2, '0') + '/' +
        date.getDate().toString().padStart(2, '0') + ' ' +
        date.toLocaleTimeString('ko-KR', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function renderTime(displaySeconds) {
    const total = Math.abs(displaySeconds);
    const ms = Math.floor((total % 1) * 100);
    const msFormatted = `<span class="timer-ms">${ms.toString().padStart(2, '0')}</span>`;

    if (state.displayMode === 'seconds') {
        const s = Math.floor(total);
        timerDisplay.innerHTML = `${s}${msFormatted}<span class="timer-day-label">초</span>`;
        return;
    }

    if (state.displayMode === 'minutes') {
        const m = Math.floor(total / 60);
        const s = Math.floor(total % 60);
        const sStr = s.toString().padStart(2, '0');
        timerDisplay.innerHTML = `${m}<span class="timer-day-label">분</span> ${sStr}${msFormatted}<span class="timer-day-label">초</span>`;
        return;
    }

    // Normal View
    const totalSeconds = Math.floor(total);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    let formatted = '';
    if (d > 0) {
        formatted += `${d}<span class="timer-day-label">일</span> `;
    }
    formatted += [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].join(':');

    timerDisplay.innerHTML = `${formatted}${msFormatted}`;
}

function stopTimerAtZero() {
    state.timerActive = false;
    state.pauseTime = 0;
    state.startTime = null;
    saveTimerState(state.timerId);
    updateToggleButton();
    playAlarmSound();
    showTimerNotification();
}

function playAlarmSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const createBeep = () => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        osc.start();
        osc.stop(audioContext.currentTime + 0.5);
    };

    createBeep();
    setTimeout(createBeep, 600);
    setTimeout(createBeep, 1200);
}

function showTimerNotification() {
    if ('Notification' in window) {
        const notify = () => {
            const timerName = state.timerName || '타이머';
            new Notification('타이머 종료!', {
                body: `${timerName}이(가) 종료되었습니다.`
            });
        };

        if (Notification.permission === 'granted') {
            notify();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') notify();
            });
        }
    }
}

// Timer List Functions
function loadTimerList() {
    const savedList = localStorage.getItem('timerList');
    if (savedList) {
        renderTimerList(JSON.parse(savedList));
    }
}

function addTimerToList(timer) {
    const savedList = localStorage.getItem('timerList');
    const timers = savedList ? JSON.parse(savedList) : [];

    const existingIndex = timers.findIndex(t => t.id === timer.id);
    if (existingIndex >= 0) {
        timers[existingIndex] = timer;
    } else {
        timers.unshift(timer);
    }

    localStorage.setItem('timerList', JSON.stringify(timers));
    renderTimerList(timers);
}

function removeTimerFromList(timerId) {
    const savedList = localStorage.getItem('timerList');
    if (!savedList) return;

    const timers = JSON.parse(savedList).filter(t => t.id !== timerId);
    localStorage.setItem('timerList', JSON.stringify(timers));
    localStorage.removeItem(`timer_state_${timerId}`);
    renderTimerList(timers);
}

function renderTimerList(timers) {
    if (!timers || timers.length === 0) {
        timerListSection.classList.add('hidden');
        timerListContainer.innerHTML = '';
        return;
    }

    timerListSection.classList.remove('hidden');
    timerListContainer.innerHTML = timers.map(timer => `
        <div id="timer-item-${timer.id}" class="timer-list-item" data-id="${timer.id}">
            <div class="timer-list-info">
                <div class="timer-list-name">${timer.name}</div>
                <div class="timer-list-time" id="timer-time-${timer.id}">--:--:--</div>
                <div class="timer-list-type" id="timer-type-${timer.id}">${timer.type === 'countdown' ? '타이머' : '스톱워치'}</div>
            </div>
            <div class="timer-list-actions">
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
    `).join('');

    timers.forEach(timer => {
        const itemEl = document.getElementById(`timer-item-${timer.id}`);
        if (!itemEl) return;

        const infoEl = itemEl.querySelector('.timer-list-info');
        if (infoEl) {
            infoEl.addEventListener('click', () => window.location.hash = `/${timer.id}`);
            infoEl.style.cursor = 'pointer';
        }

        const deleteBtn = itemEl.querySelector('.delete-timer-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (deleteBtn.classList.contains('confirming')) {
                    removeTimerFromList(timer.id);
                } else {
                    deleteBtn.classList.add('confirming');
                    deleteBtn.style.background = '#fff5f5';
                    deleteBtn.style.color = '#e53e3e';
                    setTimeout(() => {
                        if (deleteBtn.classList.contains('confirming')) {
                            deleteBtn.classList.remove('confirming');
                            deleteBtn.style.background = '';
                            deleteBtn.style.color = '';
                        }
                    }, 3000);
                }
            });
        }
    });

    updateTimerListDisplay();
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

    JSON.parse(savedList).forEach(timer => {
        const itemEl = document.getElementById(`timer-item-${timer.id}`);
        if (!itemEl) return;

        const timeEl = document.getElementById(`timer-time-${timer.id}`);
        const typeLabelEl = document.getElementById(`timer-type-${timer.id}`);
        const savedState = localStorage.getItem(`timer_state_${timer.id}`);

        if (savedState) {
            const timerState = JSON.parse(savedState);
            const now = Date.now();
            let displaySeconds, isActive = timerState.active, extraInfo = '';

            if (timerState.type === 'countdown') {
                displaySeconds = timerState.pauseTime;
                if (isActive && timerState.startTime) {
                    displaySeconds = timerState.pauseTime - (now - timerState.startTime) / 1000;
                    extraInfo = ` • 종료 예정: ${formatDateShort(new Date(timerState.startTime + timerState.pauseTime * 1000))}`;
                }
                if (displaySeconds <= 0) {
                    displaySeconds = 0;
                    isActive = false;
                    itemEl.classList.add('finished');
                    extraInfo = ' • 종료됨';
                } else {
                    itemEl.classList.remove('finished');
                }
            } else {
                displaySeconds = timerState.pauseTime;
                if (isActive && timerState.startTime) {
                    displaySeconds = timerState.pauseTime + (now - timerState.startTime) / 1000;
                }
                if (timerState.actualStartTime) {
                    extraInfo = ` • 시작: ${formatDateShort(new Date(timerState.actualStartTime))}`;
                }
                itemEl.classList.remove('finished');
            }

            const absSeconds = Math.abs(Math.round(displaySeconds));
            const d = Math.floor(absSeconds / 86400);
            const hours = Math.floor((absSeconds % 86400) / 3600);
            const minutes = Math.floor((absSeconds % 3600) / 60);
            const seconds = absSeconds % 60;

            let displayTime = d > 0 ? `${d}일 ` : '';
            displayTime += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            const statusText = isActive ? ' (진행 중)' : (displaySeconds <= 0 ? ' (종료)' : ' (일시정지)');
            timeEl.textContent = displayTime + statusText;
            typeLabelEl.textContent = (timerState.type === 'countdown' ? '타이머' : '스톱워치') + extraInfo;
        }
    });
}

// Theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    if (savedTheme) {
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    } else {
        document.body.classList.toggle('dark-mode', systemPrefersDark.matches);
    }

    updateThemeUI();

    systemPrefersDark.addEventListener('change', (e) => {
        document.body.classList.toggle('dark-mode', e.matches);
        localStorage.setItem('theme', e.matches ? 'dark' : 'light');
        updateThemeUI();
    });

    themeToggle.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateThemeUI();
    });
}

function updateThemeUI() {
    const isDark = document.body.classList.contains('dark-mode');
    sunIcon.classList.toggle('hidden', !isDark);
    moonIcon.classList.toggle('hidden', isDark);
}

init();
