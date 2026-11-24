import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const mode = v.union(v.literal('duration'), v.literal('deadline'), v.literal('immediate'), v.literal('scheduled'));
export const phase = v.union(v.literal('ready'), v.literal('running'), v.literal('paused'));

export default defineSchema({
    timers: defineTable({
        roomId: v.string(),
        accessHash: v.string(),
        revision: v.number(),
        name: v.string(),
        mode,
        durationMs: v.number(),
        targetAt: v.number(),
        phase,
        valueMs: v.number(),
        anchorAt: v.number(),
        startedAt: v.number()
    }).index('by_room', ['roomId'])
});
