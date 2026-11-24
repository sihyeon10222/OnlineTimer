import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { ACCESS_KEY, ROOM_ID, randomHex } from './timer-model.js';

const api = {
    get: makeFunctionReference('timers:get'),
    create: makeFunctionReference('timers:create'),
    apply: makeFunctionReference('timers:apply'),
    authorize: makeFunctionReference('timers:authorize'),
    clock: makeFunctionReference('timers:clock')
};

const url = import.meta.env.VITE_CONVEX_URL;
let httpClient;

function http() {
    if (!url) throw new Error('missingBackend');
    httpClient ??= new ConvexHttpClient(url, {
        logger: false,
        fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(8000) })
    });
    return httpClient;
}

export function parseLiveHash(hash) {
    const [, prefix, roomId, role, key, ...extra] = hash.split('/');
    if (prefix !== 'live' || !ROOM_ID.test(roomId ?? '') || extra.length) return null;
    if (role === undefined) return { roomId, role: 'view' };
    if ((role === 'control' || role === 'manage') && ACCESS_KEY.test(key ?? '')) return { roomId, role, key };
    return null;
}

export function liveHash(roomId, role, key) {
    const view = `#/live/${roomId}`;
    return key ? `${view}/${role}/${key}` : view;
}

export function createLiveTimer(args) {
    return http().mutation(api.create, args);
}

export function changeLiveTimer(args) {
    return http().mutation(api.apply, args);
}

export function getLiveTimer(roomId) {
    return http().query(api.get, { roomId });
}

export function authorizeLiveTimer(roomId, key) {
    return http().query(api.authorize, { roomId, key });
}

export async function measureServerClock() {
    const sentAt = performance.now();
    const serverAt = await http().query(api.clock, { nonce: randomHex(16) });
    const receivedAt = performance.now();
    return { at: receivedAt, epoch: serverAt + (receivedAt - sentAt) / 2 };
}

export function watchLiveTimer(roomId, onTimer, onConnection, onError) {
    if (!url) throw new Error('missingBackend');
    const client = new ConvexClient(url, { logger: false });
    const stopState = client.onUpdate(api.get, { roomId }, onTimer, onError);
    const stopConnection = client.subscribeToConnectionState(({ isWebSocketConnected }) => onConnection(isWebSocketConnected));
    onConnection(client.connectionState().isWebSocketConnected);
    return () => {
        stopState();
        stopConnection();
        void client.close();
    };
}
