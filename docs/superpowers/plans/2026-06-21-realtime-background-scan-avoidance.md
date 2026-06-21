# 실시간 백그라운드 스캔 기반 회피/탈출 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`의 회피/탈출 엔진을, 정지-스캔-판단-이동을
반복하는 기존 구조에서 백그라운드로 계속 갱신되는 64칸 캐시 + 끼어들 수 있는(non-blocking)
연속 회전 탐색 + delta(직전 대비 변화량) 기반 실시간 위험/막힘 감지로 교체한다.

**Architecture:** `control.inBackground()` fiber가 64칸을 계속 순회하며 캐시를 갱신하고,
메인 `basic.forever()` 루프는 그 캐시만 읍어 매 틱 5단계 우선순위(긴급정지 → 회전탐색 중
발견 → 평상시 막힘→회전탐색 시작 → 탐색 소진→전략 전환 → 최종 360도 최선 탐색)를
판단한다. 회전은 `pidControlAngle(.., Allowed)`로 시작해 매 틱 캐시를 보다가 충분한
공간이 보이면 `pidControlStop()`으로 즉시 멈춘다. 마지막 보루(5단계)는 기존에 이미
검증된 `탈출360()`/`열각도순회탐색()`(블로킹, 고정 각도 목록 순회)을 그대로 재사용한다.

**Tech Stack:** MakeCode/PXT TypeScript(micro:bit), `maqueenPlusV2`/`maqueenPlusV3`
네임스페이스, `matrixLidarDistance` 네임스페이스, micro:bit 협동형(cooperative) 스케줄러
(`control.inBackground()`), DFR0997 LCD, 5x5 LED, 라디오 디버그 로그.

## Global Constraints

- 새 파일을 만들지 않는다. `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md` 하나를 고친다(LCD/로그/
  버튼/초기화 골격, `기준값`/`셀판정`/`탈출360`/`열각도순회탐색`/`탐색점수계산`/
  `점수용거리`는 재사용).
- 모터 전류/과부하 직접 측정 API는 없다(`maqueenPlusV3.ts`에 미존재) — 라이다 delta로
  "헛돌이/안 보이는 장애물에 막힘"을 간접 판단한다. 좌우 엔코더 속도 비교는 범위 밖이다.
- 백그라운드 캐시는 완벽한 동시 스냅샷이 아니다(칸마다 최신 갱신 시점이 다름) — 이
  트레이드오프를 그대로 받아들인다.
- 회전 탐색의 랜덤성은 "시작 방향(좌/우)"에만 적용한다. 적응형 정밀도 곡선 자체에는
  랜덤성을 넣지 않는다(예측 가능하게 유지).
- `pidControlAngle()`은 -180~180 범위만 유효(그 이상은 1바이트로 보내져 깨짐). 회전
  명령은 항상 이 범위 안에서 보낸다.
- `maqueenPlusV2.pidControlDistance(dir, distance, interruption)`은 3개 인자, 첫
  인자는 항상 `SpeedDirection.SpeedCW`/`SpeedCCW`.
- 기본 조정값(설계 문서 표 + 본 계획에서 추가):

| 변수 | 값 | 의미 |
|---|---:|---|
| `긴급delta한계mm` | 80 | 정면 칸이 한 틱 사이 이만큼 이상 가까워지면 긴급 후진 |
| `진행확인시간ms` | 1000 | 이 시간 동안의 delta로 헛돌이/막힘 판단 |
| `최소진행mm` | 20 | 위 시간 동안 최소 이만큼은 거리가 바뀌어야 "정상 진행" |
| `정밀도레벨개수` | 3 | 0(천천히/꼼꼼)~2(빠름/간단) |
| `정밀도증가조건` | 3 | 연속 이 횟수 성공 시 정밀도레벨 1단계 증가 |
| `빠른모드맨아래행주기틱` | 5 | 정밀도 최고일 때도 5틱마다 한 번 맨 아래 행(row7) 포함 |
| `회전1회각도` | 170 | `pidControlAngle()` 1회 호출당 회전각 |
| `회전1회예상ms` | 4000 | 170도 회전 1회가 끝났을 것으로 추정하는 시간(실측 기반 추정, 짧으면 과도하게 자주 재발사, 길면 회전탐색 반응이 늦어짐 — 튜닝 가능) |
| `회전탐색최대반복` | 3 | 같은 방향으로 최대 이 횟수까지 회전(약 510도)해도 못 찾으면 실패 처리 |
| `비상후진cm` | 5 | 긴급 위험 감지 시 후진 거리 |
| `라이다무효값mm`(기존) | 4000 | 센티널(확실한 감지없음) 기준 |
| `정지거리mm`/`안전거리mm`(기존) | 250/400 | 그대로 유지 |

자동 테스트 러너가 없는 프로젝트다. 검증은 매 태스크마다 `tsc --noEmit`(코드 블록 추출
→ tsconfig.json `"files"` 임시 수정 → 실행 → 복구) + 의사실행 트레이스로 한다.

---

## Task 1: 캐시 데이터 레이어 + 백그라운드 스캐너

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Produces: `캐시: number[]`(64), `캐시갱신시각: number[]`(64), `마지막사이클ms: number`,
  `캐시판정(col, row): number`. `열최소읍기(col)`/`전체열스캔()`은 이름과 시그니처를
  그대로 유지하지만 내부적으로 캐시를 읍는다 — 이후 태스크는 이 두 함수가 여전히
  "0=확실히 열림, -1=모름, 양수=장애물 거리"를 반환한다고 가정해도 된다.

- [ ] **Step 1: 캐시 전역 변수 추가**

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에서 다음 텍스트를 찾는다:

```typescript
let 기준값: number[] = []
let 기준값준비됨 = false
const 기준값여유mm = 60
```

다음으로 교체한다(뒤에 캐시 선언 추가):

```typescript
let 기준값: number[] = []
let 기준값준비됨 = false
const 기준값여유mm = 60

let 캐시: number[] = []
let 캐시갱신시각: number[] = []
for (let i = 0; i < 64; i++) {
    캐시.push(0)
    캐시갱신시각.push(0)
}
let 마지막사이클ms = 0
```

- [ ] **Step 2: `캐시판정()` 추가 + `열최소읍기()`를 캐시 기반으로 교체**

다음 텍스트를 찾는다:

```typescript
function 열최소읍기(col: number): number {
    let 최소 = -1
    let 센티널확인 = false
    for (let row = 0; row < 8; row++) {
        let raw = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
        let 기준 = 기준값준비됨 ? 기준값[row * 8 + col] : -1
        let 값 = 셀판정(raw, 기준)
        if (값 == 0) {
            센티널확인 = true
        } else if (값 > 0) {
            if (최소 < 0 || 값 < 최소) 최소 = 값
        }
        // 값 == -1(글리치)은 무시 — 열림으로도 막힘으로도 셈하지 않음
    }
    if (최소 >= 0) return 최소
    if (센티널확인) return 0
    return -1
}
```

다음으로 교체한다:

```typescript
// 캐시[row*8+col]의 raw 값에 그 칸의 기준값을 적용해 판정한다. 백그라운드
// 스캐너가 이미 갱신해둔 캐시를 읍는 것이므로 이 함수 자체는 I2C를 건드리지 않는다.
function 캐시판정(col: number, row: number): number {
    let idx = row * 8 + col
    let raw = 캐시[idx]
    let 기준 = 기준값준비됨 ? 기준값[idx] : -1
    return 셀판정(raw, 기준)
}

function 열값읍기(col: number, 행시작: number, 행끝: number): number {
    let 최소 = -1
    let 센티널확인 = false
    for (let row = 행시작; row <= 행끝; row++) {
        let 값 = 캐시판정(col, row)
        if (값 == 0) {
            센티널확인 = true
        } else if (값 > 0) {
            if (최소 < 0 || 값 < 최소) 최소 = 값
        }
        // 값 == -1(글리치)은 무시 — 열림으로도 막힘으로도 셈하지 않음
    }
    if (최소 >= 0) return 최소
    if (센티널확인) return 0
    return -1
}

function 열최소읍기(col: number): number {
    return 열값읍기(col, 0, 7)
}
```

(Task 5에서 `열최소읍기()`를 다시 한번 고쳐 정밀도 레벨에 따라 행 범위를 좁힌다 —
지금은 항상 0~7 전체를 본다.)

- [ ] **Step 3: `전체64로그()`를 캐시 덤프로 교체**

다음 텍스트를 찾는다:

```typescript
// 필터링(4000 센티널 -> 0, raw==0 글리치 -> -1) 이전의 원본 64개 값을 그대로
// 로그로 보낸다 — "너무 멀어서 4000대"와 "너무 가까워서 4000대"가 실제로 같은
// 값으로 나오는지 등을 raw 단계에서 직접 확인하기 위한 진단용.
function 전체64로그(): void {
    let 결과: number[] = []
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            결과.push(matrixLidarDistance.matrixPointOutput(라이다주소, col, row))
        }
    }
    로그("RAW(row0-7|col0-7) " + 행렬64문자열(결과))
}
```

다음으로 교체한다(이제 백그라운드가 항상 캐시를 갱신하므로 직접 다시 읍지 않고
캐시를 그대로 덤프한다 — 진단 목적은 동일하되 I2C 호출이 추가로 들지 않는다):

```typescript
// 백그라운드 스캐너가 갱신해둔 캐시를 그대로 로그로 보낸다(필터링 이전 raw 값).
function 전체64로그(): void {
    로그("RAW(row0-7|col0-7) " + 행렬64문자열(캐시))
}
```

- [ ] **Step 4: 백그라운드 스캐너 등록**

다음 텍스트를 찾는다(파일의 `로봇초기화()` 호출 직후):

```typescript
로봇초기화()

basic.forever(function () {
```

다음으로 교체한다(백그라운드 fiber 등록을 `로봇초기화()`와 `basic.forever()` 사이에
추가):

```typescript
로봇초기화()

control.inBackground(function () {
    while (true) {
        let 시작 = input.runningTime()
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                let idx = row * 8 + col
                캐시[idx] = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
                캐시갱신시각[idx] = input.runningTime()
            }
        }
        마지막사이클ms = input.runningTime() - 시작
    }
})

basic.forever(function () {
```

- [ ] **Step 5: 정적 검증**

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에서 typescript 코드블록을 추출해
`_forward_lidar_check.ts`로 저장한다(저장소 루트에서 실행):

```bash
node -e "
const fs = require('fs');
const md = fs.readFileSync('AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md', 'utf8');
const blocks = [...md.matchAll(/\`\`\`typescript\n([\s\S]*?)\`\`\`/g)].map(m => m[1]);
fs.writeFileSync('_forward_lidar_check.ts', blocks.join('\n\n'));
console.log(blocks.length + ' blocks, ' + blocks.join('').length + ' chars');
"
```

Expected: `2 blocks, <N> chars` (로봇 코드 1개 + 무선 수신기 코드 1개).

```bash
cp tsconfig.json tsconfig.json.bak
```

`tsconfig.json`의 `"files"`를 다음으로 임시 교체:

```json
"files": [
    "_forward_lidar_check.ts",
    "maqueenPlusV3.ts",
    "pxt-editor-shims.d.ts",
    "pxt_modules/core/dal.d.ts",
    "pxt_modules/core/enums.d.ts",
    "pxt_modules/core/shims.d.ts",
    "pxt_modules/ws2812b/main.ts",
    "pxt_modules/matrixLidarDistance/matrixLidarDistance.ts"
]
```

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...`
경고 1줄만 출력되고 그 외 타입 에러 0건. `control.inBackground(function(){...}):void`
호출이 타입 에러 없이 인식되는지 확인한다.

복구:

```bash
mv tsconfig.json.bak tsconfig.json
rm _forward_lidar_check.ts
git status --short tsconfig.json _forward_lidar_check.ts
```

Expected: 마지막 명령 출력이 비어 있음.

- [ ] **Step 6: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add background-fiber LiDAR cache, replacing synchronous per-call scans"
```

---

## Task 2: Delta 추적기 (긴급 위험 + 헛돌이/막힘 감지)

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: Task 1의 `캐시판정(col, row)`.
- Produces: `델타갱신(): void`(매 틱 1회 호출, `델타[64]` 갱신), `정면긴급위험(): boolean`,
  `헛돌이감지(): boolean`. Task 4가 메인 루프에서 이 셋을 그대로 호출한다.

- [ ] **Step 1: delta 전역 변수 + `델타갱신()` 추가**

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에서 다음 텍스트를 찾는다(Task 1에서 추가한
캐시 선언 바로 다음):

```typescript
let 캐시: number[] = []
let 캐시갱신시각: number[] = []
for (let i = 0; i < 64; i++) {
    캐시.push(0)
    캐시갱신시각.push(0)
}
let 마지막사이클ms = 0
```

다음으로 교체한다(delta 관련 선언 추가):

```typescript
let 캐시: number[] = []
let 캐시갱신시각: number[] = []
for (let i = 0; i < 64; i++) {
    캐시.push(0)
    캐시갱신시각.push(0)
}
let 마지막사이클ms = 0

let 직전판정: number[] = []
let 델타: number[] = []
for (let i = 0; i < 64; i++) {
    직전판정.push(-1)
    델타.push(0)
}
const 긴급delta한계mm = 80
const 진행확인시간ms = 1000
const 최소진행mm = 20
```

`캐시판정()`/`열값읍기()`/`열최소읍기()` 함수 뒤(파일에서 Task 1이 만든 그 함수들
다음, `전체열스캔()` 함수 앞 또는 뒤 어디든 무방)에 다음 함수들을 추가한다:

```typescript
// 매 틱 1회만 호출한다(같은 셀을 여러 번 비교하면 직전판정이 망가진다). 64칸 전체의
// "지금 판정값 - 직전 판정값"을 델타[]에 채운다. 둘 중 하나라도 "모름(-1)"이면
// 비교 불가로 보고 0(변화없음)으로 처리한다.
function 델타갱신(): void {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            let idx = row * 8 + col
            let 지금 = 캐시판정(col, row)
            let 이전 = 직전판정[idx]
            델타[idx] = (이전 < 0 || 지금 < 0) ? 0 : (이전 - 지금)
            직전판정[idx] = 지금
        }
    }
}

// 정면 중앙 4열(2~5) 중 한 칸이라도 한 틱 사이 긴급delta한계mm 이상 가까워졌으면
// 절대 거리와 무관하게 위험으로 본다 — 회전 중이든 전진 중이든 매 틱 호출한다.
function 정면긴급위험(): boolean {
    let 중앙열 = [2, 3, 4, 5]
    for (let i = 0; i < 중앙열.length; i++) {
        let col = 중앙열[i]
        for (let row = 0; row < 8; row++) {
            let idx = row * 8 + col
            if (델타[idx] >= 긴급delta한계mm) {
                로그("DELTA EMERGENCY col" + col + " row" + row + " delta" + 델타[idx])
                return true
            }
        }
    }
    return false
}

let 진행추적시작시각 = 0
let 진행추적시작거리 = -1

function 진행추적초기화(): void {
    진행추적시작시각 = input.runningTime()
    진행추적시작거리 = 열최소읍기(3)
}

// 전진 중일 때만 호출한다. 정면 중앙(col3)의 거리가 진행확인시간ms 동안 최소진행mm
// 이상 바뀌지 않으면 "라이다로 안 보이는 것에 막혔거나 바퀴가 헛돌고 있다"로 판단한다.
// 추적할 기준 거리가 없으면(트인 공간, col3가 0/-1) 그냥 새로 추적을 시작하고
// false를 반환한다 — 열린 공간에서는 진행량을 측정할 기준이 없으므로 문제 삼지 않는다.
function 헛돌이감지(): boolean {
    if (진행추적시작거리 <= 0) {
        진행추적초기화()
        return false
    }
    if (input.runningTime() - 진행추적시작시각 < 진행확인시간ms) return false
    let 지금거리 = 열최소읍기(3)
    let 변화 = 지금거리 <= 0 ? 999999 : Math.abs(진행추적시작거리 - 지금거리)
    진행추적초기화()
    if (변화 < 최소진행mm) {
        로그("STUCK/SLIP detected: moved only " + 변화 + "mm in " + 진행확인시간ms + "ms")
        return true
    }
    return false
}
```

- [ ] **Step 2: 정적 검증**

Task 1 Step 5와 동일한 추출/`tsc --noEmit`/복구 절차를 다시 수행한다(여전히 2 blocks).
에러 0건을 확인한다. 이 시점에는 아직 누구도 `델타갱신()`/`정면긴급위험()`/
`헛돌이감지()`를 호출하지 않으므로(Task 4에서 연결) 타입 검사만 통과하면 된다.

- [ ] **Step 3: 의사실행 트레이스**

`델타갱신()`을 다음 입력으로 손으로 트레이스해 기대값과 일치하는지 확인한다:

| 틱 | 캐시판정(col2,row0) | 직전판정[idx] (갱신 전) | 기대 델타[idx] | 기대 직전판정[idx] (갱신 후) |
|---|---:|---:|---:|---:|
| 1 | 300 | -1(초기값) | 0 (이전이 모름) | 300 |
| 2 | 220 | 300 | 80 (300-220) | 220 |
| 3 | -1(글리치) | 220 | 0 (지금이 모름) | -1 |
| 4 | 215 | -1 | 0 (이전이 모름) | 215 |

`정면긴급위험()`이 위 2번째 틱(델타=80, `긴급delta한계mm=80` 이상)에서 `true`를
반환하는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add frame-to-frame delta tracking for emergency stop and stuck/slip detection"
```

---

## Task 3: 끼어들 수 있는 연속 회전 탐색

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: 기존 `정면안전(추가여유mm)`(이미 캐시 기반으로 동작, Task 1 덕분에 추가
  I2C 없이 즉시 반환).
- Produces: `회전탐색중: boolean`(전역), `회전탐색시작(): void`, `회전탐색틱(): void`.
  Task 4의 메인 루프가 이 둘을 우선순위 2단계 자리에서 호출한다.

- [ ] **Step 1: 회전 탐색 상태 변수 + 함수 추가**

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에서 `정면블록확정()` 함수 정의 바로 뒤(또는
`안전전진거리cm()` 함수 앞)에 다음을 추가한다:

```typescript
let 회전탐색중 = false
let 회전탐색방향 = 1
let 회전탐색시작시각 = 0
let 회전탐색반복횟수 = 0
const 회전1회각도 = 170
const 회전1회예상ms = 4000
const 회전탐색최대반복 = 3

// pidControlAngle(.., Allowed)는 회전 명령만 던지고 즉시 반환한다(완료를 기다리지
// 않음) — 그래서 메인 루프가 회전 중에도 계속 돌면서 캐시를 확인할 수 있다.
function 회전탐색시작(): void {
    회전탐색중 = true
    회전탐색방향 = Math.random() < 0.5 ? 1 : -1
    회전탐색반복횟수 = 0
    상태 = "SEARCH"
    마지막판단 = "ROTATE " + (회전탐색방향 > 0 ? "CW" : "CCW")
    로그("ROTATE SEARCH START dir=" + 회전탐색방향)
    maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전1회각도, maqueenPlusV2.MyInterruption.Allowed)
    회전탐색시작시각 = input.runningTime()
}

// 매 틱 호출한다. 충분한 공간을 찾으면 그 자리에서 즉시 멈추고(pidControlStop)
// 회전탐색중을 false로 만든다 — 다음 틱에 메인 루프가 평상시 전진으로 넘어간다.
// 한 번의 170도 회전이 끝났을 시간(회전1회예상ms)이 지났는데도 못 찾았으면 같은
// 방향으로 한 번 더 돌리고, 회전탐색최대반복(약 510도)을 넘기면 포기하고
// 회전탐색중을 false로 만든다(이 경우 실패연속 증가/탈출 판단은 Task 4의 메인
// 루프가 다음 정면블록확정() 체크에서 자연스럽게 처리한다).
function 회전탐색틱(): void {
    if (정면안전(0)) {
        maqueenPlusV2.pidControlStop()
        회전탐색중 = false
        실패연속 = 0
        마지막판단 = "FOUND DURING ROTATE"
        로그("ROTATE SEARCH FOUND, stopping")
        return
    }
    if (input.runningTime() - 회전탐색시작시각 >= 회전1회예상ms) {
        회전탐색반복횟수 += 1
        if (회전탐색반복횟수 >= 회전탐색최대반복) {
            maqueenPlusV2.pidControlStop()
            회전탐색중 = false
            마지막판단 = "ROTATE SEARCH EXHAUSTED"
            로그("ROTATE SEARCH EXHAUSTED after " + 회전탐색반복횟수 + " turns")
            return
        }
        maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전1회각도, maqueenPlusV2.MyInterruption.Allowed)
        회전탐색시작시각 = input.runningTime()
    }
}
```

- [ ] **Step 2: 정적 검증**

Task 1 Step 5와 동일한 절차로 `tsc --noEmit` 재실행, 에러 0건 확인. 아직 메인 루프가
이 함수들을 호출하지 않으므로(Task 4) 타입 검사만 통과하면 된다.

- [ ] **Step 3: 의사실행 트레이스**

`회전탐색틱()`을 다음 시나리오로 트레이스한다:

| 시점 | 정면안전(0) | 경과 시간 | 기대 동작 |
|---|---|---:|---|
| 1회차 호출 | false | 1200ms | 아직 회전1회예상ms(4000) 안 지남 → 아무 것도 안 함, 회전탐색중 유지 |
| 2회차 호출 | true | 4500ms | `정면안전`이 먼저 체크되므로 즉시 `pidControlStop()` + 회전탐색중=false + 실패연속=0 |

다른 시나리오: `정면안전`이 매번 false이고 경과시간이 4000ms를 3번 넘기면(반복횟수
0→1→2→3) 3번째에 `회전탐색반복횟수(3) >= 회전탐색최대반복(3)`이 되어 포기 처리되는지
확인한다.

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add interruptible continuous rotation search using non-blocking PID angle control"
```

---

## Task 4: 우선순위 결정 루프로 메인 루프 교체 + 죽은 코드 제거

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: Task 1의 캐시/`전체열스캔`, Task 2의 `델타갱신`/`정면긴급위험`/`헛돌이감지`,
  Task 3의 `회전탐색중`/`회전탐색시작`/`회전탐색틱`, 기존 `정면블록확정`/`탈출360`.
- Produces: 새 메인 루프(우선순위 1~5단계). `회피시도()`/`최선열찾기()`/
  `안전전진거리cm()`는 더 이상 어디서도 호출되지 않으므로 삭제한다.

- [ ] **Step 1: 죽은 함수 삭제 — `최선열찾기()`, `안전전진거리cm()`, `회피시도()`**

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에서 다음 세 함수 전체(정의 시작부터 끝까지,
사이의 `열목록문자열`/`행렬64문자열`/`전체64로그`는 그대로 남긴다)를 찾아서 삭제한다:

```typescript
function 안전전진거리cm(목표열: number, 거리목록: number[]): number {
    let 인접열 = Math.round(목표열)
    if (인접열 < 0) 인접열 = 0
    if (인접열 > 7) 인접열 = 7
    let 측정mm = 거리목록[인접열]
    if (측정mm < 0) return 최소전진거리cm
    if (측정mm == 0) return 적응전진거리cm
    let 여유cm = Math.floor((측정mm - 정지거리mm) / 10)
    if (여유cm < 최소전진거리cm) return 최소전진거리cm
    return Math.min(적응전진거리cm, 여유cm)
}

function 최선열찾기(거리목록: number[]): number {
    let 최선시작 = -1
    let 최선길이 = 0
    let 현재시작 = -1
    let 현재길이 = 0
    for (let col = 0; col < 8; col++) {
        // 거리목록[col] == -1("모름", 글리치만 본 열)은 이 조건 어디에도 해당하지
        // 않아 자동으로 막힘 취급된다 — 판단 불가 방향으로는 회전하지 않는다.
        let 열림 = 거리목록[col] == 0 || 거리목록[col] >= 안전거리mm
        if (열림) {
            if (현재길이 == 0) 현재시작 = col
            현재길이 += 1
            if (현재길이 > 최선길이) {
                최선길이 = 현재길이
                최선시작 = 현재시작
            }
        } else {
            현재길이 = 0
        }
    }
    if (최선길이 < 최소그룹폭열수) return -1
    let 중심열 = 최선시작 + (최선길이 - 1) / 2
    return 중심열
}
```

그리고(별도 위치) 다음 함수도 전체 삭제한다:

```typescript
function 회피시도(): boolean {
    전체64로그()
    let 거리목록 = 전체열스캔()
    로그("SCAN(filtered col0-7) " + 열목록문자열(거리목록))
    let 목표열 = 최선열찾기(거리목록)
    if (목표열 < 0) {
        실패연속 += 1
        전진성공연속 = 0
        적응전진거리cm = Math.max(최소전진거리cm, 적응전진거리cm - 전진실패감소cm)
        마지막판단 = "NO GAP F" + 실패연속
        로그("AVOID NO GAP F" + 실패연속)
        return false
    }
    let 목표각 = Math.round((목표열 - 3.5) * 7.5)
    let 전진cm = 안전전진거리cm(목표열, 거리목록)
    로그("AVOID TURN " + 목표각 + " GO " + 전진cm + "cm (step " + 적응전진거리cm + ")")
    maqueenPlusV2.pidControlAngle(목표각, maqueenPlusV2.MyInterruption.NotAllowed)
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 전진cm, maqueenPlusV2.MyInterruption.NotAllowed)
    if (!정면안전(0)) {
        실패연속 += 1
        전진성공연속 = 0
        적응전진거리cm = Math.max(최소전진거리cm, 적응전진거리cm - 전진실패감소cm)
        마지막판단 = "STILL BLOCKED F" + 실패연속
        로그("AVOID STILL BLOCKED F" + 실패연속)
        return false
    }
    실패연속 = 0
    전진성공연속 += 1
    if (전진성공연속 >= 전진성공증가조건) {
        전진성공연속 = 0
        적응전진거리cm = Math.min(최대전진거리cm, 적응전진거리cm + 전진성공증가cm)
    }
    마지막판단 = "AVOID OK col" + 목표열
    로그("AVOID OK col" + 목표열 + " angle" + 목표각)
    return true
}
```

(`전체열스캔()`, `열목록문자열()`, `전체64로그()`, `점수용거리()`, `탐색점수계산()`,
`열각도순회탐색()`, `탈출360()`은 그대로 남긴다 — 5단계 최종 폴백이 `탈출360()`을
재사용한다.)

- [ ] **Step 2: 비상 후진 상수 추가**

다음 텍스트를 찾는다:

```typescript
const 정면막힘확인필요 = 2
```

다음으로 교체한다:

```typescript
const 정면막힘확인필요 = 2
const 비상후진cm = 5
```

- [ ] **Step 3: 메인 루프를 5단계 우선순위 구조로 교체**

다음 텍스트를 찾는다(파일 끝의 `basic.forever(...)` 블록 전체):

```typescript
basic.forever(function () {
    if (디버그모드 && input.runningTime() - 마지막하트비트시각 >= 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " dec=" + 마지막판단 + " step=" + 적응전진거리cm
            + " failStreak=" + 실패연속 + " blockStreak=" + 정면막힘연속 + " started=" + 주행시작됨)
    }

    if (!주행시작됨) {
        if (출발요청) {
            출발요청 = false
            출발카운트다운()
            주행시작됨 = true
        } else {
            lcd대기표시(false)
        }
        basic.pause(루프대기ms)
        return
    }

    if (!정면블록확정()) {
        if (정면막힘연속 > 0) {
            상태 = "CHECK"
            마지막판단 = "RECHECK " + 정면막힘연속
            lcd표시(false)
            basic.pause(루프대기ms)
            return
        }
        상태 = "DRIVE"
        마지막판단 = "FWD " + 적응전진거리cm + "cm"
        maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
    } else {
        maqueenPlusV2.pidControlStop()
        정면막힘연속 = 0
        상태 = "AVOID"
        로그("AVOID START")
        let 회피성공 = 회피시도()
        if (!회피성공 && 실패연속 >= 실패연속한계) {
            로그("ESCAPE TRIGGER failStreak=" + 실패연속)
            let 탈출성공 = 탈출360()
            if (!탈출성공) {
                상태 = "NO ESCAPE"
                마지막판단 = "NO ESCAPE"
                lcd표시(true)
                basic.showIcon(IconNames.No)
                주행시작됨 = false
                실패연속 = 0
                basic.pause(루프대기ms)
                return
            }
            로그("ESCAPE SUCCESS score=" + 마지막탐색점수)
            실패연속 = 0
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

다음으로 교체한다:

```typescript
basic.forever(function () {
    if (디버그모드 && input.runningTime() - 마지막하트비트시각 >= 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " dec=" + 마지막판단 + " step=" + 적응전진거리cm
            + " failStreak=" + 실패연속 + " blockStreak=" + 정면막힘연속 + " started=" + 주행시작됨)
    }

    if (!주행시작됨) {
        if (출발요청) {
            출발요청 = false
            출발카운트다운()
            주행시작됨 = true
        } else {
            lcd대기표시(false)
        }
        basic.pause(루프대기ms)
        return
    }

    델타갱신()

    // 우선순위 1: 긴급 위험 — 회전 중이든 전진 중이든 최우선으로 처리
    if (정면긴급위험()) {
        if (회전탐색중) {
            maqueenPlusV2.pidControlStop()
            회전탐색중 = false
        }
        상태 = "EMERGENCY"
        마지막판단 = "EMERGENCY BACKOFF"
        로그("EMERGENCY BACKOFF")
        maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 비상후진cm, maqueenPlusV2.MyInterruption.NotAllowed)
        lcd표시(false)
        basic.pause(루프대기ms)
        return
    }

    // 우선순위 2: 회전 탐색 중이면 매 틱 확인(찾으면 즉시 멈추고, 소진되면
    // 회전탐색중이 false가 되어 아래 평상시 판단으로 자연스럽게 넘어간다)
    if (회전탐색중) {
        회전탐색틱()
        lcd표시(false)
        basic.pause(루프대기ms)
        return
    }

    // 우선순위 3: 평상시 전진/막힘 판단
    if (!정면블록확정()) {
        if (정면막힘연속 > 0) {
            상태 = "CHECK"
            마지막판단 = "RECHECK " + 정면막힘연속
        } else {
            상태 = "DRIVE"
            마지막판단 = "FWD " + 적응전진거리cm + "cm"
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
            if (헛돌이감지()) {
                마지막판단 = "STUCK/SLIP"
                로그("STUCK/SLIP DETECTED while driving")
                // 다음 틱에 즉시 "막힘 확정" 분기로 들어가게 강제한다(정면블록확정()의
                // 내부 카운터를 직접 채움) — 라이다로는 안 보이는 것에 막혔을 때도
                // 막힘 경로(우선순위 4)로 자연스럽게 이어지게 하기 위함.
                정면막힘연속 = 정면막힘확인필요
            }
        }
    } else {
        // 우선순위 4: 막힘 확정 — 회전 탐색 시작, 반복 실패하면 5단계로
        maqueenPlusV2.pidControlStop()
        정면막힘연속 = 0
        상태 = "BLOCKED"
        실패연속 += 1
        마지막판단 = "BLOCKED F" + 실패연속
        로그("FRONT BLOCKED F" + 실패연속)
        if (실패연속 >= 실패연속한계) {
            // 우선순위 5: 최종 폴백 — 기존 360도 굵게->세밀 탐색 재사용
            로그("ESCAPE TRIGGER failStreak=" + 실패연속)
            let 탈출성공 = 탈출360()
            if (!탈출성공) {
                상태 = "NO ESCAPE"
                마지막판단 = "NO ESCAPE"
                lcd표시(true)
                basic.showIcon(IconNames.No)
                주행시작됨 = false
                실패연속 = 0
                basic.pause(루프대기ms)
                return
            }
            로그("ESCAPE SUCCESS score=" + 마지막탐색점수)
            실패연속 = 0
        } else {
            회전탐색시작()
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

- [ ] **Step 4: 정적 검증**

Task 1 Step 5와 동일한 절차로 `tsc --noEmit` 재실행. 삭제한 `회피시도`/`최선열찾기`/
`안전전진거리cm`를 참조하는 곳이 남아있지 않은지(타입 에러로 드러남) 확인하고,
에러 0건을 확인한다.

- [ ] **Step 5: 의사실행 트레이스**

다음 표로 우선순위 1~5가 올바른 조건에서 발동하는지 확인한다:

| 상황 | 발동 우선순위 | 기대 동작 |
|---|---|---|
| 회전탐색중=false, 정면긴급위험()=true | 1 | 즉시 후진, 회전탐색중이었다면 정지 후 false로 |
| 회전탐색중=true, 정면긴급위험()=false | 2 | `회전탐색틱()` 호출, 그 결과(발견/계속/소진)에 맡김 |
| 회전탐색중=false, 정면블록확정()=false, 정면막힘연속=0 | 3(DRIVE) | 전진 명령 + `헛돌이감지()` |
| 회전탐색중=false, 정면블록확정()=false, 정면막힘연속>0 | 3(CHECK) | 재확인만, 이동 없음 |
| 회전탐색중=false, 정면블록확정()=true, 실패연속<5 | 4 | `회전탐색시작()` |
| 회전탐색중=false, 정면블록확정()=true, 실패연속>=5 | 5 | `탈출360()` |

`헛돌이감지()`가 true를 반환해 `정면막힘연속 = 정면막힘확인필요`로 강제됐을 때, 다음
틱에서 `정면블록확정()`이 (캐시상으로는 `정면안전()`이 true를 반환하더라도) 그 강제된
카운터값 때문에 어떻게 동작하는지 확인한다 — `정면블록확정()`은 `정면안전()`이 true면
카운터를 곧바로 0으로 리셋하고 `false`(막힘 아님)를 반환하므로, 실제로는 "라이다 기준
안전"으로 보이면 헛돌이 강제값이 무시된다. 이는 설계상 의도된 한계로 기록한다(라이다가
안전하다고 보는데 실제로는 막힌 경우는 헛돌이감지가 같은 틱에서 잡은 신호로만
처리되고, 다음 틱에 라이다가 여전히 안전하다고 보면 다시 전진을 시도한다 — 이후
관찰을 통해 필요하면 별도 카운터로 분리하는 개선을 고려할 수 있다).

- [ ] **Step 6: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Replace main loop with 5-tier priority decision loop, drop dead column-search functions"
```

---

## Task 5: 적응형 정밀도 레벨

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: Task 1의 `열값읍기(col, 행시작, 행끝)`, 기존 `전진성공연속`/
  `전진성공증가조건`/`전진성공증가cm`/`전진실패감소cm`/`최소전진거리cm`/
  `최대전진거리cm`(원래 삭제된 `회피시도()` 안에서만 쓰이던 변수/상수들 — 새 적응형
  정밀도 함수가 그 자리를 이어받아 재사용한다. `회피시도()` 삭제 이후 이 변수들을
  아무도 갱신하지 않게 된 상태였는데, 이 태스크에서 다시 연결한다).
- Produces: `정밀도레벨: number`(전역), `정밀도증가확인()`, `정밀도소폭감소()`,
  `정밀도리셋()`. Task 4가 만든 메인 루프의 DRIVE/회전탐색시작/탈출360 트리거 지점에서
  호출한다. 세 함수 모두 정밀도 레벨과 `적응전진거리cm`을 같은 성공/실패 신호로 함께
  조정한다(`전진성공연속` 카운터를 공유).

- [ ] **Step 1: 정밀도 상태/상수 + 함수 추가**

다음 텍스트를 찾는다(Task 3에서 추가한 회전 탐색 상수 블록 바로 다음):

```typescript
const 회전탐색최대반복 = 3
```

다음으로 교체한다:

```typescript
const 회전탐색최대반복 = 3

let 정밀도레벨 = 0
let 빠른모드틱카운터 = 0
const 정밀도레벨개수 = 3
const 정밀도증가조건 = 3
const 빠른모드맨아래행주기틱 = 5

// 정밀도 레벨과 적응전진거리cm을 같은 신호(연속 성공/실패)로 함께 조정한다.
// 전진성공연속/전진성공증가조건/전진성공증가cm/전진실패감소cm/최소전진거리cm/
// 최대전진거리cm은 기존에 선언돼 있던 것을 그대로 재사용한다(Task 4에서 회피시도()를
// 지우면서 이 변수들을 갱신하던 코드도 같이 사라졌는데, 여기서 다시 연결한다).
function 정밀도증가확인(): void {
    전진성공연속 += 1
    if (전진성공연속 >= 전진성공증가조건) {
        전진성공연속 = 0
        적응전진거리cm = Math.min(최대전진거리cm, 적응전진거리cm + 전진성공증가cm)
        if (정밀도레벨 < 정밀도레벨개수 - 1) {
            정밀도레벨 += 1
            로그("PRECISION UP -> " + 정밀도레벨)
        }
    }
}

function 정밀도소폭감소(): void {
    전진성공연속 = 0
    적응전진거리cm = Math.max(최소전진거리cm, 적응전진거리cm - 전진실패감소cm)
    if (정밀도레벨 > 0) {
        정밀도레벨 -= 1
        로그("PRECISION DOWN -> " + 정밀도레벨)
    }
}

function 정밀도리셋(): void {
    전진성공연속 = 0
    적응전진거리cm = 최소전진거리cm
    if (정밀도레벨 != 0) {
        정밀도레벨 = 0
        로그("PRECISION RESET -> 0")
    }
}
```

- [ ] **Step 2: `열최소읍기()`가 정밀도 레벨에 따라 행 범위를 좁히게 수정**

다음 텍스트를 찾는다(Task 1에서 만든 함수):

```typescript
function 열최소읍기(col: number): number {
    return 열값읍기(col, 0, 7)
}
```

다음으로 교체한다:

```typescript
// 정밀도레벨이 최고(정밀도레벨개수-1)면 위쪽 절반(row0~3)만 보되, 빠른모드맨아래행주기틱
// 마다 한 번은 전체(row0~7)를 본다 — 가까이 다가갈수록 낮은 장애물이 아래쪽 행에서만
// 보일 수 있어서, 빠른 모드에서도 주기적으로는 놓치지 않게 한다. 그 외 레벨은 항상
// 전체 행을 본다(천천히/꼼꼼).
function 열최소읍기(col: number): number {
    if (정밀도레벨 >= 정밀도레벨개수 - 1) {
        빠른모드틱카운터 += 1
        if (빠른모드틱카운터 % 빠른모드맨아래행주기틱 != 0) {
            return 열값읍기(col, 0, 3)
        }
    }
    return 열값읍기(col, 0, 7)
}
```

- [ ] **Step 3: 메인 루프에 정밀도 조정 지점 연결**

다음 텍스트를 찾는다(Task 4가 만든 메인 루프의 DRIVE 분기):

```typescript
            상태 = "DRIVE"
            마지막판단 = "FWD " + 적응전진거리cm + "cm"
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
            if (헛돌이감지()) {
                마지막판단 = "STUCK/SLIP"
                로그("STUCK/SLIP DETECTED while driving")
                // 다음 틱에 즉시 "막힘 확정" 분기로 들어가게 강제한다(정면블록확정()의
                // 내부 카운터를 직접 채움) — 라이다로는 안 보이는 것에 막혔을 때도
                // 막힘 경로(우선순위 4)로 자연스럽게 이어지게 하기 위함.
                정면막힘연속 = 정면막힘확인필요
            }
```

다음으로 교체한다(정밀도 증가 호출 추가):

```typescript
            상태 = "DRIVE"
            마지막판단 = "FWD " + 적응전진거리cm + "cm"
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
            if (헛돌이감지()) {
                마지막판단 = "STUCK/SLIP"
                로그("STUCK/SLIP DETECTED while driving")
                // 다음 틱에 즉시 "막힘 확정" 분기로 들어가게 강제한다(정면블록확정()의
                // 내부 카운터를 직접 채움) — 라이다로는 안 보이는 것에 막혔을 때도
                // 막힘 경로(우선순위 4)로 자연스럽게 이어지게 하기 위함.
                정면막힘연속 = 정면막힘확인필요
            } else {
                정밀도증가확인()
            }
```

다음 텍스트를 찾는다(Task 4가 만든 메인 루프의 막힘 분기, 회전탐색시작 호출 부분):

```typescript
        } else {
            회전탐색시작()
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

다음으로 교체한다(정밀도 조정 호출 추가):

```typescript
        } else {
            정밀도소폭감소()
            회전탐색시작()
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

다음 텍스트를 찾는다(Task 4가 만든 메인 루프의 탈출 트리거 부분):

```typescript
        if (실패연속 >= 실패연속한계) {
            // 우선순위 5: 최종 폴백 — 기존 360도 굵게->세밀 탐색 재사용
            로그("ESCAPE TRIGGER failStreak=" + 실패연속)
            let 탈출성공 = 탈출360()
```

다음으로 교체한다(정밀도 리셋 호출 추가):

```typescript
        if (실패연속 >= 실패연속한계) {
            // 우선순위 5: 최종 폴백 — 기존 360도 굵게->세밀 탐색 재사용
            정밀도리셋()
            로그("ESCAPE TRIGGER failStreak=" + 실패연속)
            let 탈출성공 = 탈출360()
```

- [ ] **Step 4: 정적 검증**

Task 1 Step 5와 동일한 절차로 `tsc --noEmit` 재실행, 에러 0건을 확인한다.

- [ ] **Step 5: 의사실행 트레이스**

`정밀도증가확인()`을 3번 연속 호출하면(전진성공증가조건=3) `정밀도레벨`이 0→1로 1단계만
오르고, `적응전진거리cm`이 `전진성공증가cm`만큼 늘고(최대전진거리cm 상한), `전진성공연속`이
0으로 리셋되는지 확인한다. 그 후 다시 3번 더 호출하면 1→2로 오르는지, 이미 최고
레벨(2)일 때 추가로 호출해도 레벨은 더 안 오르지만 `적응전진거리cm`은 상한까지는
계속 늘어나는지(레벨과 거리는 별개로 각자의 상한을 갖는다) 확인한다. `정밀도소폭감소()`를
호출하면 레벨이 1단계만 내려가고(0 밑으로는 안 내려감) `적응전진거리cm`이
`전진실패감소cm`만큼 줄고(최소전진거리cm 하한) `전진성공연속`이 0으로 리셋되는지
확인한다. `정밀도리셋()`은 레벨을 바로 0으로, `적응전진거리cm`을 `최소전진거리cm`으로
만드는지 확인한다.

- [ ] **Step 6: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add gradually-adaptive precision level controlling row range checked per scan"
```

---

## Task 6: 디버그 콘솔 강화 + 문서/체크리스트 마무리 + 최종 통합 검증

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: Task 1의 `캐시갱신시각`/`마지막사이클ms`, Task 5의 `정밀도레벨`, 기존
  `디버그모드`/`로그()`.
- Produces: `디버그레벨: number`(0/1/2, `디버그모드` 대체), `상세로그(내용: string): void`,
  `캐시최대나이ms(): number`. 하트비트 로그 라인이 이 정보를 포함하도록 확장된다.

- [ ] **Step 1: `디버그모드`를 `디버그레벨`로 교체**

다음 텍스트를 찾는다:

```typescript
const 디버그모드 = true
const 라디오그룹 = 77
```

다음으로 교체한다:

```typescript
let 디버그레벨 = 1   // 0=끄기, 1=하트비트/상태전환, 2=델타/타이밍 등 상세까지
const 라디오그룹 = 77
```

다음 텍스트를 찾는다(`로그()` 함수 정의):

```typescript
function 로그(내용: string): void {
    if (!디버그모드) return
```

다음으로 교체한다:

```typescript
function 로그(내용: string): void {
    if (디버그레벨 < 1) return
```

다음 텍스트를 찾는다(상세 로그 전용 헬퍼가 필요한 위치, `로그()` 함수 바로 뒤):

```typescript
function 로그(내용: string): void {
    if (디버그레벨 < 1) return
    let 전체 = input.runningTime() + "ms " + 내용
    let 위치 = 0
    while (true) {
        let 남음 = 전체.length - 위치
        if (남음 <= 18) {
            radio.sendString(전체.substr(위치, 남음) + "$")
            basic.pause(로그송신지연ms)
            break
        } else {
            radio.sendString(전체.substr(위치, 19))
            basic.pause(로그송신지연ms)
            위치 += 19
        }
    }
}
```

다음으로 교체한다(상세 로그 헬퍼 추가):

```typescript
function 로그(내용: string): void {
    if (디버그레벨 < 1) return
    let 전체 = input.runningTime() + "ms " + 내용
    let 위치 = 0
    while (true) {
        let 남음 = 전체.length - 위치
        if (남음 <= 18) {
            radio.sendString(전체.substr(위치, 남음) + "$")
            basic.pause(로그송신지연ms)
            break
        } else {
            radio.sendString(전체.substr(위치, 19))
            basic.pause(로그송신지연ms)
            위치 += 19
        }
    }
}

// 디버그레벨 2에서만 보내는 상세 로그(델타 스냅샷, 스캔 사이클 타이밍 등) —
// 무선 송신 자체가 시간을 쓰므로 평소엔(레벨 1) 끄고 최적화/진단할 때만 켠다.
function 상세로그(내용: string): void {
    if (디버그레벨 < 2) return
    로그(내용)
}
```

다음 텍스트를 찾는다(`로봇초기화()` 함수):

```typescript
function 로봇초기화(): void {
    if (디버그모드) {
        radio.setGroup(라디오그룹)
        radio.setTransmitPower(7)
    }
```

다음으로 교체한다:

```typescript
function 로봇초기화(): void {
    if (디버그레벨 >= 1) {
        radio.setGroup(라디오그룹)
        radio.setTransmitPower(7)
    }
```

- [ ] **Step 2: 백그라운드 스캐너에 사이클 타이밍 상세 로그 추가**

다음 텍스트를 찾는다(Task 1에서 추가한 백그라운드 fiber):

```typescript
control.inBackground(function () {
    while (true) {
        let 시작 = input.runningTime()
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                let idx = row * 8 + col
                캐시[idx] = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
                캐시갱신시각[idx] = input.runningTime()
            }
        }
        마지막사이클ms = input.runningTime() - 시작
    }
})
```

다음으로 교체한다(사이클 종료 시 상세 로그 추가):

```typescript
control.inBackground(function () {
    while (true) {
        let 시작 = input.runningTime()
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                let idx = row * 8 + col
                캐시[idx] = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
                캐시갱신시각[idx] = input.runningTime()
            }
        }
        마지막사이클ms = input.runningTime() - 시작
        상세로그("SCAN CYCLE " + 마지막사이클ms + "ms")
    }
})
```

- [ ] **Step 3: 캐시 신선도 계산 + 하트비트 확장**

다음 텍스트를 찾는다(Task 2에서 추가한 `델타갱신()` 함수 바로 앞 또는 뒤 — 캐시
선언부 다음 어디든):

```typescript
let 마지막사이클ms = 0
```

다음으로 교체한다:

```typescript
let 마지막사이클ms = 0

function 캐시최대나이ms(): number {
    let 지금 = input.runningTime()
    let 최대 = 0
    for (let i = 0; i < 64; i++) {
        let 나이 = 지금 - 캐시갱신시각[i]
        if (나이 > 최대) 최대 = 나이
    }
    return 최대
}
```

다음 텍스트를 찾는다(메인 루프의 하트비트 로그):

```typescript
    if (디버그모드 && input.runningTime() - 마지막하트비트시각 >= 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " dec=" + 마지막판단 + " step=" + 적응전진거리cm
            + " failStreak=" + 실패연속 + " blockStreak=" + 정면막힘연속 + " started=" + 주행시작됨)
    }
```

다음으로 교체한다:

```typescript
    if (디버그레벨 >= 1 && input.runningTime() - 마지막하트비트시각 >= 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " dec=" + 마지막판단 + " step=" + 적응전진거리cm
            + " failStreak=" + 실패연속 + " blockStreak=" + 정면막힘연속
            + " precision=" + 정밀도레벨 + " cacheAge=" + 캐시최대나이ms()
            + " cycleMs=" + 마지막사이클ms + " started=" + 주행시작됨)
    }
```

- [ ] **Step 4: 정적 검증**

Task 1 Step 5와 동일한 절차로 `tsc --noEmit` 재실행, 에러 0건을 확인한다.

- [ ] **Step 5: 문서 섹션 갱신**

파일 맨 끝의 `## 하드웨어 체크리스트` 섹션을 다음으로 교체한다:

```markdown
## 하드웨어 체크리스트

라이다를 수평·정면으로 장착한 상태에서 다음을 확인한다:

1. 트인 공간에서 `B` 시작 후 평소 주행이 이어지면서, 시간이 지날수록 `HB` 로그의
   `precision` 값이 0→1→2로 점진적으로 올라가는지.
2. 옆에서 갑자기 물체를 가까이 들이댔을 때(회전 탐색 중이든 직진 중이든) 즉시
   후진하는지(`EMERGENCY BACKOFF` 로그 확인).
3. 유리판처럼 라이다로 잘 안 보이는 장애물 앞에서 일정 시간 진행이 없으면
   `STUCK/SLIP DETECTED` 로그가 뜨고 다른 방향을 시도하는지.
4. 한쪽이 좁게 막힌 상황에서 회전 탐색이 충분한 공간을 찾는 순간 회전 중간에라도
   바로 멈추고(`ROTATE SEARCH FOUND` 로그) 전진으로 전환하는지.
5. 좁은 복도/모서리에서 회전 탐색이 반복 실패해(`실패연속한계`회) 최종 360도
   탐색(`ESCAPE TRIGGER`)으로 넘어가는지.
6. 로봇 사방을 완전히 막은 상태에서 최종 360도 탐색도 실패해 `NO ESCAPE`가 뜨는지.
7. `디버그레벨 = 2`로 바꿔서 다시 실행했을 때 `SCAN CYCLE` 사이클 타이밍 로그가
   추가로 찍히는지, 그 값을 보고 캐시 신선도(`cacheAge`)가 합리적인 범위인지.
```

- [ ] **Step 6: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add tiered debug verbosity, extend heartbeat with precision/cacheAge/cycleMs, update hardware checklist"
```
