import { ImageResponse } from '@vercel/og';

export const config = {
    runtime: 'edge',
};

function fromB64(s) {
    if (!s) return 0;
    const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let res = 0;
    for (let i = 0; i < s.length; i++) {
        res = res * 64 + B64_CHARS.indexOf(s[i]);
    }
    return res;
}

function parseTimerState(v) {
    if (!v) return null;
    const parts = v.split(',');
    if (parts.length < 2) return null;
    const flags = fromB64(parts[0]);
    return {
        type: (flags & 1) ? 'stopwatch' : 'countdown',
        isActive: !!(flags & 4),
        pauseTime: fromB64(parts[1]) / 1000 || 0,
        timerName: parts[5] ? decodeURIComponent(parts[5]) : ''
    };
}

export default function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const v = searchParams.get('v');
        const state = parseTimerState(v) || { type: 'countdown', isActive: false, pauseTime: 600, timerName: '' };

        const totalSeconds = Math.floor(state.pauseTime);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        const typeLabel = state.type === 'countdown' ? '타이머' : '스톱워치';
        const statusLabel = state.isActive ? '진행 중' : '일시정지';
        const timerName = state.timerName || typeLabel;

        // Vercel OG satori-compatible object structure (no JSX)
        return new ImageResponse(
            {
                type: 'div',
                props: {
                    style: {
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f0fdfa',
                        backgroundImage: 'linear-gradient(135deg, #e6fffa 0%, #f0fff4 100%)',
                    },
                    children: [
                        {
                            type: 'div',
                            props: {
                                style: { fontSize: 40, fontWeight: 'bold', color: '#008080', marginBottom: 20 },
                                children: 'Online Timer'
                            }
                        },
                        {
                            type: 'div',
                            props: {
                                style: { fontSize: 50, fontWeight: 'bold', color: '#1f2937', marginBottom: 40 },
                                children: timerName.length > 20 ? timerName.substring(0, 20) + '...' : timerName
                            }
                        },
                        {
                            type: 'div',
                            props: {
                                style: {
                                    display: 'flex',
                                    padding: '40px 80px',
                                    backgroundColor: 'white',
                                    borderRadius: '30px',
                                    border: '4px solid #008080',
                                },
                                children: [
                                    {
                                        type: 'div',
                                        props: {
                                            style: { fontSize: 100, fontWeight: 900, color: '#0d9488' },
                                            children: timeStr
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            type: 'div',
                            props: {
                                style: { fontSize: 36, color: '#6b7280', marginTop: 40 },
                                children: `${typeLabel} • ${statusLabel}`
                            }
                        },
                        {
                            type: 'div',
                            props: {
                                style: { position: 'absolute', bottom: 40, fontSize: 24, color: '#9ca3af' },
                                children: 'timeronlineshare.vercel.app'
                            }
                        }
                    ]
                }
            },
            { width: 1200, height: 630 }
        );
    } catch (e) {
        // Return error as an image for visual debugging
        return new ImageResponse(
            {
                type: 'div',
                props: {
                    style: { height: '100%', width: '100%', backgroundColor: 'white', color: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 },
                    children: `Error: ${e.message}`
                }
            },
            { width: 1200, height: 630 }
        );
    }
}
