import { ImageResponse } from '@vercel/og';

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url, 'https://timeronlineshare.vercel.app');
        const v = searchParams.get('v');

        // Helper inline functions to avoid dependencies
        const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const fromB64 = (s) => {
            if (!s) return 0;
            let res = 0;
            for (let i = 0; i < s.length; i++) {
                res = res * 64 + B64_CHARS.indexOf(s[i]);
            }
            return res;
        };

        const parseTimerState = (v) => {
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
        };

        const state = parseTimerState(v) || { type: 'countdown', isActive: false, pauseTime: 600, timerName: '' };
        const totalSeconds = Math.floor(state.pauseTime);
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        const timeStr = `${h}:${m}:${s}`;

        const typeLabel = state.type === 'countdown' ? '타이머' : '스톱워치';
        const statusLabel = state.isActive ? '진행 중' : '일시정지';
        const timerName = state.timerName || typeLabel;

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
                        backgroundColor: '#f0fdfa',
                        backgroundImage: 'linear-gradient(135deg, #e6fffa 0%, #f0fff4 100%)',
                    }}
                >
                    <div style={{ fontSize: 40, fontWeight: 'bold', color: '#008080', marginBottom: 20 }}>Online Timer</div>
                    <div style={{ fontSize: 50, fontWeight: 'bold', color: '#1f2937', marginBottom: 40 }}>{timerName}</div>
                    <div style={{ display: 'flex', padding: '40px 80px', backgroundColor: 'white', borderRadius: '30px', border: '4px solid #008080' }}>
                        <div style={{ fontSize: 100, fontWeight: 900, color: '#0d9488' }}>{timeStr}</div>
                    </div>
                    <div style={{ fontSize: 36, color: '#6b7280', marginTop: 40 }}>{typeLabel} • {statusLabel}</div>
                    <div style={{ position: 'absolute', bottom: 40, fontSize: 24, color: '#9ca3af' }}>timeronlineshare.vercel.app</div>
                </div>
            ),
            { width: 1200, height: 630 }
        );
    } catch (e) {
        return new Response(`Error: ${e.message}`, { status: 500 });
    }
}
