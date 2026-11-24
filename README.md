# Online Timer

여러 기기에서 같은 카운트다운과 스톱워치를 실시간으로 볼 수 있는 웹 타이머입니다. 화면은 Vite로 빌드하고, 상태는 Convex에 저장합니다.

[운영 사이트](https://timeronlineshare.vercel.app/)

## 링크 공유

- **보기 링크**를 받은 사람은 로그인 없이 같은 타이머와 진행 상태를 볼 수 있습니다.
- **조작 링크**를 가진 사람은 시간 설정 카운트다운과 스톱워치를 시작, 일시정지, 재개, 초기화하거나 다시 시작할 수 있습니다. 초기화하면 시작 전 상태로 돌아가고, 다시 시작하면 즉시 실행합니다.
- **비공개 관리 링크**를 가진 사람은 지정된 카운트다운의 종료 시각을 변경할 수 있습니다. 종료 시점 타이머는 지정한 시각에 끝납니다.
- 만든 타이머의 조작·관리 링크는 이 브라우저의 목록에서 다시 열 수 있습니다. 목록에서 제거해도 다른 기기에서 열었던 타이머는 유지됩니다.
- 기존 로컬 타이머와 스냅샷 링크도 열 수 있습니다. 해당 화면에서 **실시간 링크 만들기**를 선택하면 현재 상태를 바탕으로 공유 타이머를 만듭니다.
- 종료 알림은 열린 브라우저에서 직접 켤 수 있습니다. 브라우저의 백그라운드 실행 제한과 알림 권한에 따라 소리나 시스템 알림이 제한될 수 있습니다.

## 로컬 실행 및 테스트

Node.js 24를 사용합니다. 처음 로컬 백엔드를 실행할 때 Convex가 실행 파일을 내려받고 `.env.local`에 개발용 접속 주소를 설정합니다.

```bash
npm ci
CONVEX_AGENT_MODE=anonymous npm run dev:backend
```

백엔드를 켜 둔 상태에서 다른 터미널로 화면을 실행합니다.

```bash
npm run dev
```

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

이미 Chrome이 설치되어 있으면 `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`로 브라우저 테스트를 실행할 수 있습니다. 테스트는 기본적으로 `http://127.0.0.1:5173` 화면과 `http://127.0.0.1:3210` Convex를 사용합니다. 별도 미리보기에 실행하려면 `E2E_BASE_URL`과 `E2E_CONVEX_URL`을 지정합니다. 테스트는 지정된 백엔드에 테스트용 타이머를 생성합니다.

## Vercel 배포

1. Vercel의 기존 `timeronline` 프로젝트에 Convex를 연결합니다. Vercel Marketplace에서 연결할 때 Preview와 Production을 선택하고 변수 접두사는 비워 둡니다.
2. 각 환경에 올바른 `CONVEX_DEPLOY_KEY`가 설정되었는지 확인합니다. Preview에는 Preview 배포 키, Production에는 Production 배포 키를 사용합니다.
3. Vercel에서 `vercel.json`의 빌드 명령을 사용합니다. Convex CLI가 대상 환경에 백엔드를 배포하고, Vite 빌드에 공개 접속 주소인 `VITE_CONVEX_URL`을 넣습니다. 배포 키는 서버 빌드 환경에만 저장합니다.
4. 미리보기에서 보기와 조작 링크를 두 브라우저로 열어 동기화를 검증한 뒤 운영 배포를 진행합니다. 운영 반영 후 같은 주소에서 생성과 동기화를 확인합니다.

[Convex Vercel 배포 문서](https://docs.convex.dev/production/hosting/vercel)
