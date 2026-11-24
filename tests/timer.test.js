import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimerState, timerReading, transitionTimer } from '../timer-model.js';
import { decodeSnapshot, encodeSnapshot, normalizeLegacy, settingsFromLegacy, toLegacy } from '../legacy.js';

const now = 1760000000000;
const command = (timer, type, at) => transitionTimer(timer, { type }, at);

test('countdown computes pause/resume, expiration, reset and restart from timestamps', () => {
    const initial = createTimerState({ mode: 'duration', name: '', durationMs: 10000 }, now);
    assert.deepEqual(timerReading(initial, now + 5000), { valueMs: 10000, status: 'ready' });
    const running = command(initial, 'start', now);
    const paused = command(running, 'pause', now + 1500);
    assert.deepEqual(timerReading(paused, now + 99000), { valueMs: 8500, status: 'paused' });
    const resumed = command(paused, 'start', now + 10000);
    assert.equal(timerReading(resumed, now + 18499).valueMs, 1);
    assert.equal(timerReading(resumed, now + 18500).status, 'finished');
    assert.equal(command(resumed, 'pause', now + 18500), null);
    assert.equal(command(resumed, 'start', now + 18500), null);
    assert.equal(timerReading(command(resumed, 'reset', now + 20000), now + 20500).valueMs, 10000);
    assert.equal(timerReading(command(resumed, 'restart', now + 20000), now + 20500).valueMs, 9500);
});

test('deadline only supports moving to a valid future instant', () => {
    const original = createTimerState({ mode: 'deadline', name: '', targetAt: now + 10000 }, now);
    assert.equal(timerReading(original, now + 10000).status, 'finished');
    for (const type of ['pause', 'reset', 'restart', 'start']) assert.equal(command(original, type, now), null);
    assert.equal(transitionTimer(original, { type: 'setDeadline', targetAt: now }, now), null);
    const changed = transitionTimer(original, { type: 'setDeadline', targetAt: now + 30000 }, now);
    assert.equal(timerReading(changed, now + 20000).valueMs, 10000);
});

test('scheduled stopwatch waits, starts at an absolute time, and retains elapsed time through pause', () => {
    const initial = createTimerState({ mode: 'scheduled', name: '', targetAt: now + 10000 }, now);
    assert.equal(timerReading(initial, now + 9999).status, 'waiting');
    assert.equal(command(initial, 'pause', now + 9999), null);
    assert.equal(timerReading(initial, now + 10000).status, 'running');
    const paused = command(initial, 'pause', now + 12000);
    const resumed = command(paused, 'start', now + 20000);
    assert.equal(timerReading(resumed, now + 20500).valueMs, 2500);
    assert.equal(timerReading(command(initial, 'restart', now + 3000), now + 3500).valueMs, 500);
    assert.equal(timerReading(command(initial, 'reset', now + 3000), now + 12000).status, 'ready');
});

test('legacy saved state and compact snapshots retain elapsed time, name and absolute deadline', () => {
    const raw = { type: 'countdown', countdownMode: 'target', active: true, startTime: now, pauseTime: 80, duration: 100, timerName: '회,의' };
    const restored = normalizeLegacy(raw, now + 100);
    assert.equal(restored.targetAt, now + 80000);
    assert.equal(timerReading(restored, now + 300).valueMs, 79700);
    const snapshot = encodeSnapshot(restored);
    assert.equal(decodeSnapshot(snapshot.slice(2), now).name, '회,의');
    assert.equal(decodeSnapshot(snapshot.slice(2), now).targetAt, now + 80000);
    assert.equal(normalizeLegacy(toLegacy(restored), now).targetAt, now + 80000);
    assert.equal(settingsFromLegacy(restored, now + 300).targetAt, now + 80000);
    assert.equal(decodeSnapshot('B', now).mode, 'immediate');
    assert.equal(decodeSnapshot('??,%', now), null);
    assert.equal(normalizeLegacy({ type: 'countdown', pauseTime: 'NaN' }, now), null);
});
