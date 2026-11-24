import { MAX_DURATION_MS, isCountdown, isDateTime, randomHex, timerReading, transitionTimer } from './timer-model.js';
import { decodeSnapshot, encodeSnapshot, normalizeLegacy, settingsFromLegacy, toLegacy } from './legacy.js';
import {
    authorizeLiveTimer, changeLiveTimer, createLiveTimer, createShareLink, getLiveTimer,
    liveHash, measureServerClock, parseLiveHash, parseShareHash, resolveShareLink, shareHash, watchLiveTimer
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
let displayMode = 'normal';

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

function setActionLabel(buttonId, labelId, label) {
    setText(el(labelId), label);
    el(buttonId).title = label;
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
    setText(el('create-button-label'), countdown ? '타이머 생성하기' : stopwatchMode === 'immediate' ? '스톱워치 시작하기' : '스톱워치 생성하기');
}

function updatePresetSelection() {
    const hours = Number(el('countdown-hours').value);
    const minutes = Number(el('countdown-minutes').value);
    const seconds = Number(el('countdown-seconds').value);
    for (const button of el('duration-input-group').querySelectorAll('[data-minutes]')) {
        button.setAttribute('aria-pressed', hours === 0 && seconds === 0 && minutes === Number(button.dataset.minutes));
    }
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
    return { id: localId, timer: normalizeLegacy(saved, now) };
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
    setDisplayMode('normal');
    const hash = window.location.hash;
    session = null;
    show('landing-view', !hash);
    show('timer-view', Boolean(hash));
    if (!hash) {
        if (document.fullscreenElement === el('app')) void document.exitFullscreen().catch(() => {});
        renderLists();
        return;
    }

    const current = { hash, timer: null, busy: false, online: false, role: 'view', onScreen: true };
    session = current;
    const code = parseShareHash(hash);
    const route = hash.startsWith('#/live/') ? parseLiveHash(hash) : null;
    if (code) {
        Object.assign(current, { isLive: true, connection: 'connecting' });
        void openShortLink(current, code);
    } else if (route) {
        watchRoute(current, route);
    } else {
        const legacy = readLegacyHash(hash);
        Object.assign(current, { timer: legacy.timer, legacyId: legacy.id, role: 'local' });
        if (!current.timer) current.connection = 'missing';
    }
    render();
}

function watchRoute(current, route) {
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
}

async function openShortLink(current, code) {
    try {
        const target = await resolveShareLink(code);
        if (session !== current) return;
        if (!target) {
            current.connection = 'missing';
        } else if (target.role === 'snapshot') {
            const timer = decodeSnapshot(target.snapshot, Date.now());
            Object.assign(current, { timer, isLive: false, role: 'local', connection: timer ? undefined : 'missing' });
            if (timer) current.snapshotShare = { snapshot: encodeSnapshot(timer), code };
        } else {
            const { roomId, role } = target;
            watchRoute(current, { roomId, role, key: role === 'view' ? undefined : code });
            if (role === 'view') current.viewShare = code;
        }
        render();
    } catch (error) {
        if (session === current) connectionError(current, error);
    }
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
    const typeLabel = el('timer-type-label');
    setText(typeLabel, reading ? `${modeNames[current.timer.mode]} · ${statusNames[reading.status]}` : '');
    typeLabel.dataset.state = reading?.status || '';
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
    setText(el('toggle-label'), toggling ? '일시정지' : reading?.status === 'paused' ? '재개' : '시작');
    el('toggle-icon').setAttribute('href', toggling ? '#icon-pause' : '#icon-play');
}

function render() {
    if (!session) return;
    const current = session;
    const timer = current.timer;
    const reading = timer && (!current.isLive || current.clock) && timerReading(timer, nowFor(current));
    setText(el('timer-name-display'), timer?.name || modeNames[timer?.mode] || '타이머');
    show('share-btn', Boolean(timer));
    setActionLabel('share-btn', 'share-label', current.isLive ? '보기 링크 복사' : '스냅샷 링크 복사');
    show('control-link-btn', Boolean(timer && current.allowed));
    setActionLabel('control-link-btn', 'control-link-label', current.role === 'manage' ? '비공개 관리 링크 복사' : '조작 링크 복사');
    show('promote-btn', Boolean(timer && !current.isLive));
    show('alarm-btn', Boolean(timer && isCountdown(timer)));
    show('fullscreen-btn', Boolean(document.fullscreenEnabled && timer));
    show('display-modes', Boolean(reading));
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

function renderTime(current, display, valueMs) {
    const total = Math.floor(valueMs / 1000);
    const days = Math.floor(total / 86400);
    const showDays = displayMode === 'normal' && days > 0;
    let parts = current.displayParts;

    if (!parts || parts.mode !== displayMode || parts.showDays !== showDays) {
        const unit = text => `<span class="timer-unit">${text}</span>`;
        const dayMarkup = showDays ? `<span class="timer-clock-part"><span data-days></span>${unit('일')} </span>` : '';
        const minutesMarkup = displayMode === 'minutes' ? `<span class="timer-clock-part"><span data-minutes></span>${unit('분')} </span>` : '';
        const secondsUnit = displayMode === 'normal' ? '' : unit('초');
        display.innerHTML = `<span class="timer-clock" aria-hidden="true">${dayMarkup}${minutesMarkup}<span class="timer-clock-part"><span data-time></span><span class="timer-ms" data-fraction></span>${secondsUnit}</span></span>`;
        parts = current.displayParts = {
            mode: displayMode, showDays,
            days: display.querySelector('[data-days]'),
            minutes: display.querySelector('[data-minutes]'),
            time: display.querySelector('[data-time]'),
            fraction: display.querySelector('[data-fraction]')
        };
    }

    if (parts.total !== total) {
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        const hours = Math.floor(total / 3600) % 24;
        let label;
        // Reserve width for tabular digits, the fraction, and the abbreviated units.
        let fit = 5.5;
        if (displayMode === 'seconds') {
            const digits = String(total);
            setText(parts.time, digits);
            label = `${total}초`;
            fit = digits.length * 0.65 + 1.45;
        } else if (displayMode === 'minutes') {
            const digits = String(minutes);
            setText(parts.minutes, digits);
            setText(parts.time, pad(seconds));
            label = `${minutes}분 ${seconds}초`;
            fit = (digits.length + 2) * 0.65 + 2;
        } else {
            if (parts.days) {
                const digits = String(days);
                setText(parts.days, digits);
                fit += digits.length * 0.65 + 0.85;
            }
            setText(parts.time, clockTime(total));
            label = `${days ? `${days}일 ` : ''}${hours}시간 ${minutes % 60}분 ${seconds}초`;
        }
        display.style.setProperty('--timer-fit', fit);
        display.setAttribute('aria-label', label);
        parts.total = total;
    }
    setText(parts.fraction, pad(Math.floor(valueMs / 10) % 100));
}

function clockTime(total) {
    return [Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60].map(pad).join(':');
}

function wholeTime(total) {
    const days = Math.floor(total / 86400);
    return `${days ? `${days}일 ` : ''}${clockTime(total)}`;
}

function updateTimerFrame(current, reading) {
    const display = el('timer-display');
    if (!reading) {
        setText(display, '–:––:––');
        display.setAttribute('aria-label', current.connection === 'connecting' ? '시간 불러오는 중' : '시간 정보 없음');
        display.style.removeProperty('--timer-fit');
        display.classList.remove('finished');
        show('timer-info', false);
        current.displayParts = undefined;
        current.lastStatus = undefined;
        return;
    }
    const timer = current.timer;
    renderTime(current, display, reading.valueMs);
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

function setRemovalConfirmation(button, confirming) {
    button.classList.toggle('confirming', confirming);
    button.setAttribute('aria-label', confirming ? '삭제 확인' : '목록에서 삭제');
}

function listItem(timer, live, index) {
    const item = el('timer-list-item-template').content.firstElementChild.cloneNode(true);
    const link = item.querySelector('.timer-list-info');
    const name = item.querySelector('.timer-list-name');
    const label = item.querySelector('.timer-list-type');
    const time = item.querySelector('.timer-list-time');
    const remove = item.querySelector('.timer-list-btn');
    const stopwatch = timer.type === 'stopwatch' || timer.mode === 'immediate' || timer.mode === 'scheduled';
    link.href = live ? timer.hash : `#/${timer.id}`;
    name.id = `saved-timer-name-${index}`;
    name.textContent = timer.name || modeNames[timer.mode] || (stopwatch ? '스톱워치' : '타이머');
    label.textContent = live ? `${modeNames[timer.mode] || '타이머'} · ${timer.mode === 'deadline' ? '관리' : '조작'} 링크` : '이 기기에서만 실행';
    time.hidden = live;
    if (!live) item.dataset.localId = timer.id;
    if (stopwatch) item.querySelector('.saved-item-icon use').setAttribute('href', '#icon-stopwatch');
    remove.setAttribute('aria-describedby', name.id);

    remove.addEventListener('blur', event => {
        // WebKit can blur the button without a new focus target before delivering its tap.
        if (event.relatedTarget) setRemovalConfirmation(remove, false);
    });
    remove.addEventListener('keydown', event => {
        if (event.key === 'Escape' && remove.classList.contains('confirming')) {
            event.preventDefault();
            setRemovalConfirmation(remove, false);
        }
    });
    remove.addEventListener('click', () => {
        if (!remove.classList.contains('confirming')) {
            setRemovalConfirmation(remove, true);
            remove.focus({ preventScroll: true });
            return;
        }
        const key = live ? 'liveTimers' : 'timerList';
        if (write(key, getList(key).filter(entry => entry.id !== timer.id))) {
            if (!live) {
                try { localStorage.removeItem(`timer_state_${timer.id}`); } catch { /* The list entry is already removed. */ }
            }
            renderLists();
            const rows = el('timer-list-container').children;
            const next = rows[Math.min(index, rows.length - 1)]?.querySelector('.timer-list-info');
            (next ?? el('saved-title')).focus();
        }
    });
    return item;
}

let listUpdatedAt = -1;
function renderLists() {
    const live = getList('liveTimers').filter(item => typeof item.hash === 'string' && item.hash.startsWith('#/live/') && parseLiveHash(item.hash));
    const local = getList('timerList').filter(item => /^[a-zA-Z0-9_-]{1,80}$/.test(item.id));
    el('timer-list-container').replaceChildren(
        ...live.map((item, index) => listItem(item, true, index)),
        ...local.map((item, index) => listItem(item, false, live.length + index))
    );
    const hasTimers = Boolean(live.length + local.length);
    show('timer-list-container', hasTimers);
    show('timer-list-empty', !hasTimers);
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
    el('alarm-icon').setAttribute('href', enabled ? '#icon-bell-off' : '#icon-bell');
    setActionLabel('alarm-btn', 'alarm-label', enabled ? '종료 알림 끄기' : '종료 알림 켜기');
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

function shareUrl(hash) {
    const url = new URL(window.location.pathname, window.location.origin);
    url.hash = hash;
    return url.href;
}

async function linkForCopy(current, privateLink) {
    const direct = privateLink ? current.hash : current.isLive ? liveHash(current.roomId) : encodeSnapshot(current.timer);
    try {
        if (current.isLive) {
            const code = privateLink
                ? current.privateShare ?? parseShareHash(current.hash)
                : current.viewShare;
            if (code) return { url: shareUrl(shareHash(code)) };

            const destination = { roomId: current.roomId };
            if (privateLink) destination.key = current.key;
            const created = await createShareLink(destination);
            if (privateLink) current.privateShare = created;
            else current.viewShare = created;
            return { url: shareUrl(shareHash(created)) };
        }

        if (direct.length <= shareHash('').length + 22) return { url: shareUrl(direct) };
        const snapshot = direct.slice(2);
        if (current.snapshotShare?.snapshot !== snapshot) current.snapshotShare = { snapshot, nonce: randomHex(16) };
        const saved = current.snapshotShare;
        saved.code ??= await createShareLink({ snapshot, nonce: saved.nonce });
        return { url: shareUrl(shareHash(saved.code)) };
    } catch {
        return { url: shareUrl(direct), fallback: true };
    }
}

async function copyLink(privateLink) {
    const current = session;
    if (!current?.timer || current.copying) return;
    current.copying = true;
    const feedback = el('timer-feedback');
    setText(feedback, '공유 링크를 준비하고 있습니다.');
    const link = linkForCopy(current, privateLink);
    try {
        let copied = false;
        try {
            if (navigator.clipboard?.write && window.ClipboardItem) {
                // Reserve clipboard access during the click while the short link is generated.
                const data = link.then(({ url }) => new Blob([url], { type: 'text/plain' }));
                await navigator.clipboard.write([new ClipboardItem({ 'text/plain': data })]);
            } else {
                await navigator.clipboard.writeText((await link).url);
            }
            copied = true;
        } catch {
            // The dialog still allows copying if the browser denies clipboard access.
        }

        const { url, fallback } = await link;
        if (session !== current) return;
        const access = privateLink ? '이 링크를 가진 사람에게 조작 권한이 있습니다.' : '';
        if (!copied) {
            setText(el('copy-title'), privateLink ? el('control-link-label').textContent : el('share-label').textContent);
            setText(el('copy-description'), access ? `아래 링크를 선택해 복사하세요. ${access}` : '아래 링크를 선택해 복사하세요.');
            el('copy-value').value = url;
            el(privateLink ? 'control-link-btn' : 'share-btn').focus({ preventScroll: true });
            el('copy-dialog').showModal();
            el('copy-value').select();
        }
        const result = copied ? '링크를 복사했습니다.' : '';
        const original = fallback ? '짧은 링크를 만들 수 없어 원래 주소를 사용합니다.' : '';
        setText(feedback, [result, original, copied && access].filter(Boolean).join(' '));
    } catch {
        if (session === current) setText(feedback, '공유 링크를 만들 수 없습니다. 다시 시도하세요.');
    } finally {
        current.copying = false;
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
el('duration-input-group').addEventListener('input', updatePresetSelection);
for (const button of document.querySelectorAll('[data-minutes]')) {
    button.addEventListener('click', () => {
        el('countdown-hours').value = 0;
        el('countdown-minutes').value = button.dataset.minutes;
        el('countdown-seconds').value = 0;
        updatePresetSelection();
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
el('landing-view').addEventListener('pointerdown', event => {
    const pending = el('timer-list-container').querySelector('.confirming');
    if (pending && !pending.contains(event.target)) setRemovalConfirmation(pending, false);
});
el('back-to-home').onclick = () => { window.location.hash = ''; };
el('retry-btn').onclick = openRoute;
el('reset-btn').onclick = () => performCommand({ type: 'reset' });
el('restart-btn').onclick = () => performCommand({ type: 'restart' });
el('toggle-btn').onclick = event => performCommand({ type: event.currentTarget.dataset.command });
el('change-target-btn').onclick = () => {
    session.targetEditRevision = session.timer.revision;
    fillDate('new-target', session.timer.targetAt > 0 ? session.timer.targetAt : nextWholeHour(nowFor(session)));
    setText(el('target-feedback'), '');
    el('change-target-btn').focus({ preventScroll: true });
    el('change-target-modal').showModal();
};
el('cancel-change-btn').onclick = () => el('change-target-modal').close();
el('change-target-form').onsubmit = async event => {
    event.preventDefault();
    const current = session;
    const dialog = el('change-target-modal');
    const status = el('target-feedback');
    const button = el('confirm-change-btn');
    if (button.disabled) return;
    button.disabled = true;
    try {
        const targetAt = dateFromFields('new-target');
        const applied = await performCommand({ type: 'setDeadline', targetAt }, status, current?.targetEditRevision);
        if (session !== current || !dialog.open) return;
        if (applied) dialog.close();
        else if (current?.isLive && !current.online) setText(status, '연결이 복구된 뒤 다시 적용하세요.');
    } catch (error) {
        setText(status, message(error, errors.invalidDate));
    } finally {
        button.disabled = false;
    }
};
el('share-btn').onclick = () => copyLink(false);
el('control-link-btn').onclick = () => copyLink(true);
el('promote-btn').onclick = () => {
    const settings = settingsFromLegacy(session.timer, Date.now());
    const status = el('timer-feedback');
    if (!settings) setText(status, '기존 설정을 복원할 수 없습니다. 새 타이머를 만들거나 종료 시각을 다시 설정하세요.');
    else void create(settings, status, session);
};
el('fullscreen-btn').onclick = async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await el('app').requestFullscreen();
    } catch {
        setText(el('timer-feedback'), '이 화면에서 전체 화면을 열 수 없습니다.');
    }
};
document.addEventListener('fullscreenchange', () => {
    const fullscreen = document.fullscreenElement === el('app');
    el('fullscreen-icon').setAttribute('href', fullscreen ? '#icon-minimize' : '#icon-maximize');
    setActionLabel('fullscreen-btn', 'fullscreen-label', fullscreen ? '전체 화면 닫기' : '전체 화면');
});
el('alarm-btn').onclick = toggleAlarm;
for (const mode of displayModes) {
    el(`mode-${mode}-btn`).onclick = () => {
        setDisplayMode(mode);
    };
}
el('theme-toggle').onclick = () => {
    const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(next);
    write('theme', next);
};
colors.addEventListener('change', () => setTheme(preferredTheme()));
window.addEventListener('hashchange', () => {
    openRoute();
    window.scrollTo(0, 0);
    if (document.fullscreenElement === el('app')) el('app').scrollTop = 0;
    el(window.location.hash ? 'timer-name-display' : 'landing-title').focus({ preventScroll: true });
});
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
