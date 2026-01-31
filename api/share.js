export default function handler(req, res) {
    const { searchParams } = new URL(req.url, `https://${req.headers.host}`);
    const v = searchParams.get('v');
    const baseUrl = `https://${req.headers.host}`;

    if (!v) {
        return new Response(null, {
            status: 302,
            headers: { Location: '/' }
        });
    }

    const ogImageUrl = `${baseUrl}/api/og?v=${encodeURIComponent(v)}`;
    const appUrl = `${baseUrl}/#*v=${v}`;

    // Return a minimal HTML that crawlers can read, and users will be redirected from
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>실시간 공유 타이머 | TimerOnline</title>
    <meta property="og:title" content="실시간 공유 타이머 | TimerOnline">
    <meta property="og:description" content="실시간으로 동기화되는 온라인 타이머를 확인해보세요.">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${ogImageUrl}">
    <script>window.location.href = "${appUrl}";</script>
    <meta http-equiv="refresh" content="0;url=${appUrl}">
</head>
<body>
    <p>타이머로 이동 중입니다... <a href="${appUrl}">직접 이동하기</a></p>
</body>
</html>
    `.trim();

    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
}
