# Online Timer

간편하고 깔끔한 웹 기반 타이머 애플리케이션입니다. 카운트다운 타이머와 스톱워치 기능을 제공하며, URL 링크를 통해 타이머 상태를 공유할 수 있습니다.

## 🌐 Demo

[https://timeronline.vercel.app](https://timeronline.vercel.app)

## ✨ 주요 기능

### 🕐 카운트다운 타이머
- **시간 설정 모드**: 시, 분, 초 단위로 원하는 시간 설정
- **종료 시점 설정 모드**: 특정 날짜/시간을 목표로 카운트다운
- 종료 시 알림음 및 브라우저 알림 지원

### ⏱️ 스톱워치
- **바로 시작**: 즉시 시작하는 스톱워치
- **시작 시점 설정**: 특정 날짜/시간부터 시작되는 스톱워치
- 밀리초 단위 표시

### 🔗 링크 공유
- 현재 타이머 상태를 압축된 URL로 공유
- 공유받은 링크로 동일한 타이머 상태 즉시 재현

### 📋 타이머 관리
- 로컬 스토리지에 타이머 저장
- 타이머 목록에서 이전 타이머 빠르게 접근
- 삭제 전 확인 단계로 실수 방지

### 🌙 다크 모드
- 시스템 설정 자동 감지
- 수동 토글 지원
- 설정 저장 및 유지

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript (ES6+)
- **Styling**: CSS3 with CSS Variables
- **Storage**: LocalStorage
- **Font**: Inter (Google Fonts)

## 📁 프로젝트 구조

```
OnlineTimer/
├── index.html      # 메인 HTML 파일
├── main.js         # 핵심 JavaScript 로직
├── style.css       # 스타일시트
├── package.json    # 프로젝트 메타데이터
└── README.md       # 문서
```

## 🚀 로컬 실행

```bash
# 저장소 클론
git clone https://github.com/your-username/OnlineTimer.git
cd OnlineTimer

# 의존성 설치 (개발 서버용)
npm install

# 개발 서버 실행
npm run dev
```

또는 간단히 `index.html`을 브라우저에서 직접 열어도 됩니다.

## 📦 배포

### Vercel
```bash
vercel
```

### GitHub Pages
`index.html`, `main.js`, `style.css` 파일을 저장소에 푸시하고 GitHub Pages를 활성화하면 됩니다.

## 🔧 주요 기술적 특징

### 상태 관리
단일 `state` 객체를 통한 간단하고 명확한 상태 관리:
```javascript
const state = {
    view: 'landing',      // 현재 뷰
    type: 'countdown',    // 타이머 타입
    timerActive: false,   // 활성 상태
    startTime: null,      // 시작 시간
    pauseTime: 0,         // 일시정지 시 남은/경과 시간
    // ...
};
```

### URL 기반 공유
Base64 인코딩을 사용한 압축된 공유 링크:
- 타입, 모드, 상태를 비트 플래그로 압축
- 시간 값은 커스텀 EPOCH 기준 인코딩
- 최소한의 URL 길이로 공유 가능

### 반응형 시간 표시
`clamp()`를 활용한 반응형 폰트 크기:
```css
.timer-display {
    font-size: clamp(2rem, 13vw, 15rem);
}
```

### 테마 시스템
CSS Variables를 활용한 다크 모드:
```css
:root {
    --primary-teal: #008080;
    --bg-white: #ffffff;
}

body.dark-mode {
    --bg-white: #1a202c;
}
```

## 📄 라이선스

MIT License

## 🙏 기여

이슈와 PR은 언제나 환영합니다!
