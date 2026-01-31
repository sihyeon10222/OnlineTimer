import { ImageResponse } from '@vercel/og';

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
    const modeBit = (flags & 2);
    const isActive = !!(flags & 4);

    const EPOCH = 1735689600000; // 2025-01-01
    const pauseTime = fromB64(parts[1]) / 1000 || 0;

    let startTime = null;
    if (parts[2]) {
        startTime = fromB64(parts[2]) + EPOCH;
    }

    let actualStartTime = null;
    if (parts.length >= 4 && parts[3]) {
        actualStartTime = parts[3] === '-' ? startTime : fromB64(parts[3]) + EPOCH;
    }

    let duration = pauseTime;
    if (parts.length >= 5 && parts[4]) {
        duration = parts[4] === '-' ? pauseTime : fromB64(parts[4]) / 1000;
    }

    const timerName = parts[5] ? decodeURIComponent(parts[5]) : '';

    return {
        type,
        isActive,
        pauseTime,
        startTime,
        actualStartTime,
        duration,
        timerName
    };
}

function formatTime(totalSeconds) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    let timeStr = '';
    if (d > 0) {
        timeStr = `${d}일 `;
    }
    timeStr += [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].join(':');

    return timeStr;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours();
    const ampm = hours >= 12 ? '오후' : '오전';
    const hour12 = hours % 12 || 12;
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${ampm} ${hour12}:${minutes}`;
}

export default function handler(request) {
    try {
        const { searchParams } = new URL(request.url);
        const v = searchParams.get('v');

        const state = parseTimerState(v) || {
            type: 'countdown',
            isActive: false,
            pauseTime: 600,
            startTime: null,
            timerName: '타이머'
        };

        // Calculate display time
        let displaySeconds = state.pauseTime;
        if (state.isActive && state.startTime) {
            const now = Date.now();
            const elapsed = (now - state.startTime) / 1000;
            if (state.type === 'countdown') {
                displaySeconds = Math.max(0, state.pauseTime - elapsed);
            } else {
                displaySeconds = Math.max(0, state.pauseTime + elapsed);
            }
        }

        const timeStr = formatTime(Math.floor(displaySeconds));
        const timerName = state.timerName || (state.type === 'countdown' ? '타이머' : '스톱워치');
        const typeLabel = state.type === 'countdown' ? '타이머' : '스톱워치';

        let statusLabel = '';
        if (state.isActive) {
            statusLabel = '진행 중';
        } else if (state.type === 'countdown' && state.pauseTime <= 0) {
            statusLabel = '종료됨';
        } else {
            statusLabel = '일시정지';
        }

        let infoText = '';
        if (state.startTime) {
            if (state.type === 'countdown' && state.isActive) {
                const endPoint = state.startTime + state.pauseTime * 1000;
                infoText = `종료 예정: ${formatDateTime(endPoint)}`;
            } else if (state.type === 'stopwatch' && state.actualStartTime) {
                infoText = `시작 시간: ${formatDateTime(state.actualStartTime)}`;
            }
        }

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #e6fffa 0%, #f0fff4 100%)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                >
                    {/* Decorative circles */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -100,
                            left: -100,
                            width: 400,
                            height: 400,
                            borderRadius: '50%',
                            background: 'rgba(0, 128, 128, 0.1)',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: -150,
                            right: -100,
                            width: 500,
                            height: 500,
                            borderRadius: '50%',
                            background: 'rgba(0, 128, 128, 0.1)',
                        }}
                    />

                    {/* Brand */}
                    <div
                        style={{
                            fontSize: 36,
                            fontWeight: 700,
                            color: '#008080',
                            marginBottom: 20,
                        }}
                    >
                        Online Timer
                    </div>

                    {/* Timer Name */}
                    <div
                        style={{
                            fontSize: 42,
                            fontWeight: 700,
                            color: '#2d3748',
                            marginBottom: 30,
                        }}
                    >
                        {timerName.length > 20 ? timerName.substring(0, 20) + '...' : timerName}
                    </div>

                    {/* Time Display Box */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '30px 60px',
                            background: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: 20,
                            border: '3px solid #008080',
                            boxShadow: '0 8px 32px rgba(0, 128, 128, 0.2)',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 72,
                                fontWeight: 900,
                                color: '#008080',
                                letterSpacing: -2,
                            }}
                        >
                            {timeStr}
                        </div>
                    </div>

                    {/* Status */}
                    <div
                        style={{
                            fontSize: 32,
                            color: '#718096',
                            marginTop: 30,
                        }}
                    >
                        {typeLabel} • {statusLabel}
                    </div>

                    {/* Additional Info */}
                    {infoText && (
                        <div
                            style={{
                                fontSize: 24,
                                color: '#a0aec0',
                                marginTop: 15,
                            }}
                        >
                            {infoText}
                        </div>
                    )}

                    {/* Footer */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 30,
                            fontSize: 20,
                            color: '#cbd5e0',
                        }}
                    >
                        timeronline.vercel.app
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (e) {
        console.error('OG Image generation error:', e);
        return new Response('Failed to generate image', { status: 500 });
    }
}
