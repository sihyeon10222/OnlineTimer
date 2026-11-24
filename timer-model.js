export const MAX_DURATION_MS = (100 * 3600 - 1) * 1000;

export function isCountdown(timer) {
    return timer.mode === 'duration' || timer.mode === 'deadline';
}

export function isDateTime(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

export function timerReading(timer, now) {
    if (timer.mode === 'deadline') {
        const valueMs = Math.max(0, timer.targetAt - now);
        return { valueMs, status: valueMs > 0 ? 'running' : 'finished', endAt: timer.targetAt };
    }

    if (timer.phase !== 'running') {
        const finished = timer.mode === 'duration' && timer.valueMs === 0;
        return { valueMs: timer.valueMs, status: finished ? 'finished' : timer.phase };
    }

    if (timer.mode === 'scheduled' && now < timer.anchorAt) {
        return { valueMs: 0, status: 'waiting' };
    }

    const elapsed = Math.max(0, now - timer.anchorAt);
    if (timer.mode === 'duration') {
        const valueMs = Math.max(0, timer.valueMs - elapsed);
        return {
            valueMs,
            status: valueMs > 0 ? 'running' : 'finished',
            endAt: timer.anchorAt + timer.valueMs
        };
    }
    return { valueMs: timer.valueMs + elapsed, status: 'running' };
}

export function createTimerState(settings, now) {
    const { mode, name, durationMs, targetAt } = settings;
    const timer = { mode, name, durationMs: 0, targetAt: 0, phase: 'ready', valueMs: 0, anchorAt: 0, startedAt: 0 };

    if (mode === 'duration') return { ...timer, durationMs, valueMs: durationMs };
    if (mode === 'deadline') return { ...timer, targetAt, phase: 'running' };

    const start = mode === 'scheduled' ? targetAt : now;
    return { ...timer, phase: 'running', anchorAt: start, startedAt: start };
}

export function transitionTimer(timer, command, now) {
    if (timer.mode === 'deadline') {
        if (command.type !== 'setDeadline' || !isDateTime(command.targetAt) || command.targetAt <= now) return null;
        return { ...timer, targetAt: command.targetAt };
    }

    const { status, valueMs } = timerReading(timer, now);
    switch (command.type) {
        case 'start':
            if (status !== 'ready' && status !== 'paused') return null;
            return { ...timer, phase: 'running', anchorAt: now, startedAt: timer.startedAt || now };
        case 'pause':
            if (status !== 'running') return null;
            return { ...timer, phase: 'paused', valueMs: Math.round(valueMs), anchorAt: 0 };
        case 'reset':
            return { ...timer, phase: 'ready', valueMs: timer.durationMs, anchorAt: 0, startedAt: 0 };
        case 'restart':
            return { ...timer, phase: 'running', valueMs: timer.durationMs, anchorAt: now, startedAt: now };
        default:
            return null;
    }
}

export function randomHex(byteCount) {
    return Array.from(crypto.getRandomValues(new Uint8Array(byteCount)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const ROOM_ID = /^[0-9a-f]{32}$/;
export const ACCESS_KEY = /^[0-9a-f]{64}$/;
export const SHARE_CODE = /^[A-Za-z0-9_-]{22}$/;
