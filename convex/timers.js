import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { ACCESS_KEY, MAX_DURATION_MS, ROOM_ID, createTimerState, isDateTime, transitionTimer } from '../timer-model.js';
import { mode, phase } from './schema.js';

const access = { roomId: v.string(), key: v.string() };

function findTimer(ctx, roomId) {
    return ctx.db.query('timers').withIndex('by_room', index => index.eq('roomId', roomId)).unique();
}

function publicTimer(timer) {
    const { roomId, revision, name, mode, durationMs, targetAt, phase, valueMs, anchorAt, startedAt } = timer;
    return { roomId, revision, name, mode, durationMs, targetAt, phase, valueMs, anchorAt, startedAt };
}

async function hashKey(key) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function matchingTimer(ctx, { roomId, key }) {
    if (!ROOM_ID.test(roomId) || !ACCESS_KEY.test(key)) return null;
    const timer = await findTimer(ctx, roomId);
    return timer && timer.accessHash === await hashKey(key) ? timer : null;
}

export const get = query({
    args: { roomId: v.string() },
    handler: async (ctx, { roomId }) => {
        const timer = ROOM_ID.test(roomId) ? await findTimer(ctx, roomId) : null;
        return timer ? publicTimer(timer) : null;
    }
});

export const authorize = query({
    args: access,
    handler: async (ctx, args) => {
        const timer = await matchingTimer(ctx, args);
        return timer ? (timer.mode === 'deadline' ? 'manage' : 'control') : null;
    }
});

export const clock = query({
    args: { nonce: v.string() },
    handler: (_ctx, { nonce }) => {
        if (!ROOM_ID.test(nonce)) throw new ConvexError('invalid');
        return Date.now();
    }
});

export const create = mutation({
    args: {
        ...access,
        name: v.string(),
        mode,
        durationMs: v.optional(v.number()),
        targetAt: v.optional(v.number()),
        seed: v.optional(v.object({
            phase,
            valueMs: v.number(),
            anchorAt: v.number(),
            startedAt: v.number()
        }))
    },
    handler: async (ctx, { roomId, key, name, mode, durationMs, targetAt, seed }) => {
        if (!ROOM_ID.test(roomId) || !ACCESS_KEY.test(key) || name.length > 30) throw new ConvexError('invalid');

        const accessHash = await hashKey(key);
        const previous = await findTimer(ctx, roomId);
        if (previous) {
            if (previous.accessHash !== accessHash) throw new ConvexError('collision');
            return publicTimer(previous);
        }

        const now = Date.now();
        if (mode === 'duration' && (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > MAX_DURATION_MS)) {
            throw new ConvexError('invalidDuration');
        }
        if ((mode === 'deadline' || mode === 'scheduled') && !isDateTime(targetAt)) {
            throw new ConvexError('invalidDate');
        }
        if (mode === 'deadline' && !seed && targetAt <= now) throw new ConvexError('futureRequired');

        const state = createTimerState({ name: name.trim(), mode, durationMs, targetAt }, now);
        if (seed) {
            const maxValue = mode === 'duration' ? durationMs : 8.64e15;
            if (!isDateTime(seed.valueMs) || seed.valueMs > maxValue || !isDateTime(seed.anchorAt)
                || !isDateTime(seed.startedAt) || (seed.phase === 'running' && !seed.anchorAt && mode !== 'deadline')) {
                throw new ConvexError('invalid');
            }
            if (mode !== 'deadline') Object.assign(state, seed);
        }

        const timer = { ...state, roomId, accessHash, revision: 0 };
        await ctx.db.insert('timers', timer);
        return publicTimer(timer);
    }
});

const command = v.union(
    v.object({ type: v.literal('start') }),
    v.object({ type: v.literal('pause') }),
    v.object({ type: v.literal('reset') }),
    v.object({ type: v.literal('restart') }),
    v.object({ type: v.literal('setDeadline'), targetAt: v.number() })
);

export const apply = mutation({
    args: { ...access, expectedRevision: v.number(), command },
    handler: async (ctx, args) => {
        const timer = await matchingTimer(ctx, args);
        if (!timer) throw new ConvexError('forbidden');
        if (timer.revision !== args.expectedRevision) {
            return { applied: false, reason: 'conflict', timer: publicTimer(timer) };
        }

        const now = Date.now();
        const next = transitionTimer(publicTimer(timer), args.command, now);
        if (!next) {
            const reason = args.command.type === 'setDeadline' && timer.mode === 'deadline' ? 'futureRequired' : 'invalidAction';
            return { applied: false, reason, timer: publicTimer(timer) };
        }

        next.revision += 1;
        await ctx.db.patch(timer._id, next);
        return { applied: true, timer: next };
    }
});
