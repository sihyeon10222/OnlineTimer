export default function handler(req, res) {
    const { title, time, type, img, url } = req.query;

    // Use default fallback if img is missing
    const ogImage = img || 'https://timeronline.me/og-image.png';
    const displayTitle = title ? decodeURIComponent(title) : 'Online Timer';
    const displayTime = time ? decodeURIComponent(time) : '';
    const displayType = type === 'stopwatch' ? '스톱워치' : '타이머';

    const fullTitle = `${displayTime} ${displayTitle} | Online Timer`.trim();

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${fullTitle}</title>
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url || 'https://timeronline.me/'}">
    <meta property="og:title" content="${fullTitle}">
    <meta property="og:description" content="${displayType} 공유 중. 실시간으로 동기화되는 타이머를 확인해보세요.">
    <meta property="og:image" content="${ogImage}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${url || 'https://timeronline.me/'}">
    <meta property="twitter:title" content="${fullTitle}">
    <meta property="twitter:description" content="${displayType} 공유 중. 실시간으로 동기화되는 타이머를 확인해보세요.">
    <meta property="twitter:image" content="${ogImage}">

    <script>
        // Use the provided redirect URL or fallback to home
        const targetUrl = "${url || 'https://timeronline.me/'}";
        window.location.replace(targetUrl);
    </script>
</head>
<body>
    <p>타이머로 이동 중입니다... <a href="${url || 'https://timeronline.me/'}">여기를 클릭하세요</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');
    res.status(200).send(html);
}
