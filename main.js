import { MAX_DURATION_MS, isCountdown, isDateTime, randomHex, timerReading, transitionTimer } from './timer-model.js';
import { decodeSnapshot, encodeSnapshot, normalizeLegacy, settingsFromLegacy, toLegacy } from './legacy.js';
import {
    authorizeLiveTimer, changeLiveTimer, createLiveTimer, getLiveTimer,
    liveHash, measureServerClock, parseLiveHash, watchLiveTimer
} from './live.js';

const el = id => document.getElementById(id);
const colors = window.matchMedia('(prefers-color-scheme: dark)');
const displayModes = ['normal', 'minutes', 'seconds'];
const statusNames = { ready: '시작 전', running: '진행 중', paused: '일시정지', waiting: '시작 대기 중', finished: '종료됨' };
const modeNames = { duration: '타이머', deadline: '종료 시점 타이머', immediate: '스톱워치', scheduled: '예약 스톱워치' };
const errors = {
    invalidDuration: '1초 이상 99시간 59분 59초 이하로 설정하세요.',
    invalidDate: '날짜와 시간을 확인하세요.',
    futureRequired: '종료 시각은 현재보다 뒤로 설정하세요.',
    conflict: '다른 기기의 변경을 반영했습니다. 다시 조작할 수 있습니다.',
    invalidAction: '현재 상태에서 이 조작을 적용할 수 없습니다.',
    forbidden: '이 링크에는 조작 권한이 없습니다.',
    missingBackend: '실시간 서버가 설정되지 않았습니다.'
};

let session;
let createAttempt;
let creating = false;
let unstoredLink;
let audio;
let displayMode = read('displayMode');
if (!displayModes.includes(displayMode)) displayMode = 'normal';

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
}

function show(id, visible) {
    el(id).classList.toggle('hidden', !visible);
}

function nowFor(current) {
    return current?.clock ? current.clock.epoch + performance.now() - current.clock.at : Date.now();
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function dateFromFields(prefix) {
    const date = el(`${prefix}-date`).value;
    const hour = el(`${prefix}-hour`).valueAsNumber;
    const minute = el(`${prefix}-minute`).value === '' ? 0 : el(`${prefix}-minute`).valueAsNumber;
    const second = el(`${prefix}-second`).value === '' ? 0 : el(`${prefix}-second`).valueAsNumber;
    if (!date || !Number.isInteger(hour) || hour < 1 || hour > 12
        || !Number.isInteger(minute) || minute < 0 || minute > 59
        || !Number.isInteger(second) || second < 0 || second > 59) {
        throw new Error('invalidDate');
    }
    const hours = hour % 12 + (el(`${prefix}-ampm`).value === 'PM' ? 12 : 0);
    const input = `${date}T${pad(hours)}:${pad(minute)}:${pad(second)}`;
    const parsed = new Date(input);
    if (!isDateTime(parsed.getTime()) || parsed.getHours() !== hours || parsed.getMinutes() !== minute) {
        throw new Error('invalidDate');
    }
    return parsed.getTime();
}

function nextWholeHour(timestamp) {
    const date = new Date(timestamp);
    date.setHours(date.getHours() + 1, 0, 0, 0);
    if (date.getMinutes() !== 0) {
        // A daylight-saving transition can skip the beginning of a local hour.
        date.setHours(date.getHours() + 1, 0, 0, 0);
    }
    return date.getTime();
}

function fillDate(prefix, timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours();
    el(`${prefix}-date`).value = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    el(`${prefix}-ampm`).value = hours >= 12 ? 'PM' : 'AM';
    el(`${prefix}-hour`).value = hours % 12 || 12;
    el(`${prefix}-minute`).value = pad(date.getMinutes());
    el(`${prefix}-second`).value = pad(date.getSeconds());
}

let type = 'countdown';
let countdownMode = 'duration';
let stopwatchMode = 'immediate';

function updateForm() {
    const countdown = type === 'countdown';
    const buttons = {
        'type-countdown': countdown,
        'type-stopwatch': !countdown,
        'mode-duration': countdownMode === 'duration',
        'mode-target': countdownMode === 'deadline',
        'sw-mode-immediate': stopwatchMode === 'immediate',
        'sw-mode-target': stopwatchMode === 'scheduled'
    };
    for (const [id, active] of Object.entries(buttons)) {
        el(id).classList.toggle('active', active);
        el(id).setAttribute('aria-pressed', active);
    }
    show('countdown-settings', countdown);
    show('stopwatch-settings', !countdown);
    show('duration-input-group', countdownMode === 'duration');
    show('target-input-group', countdownMode === 'deadline');
    show('sw-target-input-group', stopwatchMode === 'scheduled');
    el('timer-name-input').placeholder = countdown ? '타이머 이름을 입력하세요' : '스톱워치 이름을 입력하세요';
    setText(el('create-btn'), countdown ? '타이머 생성하기' : stopwatchMode === 'immediate' ? '스톱워치 시작하기' : '스톱워치 생성하기');
}

function formSettings() {
    const mode = type === 'countdown' ? countdownMode : stopwatchMode;
    const name = el('timer-name-input').value.trim();
    if (mode === 'duration') {
        const hours = Number(el('countdown-hours').value);
        const minutes = Number(el('countdown-minutes').value);
        const seconds = Number(el('countdown-seconds').value);
        const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        if (![hours, minutes, seconds].every(Number.isInteger) || hours < 0 || minutes < 0 || minutes > 59
            || seconds < 0 || seconds > 59 || durationMs < 1000 || durationMs > MAX_DURATION_MS) {
            throw new Error('invalidDuration');
        }
        return { name, mode, durationMs };
    }
    if (mode === 'immediate') return { name, mode };
    return { name, mode, targetAt: dateFromFields(mode === 'deadline' ? 'target' : 'sw-target') };
}

function message(error, fallback) {
    return errors[error?.data ?? error?.message] ?? fallback;
}

function creationSignature(settings, current) {
    // A legacy timer keeps ticking while a failed creation request is retried.
    return JSON.stringify([current?.hash ?? '', current?.timer ?? settings]);
}

async function create(settings, status, current) {
    if (creating) return;
    const location = window.location.hash;
    const signature = creationSignature(settings, current);
    if (createAttempt?.signature !== signature) {
        createAttempt = { signature, args: { ...settings, roomId: randomHex(16), key: randomHex(32) } };
    }
    creating = true;
    el('create-btn').disabled = true;
    el('promote-btn').disabled = true;
    setText(status, '실시간 타이머를 만드는 중입니다.');
    try {
        const { args } = createAttempt;
        const timer = await createLiveTimer(args);
        createAttempt = null;
        const role = timer.mode === 'deadline' ? 'manage' : 'control';
        const hash = liveHash(args.roomId, role, args.key);
        const bookmarked = saveLiveBookmark({ id: args.roomId, hash, name: timer.name, mode: timer.mode });
        if (window.location.hash === location) {
            if (!bookmarked) unstoredLink = hash;
            window.location.hash = hash;
        }
    } catch (error) {
        if (error.data === 'collision') createAttempt = null;
        if (window.location.hash === location) setText(status, message(error, '타이머를 만들지 못했습니다. 연결을 확인하고 다시 시도하세요.'));
    } finally {
        creating = false;
        el('create-btn').disabled = false;
        el('promote-btn').disabled = false;
    }
}

function readLegacyHash(hash) {
    const now = Date.now();
    if (hash.startsWith('#*')) return { timer: decodeSnapshot(hash.slice(2), now) };
    if (hash.startsWith('#/+')) return { timer: decodeSnapshot(hash.slice(3), now) };
    if (!hash.startsWith('#/')) return {};
    const [id, search] = hash.slice(2).split('?');
    const inline = new URLSearchParams(search).get('v');
    if (inline) return { timer: decodeSnapshot(inline, now) };
    const localId = id.replace(/\/$/, '');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(localId)) return {};
    const saved = read(`timer_state_${localId}`);
    return { id: localId, timer: normalizeLegacy(saved, now), displayMode: saved?.displayMode };
}

function resetView() {
    clearTimeout(session?.retryTimer);
    session?.stop?.();
    el('change-target-modal').close();
    el('copy-dialog').close();
    setText(el('timer-feedback'), '');
    setText(el('create-status'), '');
    setText(el('timer-status'), '');
    el('timer-status').removeAttribute('data-status');
}

function openRoute() {
    resetView();
    const hash = window.location.hash;
    session = null;
    show('landing-view', !hash);
    show('timer-view', Boolean(hash));
    if (!hash) {
        renderLists();
        return;
    }

    const current = { hash, timer: null, busy: false, online: false, role: 'view', onScreen: true };
    session = current;
    const route = hash.startsWith('#/live/') ? parseLiveHash(hash) : null;
    if (route) {
        Object.assign(current, route, { isLive: true, connection: 'connecting' });
        try {
            current.stop = watchLiveTimer(current.roomId, timer => {
                if (session === current) acceptSnapshot(current, timer);
            }, connected => {
                if (session === current) updateConnection(current, connected);
            }, error => {
                if (session === current) connectionError(current, error);
            });
        } catch (error) {
            connectionError(current, error);
        }
    } else {
        const legacy = readLegacyHash(hash);
        Object.assign(current, { timer: legacy.timer, legacyId: legacy.id, role: 'local' });
        if (!read('displayMode') && displayModes.includes(legacy.displayMode)) setDisplayMode(legacy.displayMode);
        if (!current.timer) current.connection = 'missing';
    }
    render();
}

function acceptSnapshot(current, timer) {
    if (!timer && current.timer && current.connection !== 'missing') return;
    if (current.timer && timer && timer.revision < current.timer.revision) return;
    current.timer = timer;
    render();
}

function connectionError(current, error) {
    current.online = false;
    current.connection = 'offline';
    current.connectionMessage = message(error, '실시간 서버에 연결하지 못했습니다.');
    render();
}

function updateConnection(current, connected) {
    if (current.socket === connected) return;
    current.socket = connected;
    current.online = false;
    current.syncVersion = (current.syncVersion ?? 0) + 1;
    clearTimeout(current.retryTimer);
    if (connected) void refreshConnection(current);
    else {
        current.connection = current.timer || current.connectedOnce || !navigator.onLine ? 'offline' : 'connecting';
        current.connectionMessage = '';
        current.observedEnd = undefined;
        if (current.connection === 'connecting') {
            current.retryTimer = setTimeout(() => {
                if (session === current && !current.socket) connectionError(current, null);
            }, 8000);
        }
        render();
    }
}

async function refreshConnection(current) {
    const version = current.syncVersion;
    const active = () => session === current && current.socket && version === current.syncVersion;
    try {
        const [timer, clock, level] = await Promise.all([
            getLiveTimer(current.roomId),
            measureServerClock(),
            current.key ? authorizeLiveTimer(current.roomId, current.key) : null
        ]);
        if (!active()) return;
        current.clock = clock;
        current.allowed = level === current.role;
        current.connection = !timer ? 'missing' : current.key && !current.allowed ? 'view' : 'live';
        current.connectionMessage = '';
        current.online = Boolean(timer) && navigator.onLine;
        current.connectedOnce = true;
        acceptSnapshot(current, timer);
    } catch (error) {
        if (!active()) return;
        connectionError(current, error);
        current.retryTimer = setTimeout(() => {
            if (active()) void refreshConnection(current);
        }, 2500);
    }
}

function formatDate(timestamp) {
    return new Intl.DateTimeFormat('ko-KR', {
        month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    }).format(new Date(timestamp));
}

function changeStatus(current, reading) {
    const status = el('timer-status');
    const labels = {
        connecting: '실시간 서버에 연결 중',
        live: current.allowed ? '실시간 연결됨' : '실시간 연결됨 · 보기 전용',
        view: '실시간 연결됨 · 보기 전용',
        offline: current.connectionMessage || '연결 끊김 · 재연결 중',
        missing: '타이머를 찾을 수 없습니다.'
    };
    const state = current.connection || 'local';
    status.dataset.status = state === 'view' ? 'live' : state;
    setText(status, labels[state] || '이 기기에서만 실행 중');
    setText(el('timer-type-label'), reading ? `${modeNames[current.timer.mode]} · ${statusNames[reading.status]}` : '');
    show('retry-btn', current.isLive && state === 'offline');
}

function renderControls(current, reading) {
    const timer = current.timer;
    const unlocked = Boolean(timer && (current.role === 'local' || current.allowed));
    const deadline = timer?.mode === 'deadline';
    const disabled = current.busy || (current.isLive && !current.online);
    show('controls', unlocked);
    show('reset-btn', unlocked && !deadline);
    show('restart-btn', unlocked && !deadline);
    show('toggle-btn', unlocked && !deadline && !['finished', 'waiting'].includes(reading?.status));
    show('change-target-btn', unlocked && deadline);
    for (const id of ['reset-btn', 'restart-btn', 'toggle-btn', 'change-target-btn']) el(id).disabled = disabled;
    const toggling = reading?.status === 'running';
    const toggle = el('toggle-btn');
    toggle.dataset.command = toggling ? 'pause' : 'start';
    setText(toggle, toggling ? '일시정지' : reading?.status === 'paused' ? '재개' : '시작');
    toggle.classList.toggle('pause', toggling);
}

function render() {
    if (!session) return;
    const current = session;
    const timer = current.timer;
    const reading = timer && (!current.isLive || current.clock) && timerReading(timer, nowFor(current));
    setText(el('timer-name-display'), timer?.name || '');
    show('share-btn', Boolean(timer));
    setText(el('share-btn'), current.isLive ? '보기 링크 복사' : '스냅샷 링크 복사');
    show('control-link-btn', Boolean(timer && current.allowed));
    setText(el('control-link-btn'), current.role === 'manage' ? '비공개 관리 링크 복사' : '조작 링크 복사');
    show('promote-btn', Boolean(timer && !current.isLive));
    show('alarm-btn', Boolean(timer && isCountdown(timer)));
    show('fullscreen-btn', Boolean(document.fullscreenEnabled && timer));
    show('retry-btn', current.isLive && current.connection === 'offline');
    if (current.connection === 'view') setText(el('timer-feedback'), '이 링크의 조작 권한을 확인할 수 없습니다.');
    if (current.allowed && unstoredLink === current.hash) {
        setText(el('timer-feedback'), '이 기기의 목록에 저장할 수 없습니다. 조작 또는 관리 링크를 보관하세요.');
        unstoredLink = null;
    }
    updateAlarmButton();
    changeStatus(current, reading);
    renderControls(current, reading);
    updateTimerFrame(current, reading);
}

function renderTime(valueMs) {
    const total = Math.floor(valueMs / 1000);
    const fraction = `<span class="timer-ms">${pad(Math.floor(valueMs / 10) % 100)}</span>`;
    const unit = text => `<span class="timer-day-label">${text}</span>`;
    if (displayMode === 'seconds') return `${total}${fraction}${unit('초')}`;
    if (displayMode === 'minutes') return `${Math.floor(total / 60)}${unit('분')} ${pad(total % 60)}${fraction}${unit('초')}`;
    return wholeTime(total, unit) + fraction;
}

function wholeTime(total, unit = text => text) {
    const days = Math.floor(total / 86400);
    const time = [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60].map(pad).join(':');
    return `${days ? `${days}${unit('일')} ` : ''}${time}`;
}

function updateTimerFrame(current, reading) {
    const display = el('timer-display');
    if (!reading) {
        display.textContent = '–:––:––';
        display.classList.remove('finished');
        show('timer-info', false);
        current.lastStatus = undefined;
        return;
    }
    const timer = current.timer;
    const markup = renderTime(reading.valueMs);
    if (current.markup !== markup) {
        display.innerHTML = markup;
        current.markup = markup;
    }
    if (current.lastStatus !== reading.status || current.endAt !== reading.endAt || current.startedAt !== timer.startedAt) {
        display.classList.toggle('finished', reading.status === 'finished');
        const hasClockInfo = reading.endAt || (!isCountdown(timer) && timer.startedAt);
        show('timer-info', Boolean(hasClockInfo));
        el('timer-info').classList.toggle('waiting', reading.status === 'waiting');
        if (hasClockInfo) {
            const label = reading.endAt ? reading.status === 'finished' ? '종료 시각' : '종료 예정' : '시작 시각';
            setText(el('timer-info'), `${label} · ${formatDate(reading.endAt || timer.startedAt)}`);
        }
        changeStatus(current, reading);
        renderControls(current, reading);
        current.lastStatus = reading.status;
        current.endAt = reading.endAt;
        current.startedAt = timer.startedAt;
    }
    handleAlarm(current, reading);
}

async function performCommand(command, status = el('timer-feedback'), expectedRevision = session?.timer?.revision) {
    const current = session;
    if (!current?.timer || current.busy || (current.isLive && (!current.online || !current.allowed || !navigator.onLine))) return false;
    setText(status, '');
    if (!current.isLive) {
        const next = transitionTimer(current.timer, command, Date.now());
        if (!next) {
            setText(status, errors[command.type === 'setDeadline' ? 'futureRequired' : 'invalidAction']);
            return false;
        }
        current.timer = next;
        if (current.legacyId) write(`timer_state_${current.legacyId}`, toLegacy(next));
        render();
        return true;
    }

    current.busy = true;
    render();
    try {
        const result = await changeLiveTimer({
            roomId: current.roomId, key: current.key, expectedRevision, command
        });
        if (session !== current) return false;
        acceptSnapshot(current, result.timer);
        if (!result.applied) {
            if (command.type === 'setDeadline' && result.reason === 'conflict') {
                current.targetEditRevision = current.timer.revision;
            }
            setText(status, errors[result.reason]);
        }
        return result.applied;
    } catch (error) {
        if (session === current) {
            setText(status, message(error, '조작 결과를 확인하지 못했습니다. 최신 상태를 다시 불러옵니다.'));
            if (error.data === 'forbidden') current.allowed = false;
            current.online = false;
            if (current.socket) void refreshConnection(current);
        }
        return false;
    } finally {
        current.busy = false;
        if (session === current) render();
    }
}

function getList(key) {
    const value = read(key);
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') : [];
}

function saveLiveBookmark(timer) {
    const list = getList('liveTimers').filter(item => item.id !== timer.id);
    return write('liveTimers', [timer, ...list]);
}

function listItem(timer, live) {
    const item = document.createElement('div');
    item.className = 'timer-list-item';
    const link = document.createElement('a');
    link.className = 'timer-list-info';
    link.href = live ? timer.hash : `#/${timer.id}`;
    const name = document.createElement('div');
    name.className = 'timer-list-name';
    name.textContent = timer.name || modeNames[timer.mode] || (timer.type === 'stopwatch' ? '스톱워치' : '타이머');
    link.append(name);
    if (!live) {
        const time = document.createElement('div');
        time.className = 'timer-list-time';
        item.dataset.localId = timer.id;
        link.append(time);
    }
    const label = document.createElement('div');
    label.className = 'timer-list-type';
    label.textContent = live ? `${modeNames[timer.mode]} · ${timer.mode === 'deadline' ? '관리' : '조작'} 링크` : '이 기기에서만 실행';
    link.append(label);
    const remove = document.createElement('button');
    remove.className = 'timer-list-btn delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '목록에서 삭제');
    remove.addEventListener('click', () => {
        if (!remove.classList.contains('confirming')) {
            remove.classList.add('confirming');
            remove.textContent = '삭제';
            setTimeout(() => {
                remove.classList.remove('confirming');
                remove.textContent = '×';
            }, 3000);
            return;
        }
        const key = live ? 'liveTimers' : 'timerList';
        if (write(key, getList(key).filter(entry => entry.id !== timer.id))) {
            if (!live) {
                try { localStorage.removeItem(`timer_state_${timer.id}`); } catch { /* The list entry is already removed. */ }
            }
            renderLists();
        }
    });
    item.append(link, remove);
    return item;
}

let listUpdatedAt = -1;
function renderLists() {
    const live = getList('liveTimers').filter(item => typeof item.hash === 'string' && item.hash.startsWith('#/live/') && parseLiveHash(item.hash));
    const local = getList('timerList').filter(item => /^[a-zA-Z0-9_-]{1,80}$/.test(item.id));
    el('timer-list-container').replaceChildren(...live.map(item => listItem(item, true)), ...local.map(item => listItem(item, false)));
    show('timer-list-section', Boolean(live.length + local.length));
    listUpdatedAt = -1;
}

function updateList() {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    if (timestamp === listUpdatedAt) return;
    listUpdatedAt = timestamp;
    for (const item of el('timer-list-container').querySelectorAll('[data-local-id]')) {
        const timer = normalizeLegacy(read(`timer_state_${item.dataset.localId}`), now);
        if (!timer) continue;
        const reading = timerReading(timer, now);
        item.classList.toggle('finished', reading.status === 'finished');
        setText(item.querySelector('.timer-list-time'), `${wholeTime(Math.floor(reading.valueMs / 1000))} · ${statusNames[reading.status]}`);
    }
}

function updateAlarmButton() {
    const enabled = Boolean(audio && audio.state === 'running');
    el('alarm-btn').setAttribute('aria-pressed', enabled);
    setText(el('alarm-btn'), enabled ? '종료 알림 끄기' : '종료 알림 켜기');
}

async function toggleAlarm() {
    const current = session;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (audio?.state === 'running') {
        try { await audio.close(); } catch { /* The context may already be closed. */ }
        audio = null;
        updateAlarmButton();
        return;
    }
    try {
        if (!Audio) throw new Error();
        audio ??= new Audio();
        const resume = audio.resume();
        if ('Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission().catch(() => {});
        }
        await resume;
        updateAlarmButton();
    } catch {
        if (session === current) setText(el('timer-feedback'), '이 브라우저에서 종료 알림 소리를 켤 수 없습니다.');
    }
}

function handleAlarm(current, reading) {
    if (current.isLive && !current.online) return;
    if (reading.status === 'running') {
        current.observedEnd = reading.endAt;
        return;
    }
    const alarmDue = reading.status === 'finished' && current.observedEnd && current.observedEnd === reading.endAt;
    current.observedEnd = undefined;
    if (!alarmDue || audio?.state !== 'running') return;
    const start = audio.currentTime;
    for (const delay of [0, 0.35, 0.7]) {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + delay;
        tone.frequency.value = 800;
        tone.connect(gain).connect(audio.destination);
        gain.gain.setValueAtTime(0.25, at);
        gain.gain.exponentialRampToValueAtTime(0.01, at + 0.25);
        tone.start(at);
        tone.stop(at + 0.25);
    }
    if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('타이머 종료', { body: current.timer.name || '카운트다운이 끝났습니다.' }); } catch { /* Sound remains available. */ }
    }
}

async function copyLink(hash, privateLink = false) {
    const url = new URL(window.location.pathname, window.location.origin);
    url.hash = hash;
    try {
        await navigator.clipboard.writeText(url.href);
        setText(el('timer-feedback'), privateLink ? '복사했습니다. 이 링크를 가진 사람에게 조작 권한이 있습니다.' : '링크를 복사했습니다.');
    } catch {
        el('copy-title').textContent = privateLink ? '조작 또는 관리 링크 복사' : '보기 링크 복사';
        el('copy-value').value = url.href;
        el('copy-dialog').showModal();
        el('copy-value').select();
    }
}

function setDisplayMode(mode) {
    displayMode = mode;
    for (const value of displayModes) {
        const button = el(`mode-${value}-btn`);
        button.classList.toggle('active', mode === value);
        button.setAttribute('aria-pressed', mode === value);
    }
}

function setTheme(theme) {
    const dark = theme === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    show('theme-icon-sun', dark);
    show('theme-icon-moon', !dark);
    el('theme-toggle').setAttribute('aria-pressed', dark);
}

function preferredTheme() {
    const theme = read('theme');
    let legacy;
    try { legacy = localStorage.getItem('theme'); } catch { /* Private browsing may block storage. */ }
    return theme || (['dark', 'light'].includes(legacy) ? legacy : colors.matches ? 'dark' : 'light');
}

function tick() {
    if (session?.timer && (!session.isLive || session.clock)) updateTimerFrame(session, timerReading(session.timer, nowFor(session)));
    else if (!session) updateList();
    requestAnimationFrame(tick);
}

el('type-countdown').onclick = () => { type = 'countdown'; updateForm(); };
el('type-stopwatch').onclick = () => { type = 'stopwatch'; updateForm(); };
el('mode-duration').onclick = () => { countdownMode = 'duration'; updateForm(); };
el('mode-target').onclick = () => { countdownMode = 'deadline'; updateForm(); };
el('sw-mode-immediate').onclick = () => { stopwatchMode = 'immediate'; updateForm(); };
el('sw-mode-target').onclick = () => { stopwatchMode = 'scheduled'; updateForm(); };
for (const button of document.querySelectorAll('[data-minutes]')) {
    button.addEventListener('click', () => {
        el('countdown-hours').value = 0;
        el('countdown-minutes').value = button.dataset.minutes;
        el('countdown-seconds').value = 0;
    });
}
el('create-form').onsubmit = event => {
    event.preventDefault();
    try {
        void create(formSettings(), el('create-status'));
    } catch (error) {
        setText(el('create-status'), message(error, '타이머 설정을 확인하세요.'));
    }
};
el('back-to-home').onclick = () => { window.location.hash = ''; };
el('retry-btn').onclick = openRoute;
el('reset-btn').onclick = () => performCommand({ type: 'reset' });
el('restart-btn').onclick = () => performCommand({ type: 'restart' });
el('toggle-btn').onclick = event => performCommand({ type: event.currentTarget.dataset.command });
el('change-target-btn').onclick = () => {
    session.targetEditRevision = session.timer.revision;
    fillDate('new-target', session.timer.targetAt > 0 ? session.timer.targetAt : nextWholeHour(nowFor(session)));
    setText(el('target-feedback'), '');
    el('change-target-modal').showModal();
};
el('cancel-change-btn').onclick = () => el('change-target-modal').close();
el('confirm-change-btn').onclick = async () => {
    const status = el('target-feedback');
    const button = el('confirm-change-btn');
    button.disabled = true;
    try {
        const targetAt = dateFromFields('new-target');
        if (await performCommand({ type: 'setDeadline', targetAt }, status, session?.targetEditRevision)) el('change-target-modal').close();
        else if (session?.isLive && !session.online) setText(status, '연결이 복구된 뒤 다시 적용하세요.');
    } catch (error) {
        setText(status, message(error, errors.invalidDate));
    } finally {
        button.disabled = false;
    }
};
el('share-btn').onclick = () => copyLink(session.isLive ? liveHash(session.roomId) : encodeSnapshot(session.timer));
el('control-link-btn').onclick = () => copyLink(session.hash, true);
el('close-copy').onclick = () => el('copy-dialog').close();
el('promote-btn').onclick = () => {
    const settings = settingsFromLegacy(session.timer, Date.now());
    const status = el('timer-feedback');
    if (!settings) setText(status, '기존 설정을 복원할 수 없습니다. 새 타이머를 만들거나 종료 시각을 다시 설정하세요.');
    else void create(settings, status, session);
};
el('fullscreen-btn').onclick = async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await el('timer-view').requestFullscreen();
    } catch {
        setText(el('timer-feedback'), '이 화면에서 전체 화면을 열 수 없습니다.');
    }
};
document.addEventListener('fullscreenchange', () => setText(el('fullscreen-btn'), document.fullscreenElement ? '전체 화면 닫기' : '전체 화면'));
el('alarm-btn').onclick = toggleAlarm;
for (const mode of displayModes) {
    el(`mode-${mode}-btn`).onclick = () => {
        setDisplayMode(mode);
        write('displayMode', mode);
    };
}
el('theme-toggle').onclick = () => {
    const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(next);
    write('theme', next);
};
colors.addEventListener('change', () => setTheme(preferredTheme()));
window.addEventListener('hashchange', openRoute);
window.addEventListener('offline', () => {
    if (!session?.isLive) return;
    session.online = false;
    session.connection = 'offline';
    session.observedEnd = undefined;
    session.syncVersion = (session.syncVersion ?? 0) + 1;
    render();
});
window.addEventListener('online', () => {
    if (session?.isLive && session.socket) {
        clearTimeout(session.retryTimer);
        void refreshConnection(session);
    }
});
document.addEventListener('visibilitychange', () => {
    const current = session;
    if (document.hidden || !current?.online) return;
    measureServerClock().then(clock => {
        if (current === session && current.online) current.clock = clock;
    }).catch(() => {});
});
window.addEventListener('storage', () => {
    if (!session) renderLists();
});

const defaultTargetAt = nextWholeHour(Date.now());
fillDate('target', defaultTargetAt);
fillDate('sw-target', defaultTargetAt);
updateForm();
setDisplayMode(displayMode);
setTheme(preferredTheme());
openRoute();
requestAnimationFrame(tick);
