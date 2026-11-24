import { MAX_DURATION_MS, isDateTime, timerReading } from './timer-model.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const epoch = 1735689600000;
const validModes = ['normal', 'minutes', 'seconds'];

function decodeNumber(value, base36) {
    const digits = base36 ? '0123456789abcdefghijklmnopqrstuvwxyz' : alphabet;
    let result = 0;
    for (const digit of value ?? '') {
        const index = digits.indexOf(digit);
        if (index < 0) throw new Error('Invalid snapshot');
        result = result * digits.length + index;
        if (!Number.isSafeInteger(result)) throw new Error('Invalid snapshot');
    }
    return result;
}

export function decodeSnapshot(data, now) {
    try {
        const base36 = data.includes('!');
        const [encodedFlags, value, anchor, started, duration, name, ...extra] = data.split(base36 ? '!' : ',');
        if (extra.length || !data || data.length > 2048) return null;
        const number = input => decodeNumber(input, base36);
        const flags = number(encodedFlags);
        if (flags > 7) return null;

        const active = Boolean(flags & 4);
        const startTime = anchor ? number(anchor) + epoch : active ? now : null;
        return normalizeLegacy({
            type: flags & 1 ? 'stopwatch' : 'countdown',
            countdownMode: flags & 2 ? 'target' : 'duration',
            stopwatchMode: flags & 2 ? 'target' : 'immediate',
            active,
            pauseTime: number(value) / 1000,
            startTime,
            actualStartTime: started === '-' ? startTime : started ? number(started) + epoch : null,
            duration: duration && duration !== '-' ? number(duration) / 1000 : number(value) / 1000,
            timerName: name ? decodeURIComponent(name) : ''
        }, now);
    } catch {
        return null;
    }
}

function milliseconds(seconds) {
    const value = Math.round(Number(seconds) * 1000);
    return Number.isSafeInteger(value) && value <= 8.64e15 ? Math.max(0, value) : null;
}

export function normalizeLegacy(data, now) {
    if (!data || !['countdown', 'stopwatch'].includes(data.type)) return null;
    const valueMs = milliseconds(data.pauseTime);
    if (valueMs === null) return null;
    const anchorAt = isDateTime(data.startTime) ? data.startTime : 0;
    const startedAt = isDateTime(data.actualStartTime) ? data.actualStartTime : 0;
    const running = Boolean(data.active && anchorAt);
    const durationMs = Math.max(milliseconds(data.duration) ?? 0, valueMs);
    const timer = {
        name: typeof data.timerName === 'string' ? data.timerName : '',
        mode: 'duration',
        phase: running ? 'running' : valueMs < durationMs ? 'paused' : 'ready',
        durationMs,
        targetAt: 0,
        anchorAt: running ? anchorAt : 0,
        startedAt,
        valueMs
    };

    if (data.type === 'stopwatch') {
        const scheduled = data.stopwatchMode === 'target' || (data.stopwatchMode !== 'immediate' && running && anchorAt > now);
        return {
            ...timer,
            mode: scheduled ? 'scheduled' : 'immediate',
            phase: running ? 'running' : valueMs || startedAt ? 'paused' : 'ready',
            targetAt: scheduled ? startedAt || anchorAt : 0,
            startedAt: startedAt || (running ? anchorAt : 0),
            durationMs: 0
        };
    }

    if (data.countdownMode === 'target') {
        const savedTarget = isDateTime(data.targetAt) ? data.targetAt : 0;
        const inferredTarget = anchorAt && isDateTime(anchorAt + valueMs) ? anchorAt + valueMs : 0;
        return { ...timer, mode: 'deadline', targetAt: savedTarget || inferredTarget };
    }
    return timer;
}

export function toLegacy(timer) {
    const countdown = timer.mode === 'duration' || timer.mode === 'deadline';
    const deadline = timer.mode === 'deadline';
    return {
        type: countdown ? 'countdown' : 'stopwatch',
        countdownMode: deadline ? 'target' : 'duration',
        stopwatchMode: timer.mode === 'scheduled' ? 'target' : 'immediate',
        timerName: timer.name,
        active: deadline || timer.phase === 'running',
        startTime: deadline ? timer.targetAt : timer.anchorAt || null,
        actualStartTime: timer.startedAt || null,
        pauseTime: deadline ? 0 : timer.valueMs / 1000,
        duration: timer.durationMs / 1000,
        targetAt: timer.targetAt
    };
}

function encodeNumber(value) {
    let result = '';
    while (value > 0) {
        result = alphabet[value % 64] + result;
        value = Math.floor(value / 64);
    }
    return result;
}

export function encodeSnapshot(timer) {
    const data = toLegacy(timer);
    const flags = (data.type === 'stopwatch' ? 1 : 0)
        | (data.countdownMode === 'target' || data.stopwatchMode === 'target' ? 2 : 0)
        | (data.active ? 4 : 0);
    const elapsed = encodeNumber(timer.mode === 'deadline' ? 0 : timer.valueMs);
    const anchor = data.startTime ? encodeNumber(data.startTime - epoch) : '';
    const started = data.actualStartTime === data.startTime && data.startTime ? '-'
        : data.actualStartTime ? encodeNumber(data.actualStartTime - epoch) : '';
    const duration = !data.duration || data.duration === data.pauseTime ? '-' : encodeNumber(timer.durationMs);
    return `#*${[encodeNumber(flags), elapsed, anchor, started, duration, encodeURIComponent(timer.name)].join(',').replace(/,+$/, '')}`;
}

export function settingsFromLegacy(timer, now) {
    const settings = { name: timer.name.slice(0, 30), mode: timer.mode };
    if (timer.mode === 'duration') {
        if (timer.durationMs < 1000 || timer.durationMs > MAX_DURATION_MS) return null;
        settings.durationMs = timer.durationMs;
    }
    if (timer.mode === 'deadline' || timer.mode === 'scheduled') {
        if (!timer.targetAt) return null;
        settings.targetAt = timer.targetAt;
    }

    const reading = timerReading(timer, now);
    settings.seed = reading.status === 'finished' && timer.mode === 'duration'
        ? { phase: 'paused', valueMs: 0, anchorAt: 0, startedAt: timer.startedAt }
        : { phase: timer.phase, valueMs: timer.valueMs, anchorAt: timer.anchorAt, startedAt: timer.startedAt };
    return settings;
}
