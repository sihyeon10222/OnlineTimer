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
    const typeLabel = state.type === 'countdown' ? '타이머' : '스톱워치';
    const statusLabel = state.isActive ? '진행 중' : '일시정지';

    return new ImageResponse(
        {
            type: 'div',
            props: {
                tw: 'flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-teal-100 to-green-100',
                children: [
                    {
                        type: 'div',
                        props: {
                            tw: 'text-4xl font-bold text-teal-600 mb-4',
                            children: 'Online Timer'
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            tw: 'text-5xl font-bold text-gray-800 mb-8',
                            children: timerName.length > 20 ? timerName.substring(0, 20) + '...' : timerName
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            tw: 'flex items-center justify-center px-16 py-8 bg-white rounded-3xl border-4 border-teal-500',
                            children: {
                                type: 'div',
                                props: {
                                    tw: 'text-7xl font-black text-teal-600',
                                    children: timeStr
                                }
                            }
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            tw: 'text-3xl text-gray-500 mt-8',
                            children: `${typeLabel} • ${statusLabel}`
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            tw: 'absolute bottom-8 text-xl text-gray-400',
                            children: 'timeronlineshare.vercel.app'
                        }
                    }
                ]
            }
        },
        {
            width: 1200,
            height: 630,
        }
    );
}
