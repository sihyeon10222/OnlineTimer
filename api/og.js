import { ImageResponse } from '@vercel/og';
import { html } from 'satori-html';

export const config = {
    runtime: 'edge',
};

// Helper to decode base64 URL-safe format
function fromB64(s) {
    if (!s) return 0;
    const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let res = 0;
    for (let i = 0; i < s.length; i++) {
        res = res * 64 + B64_CHARS.indexOf(s[i]);
    }
    return res;
}

// Parse the compact share URL format
function parseTimerState(v) {
    if (!v) return null;

    const parts = v.split(',');
    if (parts.length < 2) return null;

    const flags = fromB64(parts[0]);
    const type = (flags & 1) ? 'stopwatch' : 'countdown';
    const isActive = !!(flags & 4);

    const EPOCH = 1735689600000; // 2025-01-01
    const pauseTime = fromB64(parts[1]) / 1000 || 0;

    const timerName = parts[5] ? decodeURIComponent(parts[5]) : '';

    return {
        type,
        isActive,
        pauseTime,
        timerName
    };
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    return [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].join(':');
}

export default async function handler(request) {
    const { searchParams } = new URL(request.url);
    const v = searchParams.get('v');

    const state = parseTimerState(v) || {
        type: 'countdown',
        isActive: false,
        pauseTime: 600,
        timerName: ''
    };

    const timeStr = formatTime(state.pauseTime);
    const timerName = state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치');
    const displayName = timerName.length > 20 ? timerName.substring(0, 20) + '...' : timerName;
    const typeLabel = state.type === 'countdown' ? '타이머' : '스톱워치';
    const statusLabel = state.isActive ? '진행 중' : '일시정지';

    const markup = html`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #e6fffa 0%, #f0fff4 100%); font-family: sans-serif;">
            <div style="font-size: 36px; font-weight: bold; color: #008080; margin-bottom: 20px;">Online Timer</div>
            <div style="font-size: 42px; font-weight: bold; color: #2d3748; margin-bottom: 30px;">${displayName}</div>
            <div style="display: flex; align-items: center; justify-content: center; padding: 30px 60px; background: rgba(255,255,255,0.9); border-radius: 20px; border: 3px solid #008080;">
                <div style="font-size: 72px; font-weight: 900; color: #008080;">${timeStr}</div>
            </div>
            <div style="font-size: 32px; color: #718096; margin-top: 30px;">${typeLabel} • ${statusLabel}</div>
            <div style="position: absolute; bottom: 30px; font-size: 20px; color: #cbd5e0;">timeronlineshare.vercel.app</div>
        </div>
    `;

    return new ImageResponse(markup, {
        width: 1200,
        height: 630,
    });
}
