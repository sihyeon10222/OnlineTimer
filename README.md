# 🕒 OnlineTimer - Technical Documentation

**OnlineTimer**는 실시간 데이터 동기화와 정밀한 시각 렌더링을 위해 설계된 Vanilla JS 기반의 웹 어플리케이션입니다. 이 문서는 프로젝트의 핵심 아키텍처, 상태 동기화 메커니즘, 그리고 UI 엔지니어링 측면의 기술적 상세 내용을 다룹니다.

## 🏗 System Architecture

본 프로젝트는 별도의 백엔드 서버 없이 **Firebase Realtime Database**를 Primary Data Store로 사용하는 Serverless 아키텍처를 채택하고 있습니다.

-   **Frontend**: Native DOM API, CSS Variables, `requestAnimationFrame`을 활용한 고성능 렌더링.
-   **Backend**: Firebase Realtime Database 및 **Gun.js Peer-to-Peer Relay**를 통한 하이브리드 전역 상태 관리.
-   **Security/Ownership**: `localStorage` 및 `sessionStorage`를 활용한 생성자 권한 검증 모듈.
-   **Zero-Config Sync**: 별도의 API 키 없이도 전 세계 어디서나 기기간 실시간 동기화가 가능한 Decentralized Sync 메커니즘 탑재.

## 🔄 State Synchronization Mechanism

네트워크 지연(Latency)에 관계없이 모든 클라이언트가 소수점 단위까지 일치하는 시간을 표시하기 위해 **Delta-based Sync** 패턴을 구현했습니다.

1.  **Snapshots, Not Streams**: 서버에는 매초 변화하는 "현재 시간"을 저장하지 않습니다. 대신 `startTime`(시작 시점 타임스탬프)과 `pauseTime`(누적/남은 시간)이라는 고정값을 저장합니다.
2.  **Client-side Calculation**: 각 클라이언트는 서버로부터 받은 Snapshot을 바탕으로 본인의 로컬 시스템 클락을 이용하여 실시간 값을 계산합니다.
    -   `DisplayTime = pauseTime ± (CurrentTime - startTime)`
3.  **Ticker Loop**: `requestAnimationFrame`을 사용하여 브라우저의 주사율(60fps)에 맞춰 화면을 갱신합니다. 이는 `setInterval`의 고질적인 타이밍 오차 문제를 해결하고 부드러운 밀리초 렌더링을 보장합니다.

## 🧠 Core Algorithms & Time Logic

### 1. Countdown Logic (Target vs Duration)
-   **Duration Mode**: 입력된 초 단위 값을 기준으로 감산합니다.
-   **Target Mode**: 목표 시점(Target Timestamp)과 현재 시점의 차이를 계산하여 `initialDuration`을 동적으로 할당합니다. 서버 동기화 시 목표 시점이 변하지 않도록 설계되었습니다.

### 2. Scheduled Stopwatch
-   시작 시간을 예약할 수 있는 기능으로, `actualStartTime` 필드를 통해 미래 시점을 저장합니다. `isWaiting` 상태 모듈이 활성화되어 현재 시간이 예약 시간을 초과할 때까지 대기 인터페이스를 렌더링합니다.

### 3. Precision Formatting
-   단순 초 단위를 `D일 HH:MM:SS.ms` 형식으로 변환하는 자체 포맷팅 엔진을 구축했습니다. 특히 24시간이 넘어가는 장기 타이머 대응을 위해 Modulo 연산을 활용한 일(Day) 단위 추출 로직이 포함되어 있습니다.

## 🎨 UI/UX Engineering Details

### 1. Adaptive Typography (Fluid Size)
-   `clamp()` 함수와 Viewport Units(`vw`)를 결합하여 화면 너비에 따라 폰트 크기가 유동적으로 변하는 **Fluid Typography**를 구현했습니다.
    -   `font-size: clamp(2rem, 11vw, 25rem);`
-   긴 시간(일 단위 포함) 표시 시 텍스트 오버플로우를 방지하기 위해 컨테이너의 `flex-flow`와 `white-space` 속성을 정밀하게 제어합니다.

### 2. Non-blocking Layout
-   창의 높이가 낮아질 경우 UI 요소가 겹치는 문제를 해결하기 위해 **Flex-based Vertical Flow**를 설계했습니다.
-   `absolute` 배치를 배제하고 `flex: 1`과 `margin-top: auto`를 적절히 배치하여, 가용 공간이 부족할 시 자동으로 스크롤바를 생성하고 레이아웃 밸런스를 유지합니다.

## 💾 Persistence & Storage

-   **Owner Recognition**: 타이머 생성 시 고유 ID를 `ownerRooms` 리스트에 저장하여, 페이지 새로고침 후에도 제어권을 유지할 수 있도록 설계했습니다.
-   **Friendly Short IDs**: 기존의 긴 UUID 대신 6자리의 영문/숫자 조합 단축 ID 시스템을 도입하여 공유 링크의 가시성과 편의성을 극대화했습니다.
-   **History Tracking**: `localStorage`를 통해 사용자가 생성하거나 참여했던 최근 타이머 목록을 캐싱하며, 비동기 데이터 fetch를 통해 각 항목의 최신 상태(종료 여부 등)를 실시간 업데이트합니다.

---

### Technical Specification Summary
-   **Sync Drift Compensation**: Firebase 타임스탬프와의 오차 범위를 최소화하는 로컬 오프셋 보정 알고리즘 적용.
-   **Performance Optimization**: DOM 접근 최소화 (State Change 발생 시에만 선택적 리렌더링).
-   **Responsive Hierarchy**: 브레이크포인트 기반이 아닌 컨텐츠 크기 기반의 유동적 레이아웃 시스템.
