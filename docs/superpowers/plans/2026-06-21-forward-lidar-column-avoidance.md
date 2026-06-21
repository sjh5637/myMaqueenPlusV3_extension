# 정면 고정 장착 라이다 + 8열 회피/탈출 알고리즘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 파일 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`에, 라이다를 수평·정면으로
고정 장착한 상태(바닥 보정 불필요)를 가정하고 8x8 매트릭스 라이다를 8개 열 단위로
읽어 정면 장애물에 따라 경로를 바꾸는 평상시 회피 알고리즘과, 회피가 거듭 실패할 때
360도를 굵게→세밀하게 다시 훑어 빠져나가는 탈출 알고리즘을 구현한다.

**Architecture:** 8x8 점을 열(column) 단위 최솟거리로 압축하는 데이터 레이어 →
중앙 2열만 보는 저비용 정면 안전 체크 → 안전하지 않으면 8열 전체를 스캔해 가장 넓게
열린 열 그룹으로 회전 후 전진하는 회피 → 5회 연속 회피 실패 시 4단계(45°→15°→
우후방15°→좌후방15°) 360도 탐색으로 전환하는 탈출. 기존
`AUTONOMOUS_WANDER_EXAMPLE.md`는 수정하지 않고, 검증된 코스→파인 회전-복귀 수학
패턴만 새 파일에 독립적으로 재구현한다.

**Tech Stack:** MakeCode/PXT TypeScript (micro:bit), `maqueenPlusV2`/`maqueenPlusV3`
네임스페이스(`maqueenPlusV3.ts`), `matrixLidarDistance` 네임스페이스
(`pxt_modules/matrixLidarDistance/matrixLidarDistance.ts`), DFR0997 LCD I2C 제어
(주소 `0x2c`), micro:bit 5x5 LED, `radio` 기반 무선 디버그 로그.

## Global Constraints

- 새 파일 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`만 생성한다. `AUTONOMOUS_WANDER_EXAMPLE.md`는
  어떤 함수도 수정/참조하지 않는다.
- 센서는 라이다(`matrixLidarDistance`)만 사용한다. 초음파 센서는 사용하지 않는다.
- 라이다 입력은 `matrixLidarDistance.matrixPointOutput(address, x, y)`로 8x8 점을
  직접 읽는다. `getData()`/`getObstacleDistance()`/`obstacleSuggestion()`은 4x4
  모드 전용이라 사용하지 않는다.
- 바닥/높이/각도 보정 절차(`A` 버튼, `A+B` 높이 변경, 각도진단)는 만들지 않는다.
  장착 오차는 안전거리 여유값(`정지거리mm`, `안전거리mm`)으로만 흡수한다.
- 센서 "감지 없음" 센티널 값(`라이다무효값mm = 4000` 이상)은 읽는 즉시 0으로
  필터링하고, 0은 "완전히 열림"으로 취급한다.
- 열 인덱스(0~7) → 각도 변환: `열각도(col) = (col - 3.5) * 7.5` (FOV 60° ÷ 8열).
- `maqueenPlusV2.pidControlDistance(dir: SpeedDirection, distance: number, interruption: MyInterruption)`은
  **3개 인자**이며 첫 인자는 항상 `maqueenPlusV2.SpeedDirection.SpeedCW`(전진) 또는
  `SpeedCCW`(후진)다. 2개 인자로 호출하면 타입 에러가 난다.
- LCD/로그/버튼/초기화는 `AUTONOMOUS_WANDER_EXAMPLE.md`와 같은 스타일(`lcd줄()`
  고정 5줄 좌표, `로그()` 19바이트 분할 무선 전송, DFR0997 명령 포맷)로 새 파일에
  독립적으로 재구현한다 — 호출 의존은 만들지 않는다.
- 자동 테스트 러너가 없는 프로젝트다. 검증은 `tsc --noEmit` 정적 체크 + 의사실행
  트레이스 + 하드웨어 체크리스트(사람이 실행)로 한다.

---

## Task 1: 파일 골격 — 상수/상태, LCD·로그 헬퍼, 데이터 레이어, 정지-only 메인루프

**Files:**
- Create: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Produces: `열최소읍기(col: number): number`, `전체열스캔(): number[]`,
  `구간최소(거리목록: number[], 시작: number, 끝: number): number`,
  `정면안전(): boolean`, `lcd줄(번호: number, 내용: string, 색: number): void`,
  `lcd표시(강제: boolean): void`, `lcd대기표시(강제: boolean): void`,
  `LED레이더표시(거리목록: number[]): void`, `로그(내용: string): void`,
  `로봇초기화(): void`, `출발카운트다운(): void`. 전역 상태:
  `상태: string`, `마지막판단: string`, `마지막탐색점수: number`,
  `적응전진거리cm: number`, `실패연속: number`, `전진성공연속: number`,
  `출발요청: boolean`, `주행시작됨: boolean`. Task 2/3에서 이 이름과 시그니처를
  그대로 사용한다.

- [ ] **Step 1: 파일 생성 — 머리말 설명 + typescript 코드 블록(상수/상태/헬퍼/데이터레이어/정지-only 메인루프)**

다음 전체 내용으로 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`를 만든다.

````markdown
# 정면 고정 장착 매트릭스 라이다 8열 회피/탈출 예제

이 예제는 8x8 Matrix LiDAR를 **바닥 쪽으로 기울이지 않고 수평·정면으로 고정
장착**한 상태를 가정합니다. 라이다가 바닥을 보지 않으므로 `AUTONOMOUS_WANDER_EXAMPLE.md`가
필요로 하던 바닥/높이/각도 보정 절차가 전혀 필요 없습니다. 장착 오차는 안전거리
여유값으로만 흡수합니다.

라이다는 `matrixLidarDistance.matrixPointOutput()`으로 8x8 점을 직접 읽어
**열(column) 단위 최솟거리**로 압축해서 사용합니다. 평상시에는 중앙 2열만 보는
저비용 체크로 정지 여부를 판단하고, 막혔을 때만 8열 전체를 스캔해 가장 넓게
열린 방향으로 회전 후 전진합니다. 같은 자리에서 5회 연속 회피에 실패하면
360도를 45°→15°→우후방15°→좌후방15° 순으로 점점 세밀하게 다시 훑는 탈출
모드로 전환합니다.

LCD 주소 `0x2c`와 Matrix LiDAR 주소 `Addr4(0x33)` 구성을 기준으로 작성했습니다.

동작 순서:

1. 부팅 후 LCD에 `FORWARD LIDAR READY`, `B = START`가 표시됩니다(보정 절차 없음).
2. `B`를 누르면 3초 카운트다운 후 평상시 회피 주행이 시작됩니다.
3. 정면 중앙이 트여 있으면 그대로 전진하고, 막히면 8열을 스캔해 가장 넓게 열린
   방향으로 회전한 뒤 전진합니다.
4. 회피가 5회 연속 실패하면 360도 굵게→세밀 탐색으로 빠져나갈 방향을 찾습니다.
   4단계를 모두 거쳐도 못 찾으면 정지하고 X 아이콘을 표시합니다.

```typescript
const LCD주소 = 0x2c
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라이다무효값mm = 4000

const 정지거리mm = 250
const 안전거리mm = 400
const 최소그룹폭열수 = 2
const 전진거리cm = 6
const 최소전진거리cm = 4
const 최대전진거리cm = 10
const 전진성공증가조건 = 3
const 전진성공증가cm = 1
const 전진실패감소cm = 2
const 실패연속한계 = 5
const 탐색점수상한mm = 1000
const 탈출최소점수 = 8000

const 루프대기ms = 40
const LCD갱신간격ms = 500
const 디버그모드 = true
const 라디오그룹 = 78
const LCD맵칸쓰기지연ms = 5
const 로그송신지연ms = 20

let 열가중치 = [1, 1.5, 2, 3, 3, 2, 1.5, 1]
let 탈출각도 = [-90, -45, 0, 45, 90]
let 탈출각도세밀 = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90]
let 탈출각도세밀후방우 = [105, 120, 135, 150, 165, 180]
let 탈출각도세밀후방좌 = [-105, -120, -135, -150, -165, -180]

let 적응전진거리cm = 전진거리cm
let 전진성공연속 = 0
let 실패연속 = 0
let 상태 = "BOOT"
let 마지막판단 = "INIT"
let 마지막탐색점수 = 0
let 마지막LCD시각 = 0
let 출발요청 = false
let 주행시작됨 = false

function 로그(내용: string): void {
    if (!디버그모드) return
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

function lcd명령쓰기(데이터: number[]): void {
    let 보낼위치 = 0
    while (보낼위치 < 데이터.length) {
        let 끝 = Math.min(보낼위치 + 32, 데이터.length)
        let 조각 = 데이터.slice(보낼위치, 끝)
        pins.i2cWriteBuffer(LCD주소, pins.createBufferFromArray(조각), 끝 < 데이터.length)
        보낼위치 = 끝
        basic.pause(LCD맵칸쓰기지연ms)
    }
}

function lcd명령(명령: number, 데이터: number[]): void {
    let 전체길이 = 데이터.length + 4
    let 패킷 = [0x55, 0xaa, 전체길이 - 3, 명령]
    for (let i = 0; i < 데이터.length; i++) 패킷.push(데이터[i])
    lcd명령쓰기(패킷)
}

function utf8바이트(문자열: string): number[] {
    let 결과: number[] = []
    for (let i = 0; i < 문자열.length; i++) {
        let c = 문자열.charCodeAt(i)
        if (c <= 0x7f) {
            결과.push(c)
        } else if (c <= 0x7ff) {
            결과.push(0xc0 | (c >> 6))
            결과.push(0x80 | (c & 0x3f))
        } else {
            결과.push(0xe0 | (c >> 12))
            결과.push(0x80 | ((c >> 6) & 0x3f))
            결과.push(0x80 | (c & 0x3f))
        }
    }
    return 결과
}

function lcd지우기(): void {
    lcd명령(0x1d, [])
    basic.pause(1500)
}

function lcd배경색(색: number): void {
    lcd명령(0x19, [(색 >> 16) & 0xff, (색 >> 8) & 0xff, 색 & 0xff])
    basic.pause(300)
}

function lcd문자(번호: number, x: number, y: number, 내용: string, 색: number): void {
    let 데이터 = [
        번호,
        2,
        (색 >> 16) & 0xff,
        (색 >> 8) & 0xff,
        색 & 0xff,
        (x >> 8) & 0xff,
        x & 0xff,
        (y >> 8) & 0xff,
        y & 0xff
    ]
    let 바이트 = utf8바이트(내용)
    for (let i = 0; i < 바이트.length; i++) 데이터.push(바이트[i])
    lcd명령(0x18, 데이터)
}

function lcd줄(번호: number, 내용: string, 색: number): void {
    let y목록 = [16, 54, 92, 130, 168]
    let 표시 = 내용
    if (표시.length > 26) 표시 = 표시.substr(0, 26)
    while (표시.length < 26) 표시 += " "
    lcd문자(번호, 8, y목록[번호 - 1], 표시, 색)
}

function 거리밝기(거리: number): number {
    if (거리 <= 0) return 0
    if (거리 <= 정지거리mm) return 255
    if (거리 >= 안전거리mm) return 20
    return Math.round(255 - ((거리 - 정지거리mm) * 235) / (안전거리mm - 정지거리mm))
}

function 구간최소(거리목록: number[], 시작: number, 끝: number): number {
    let 최소 = 0
    for (let col = 시작; col <= 끝; col++) {
        if (거리목록[col] > 0 && (최소 == 0 || 거리목록[col] < 최소)) 최소 = 거리목록[col]
    }
    return 최소
}

function LED레이더표시(거리목록: number[]): void {
    let 칸시작 = [0, 2, 3, 4, 6]
    let 칸끝 = [1, 3, 4, 5, 7]
    for (let i = 0; i < 5; i++) {
        let 밝기 = 거리밝기(구간최소(거리목록, 칸시작[i], 칸끝[i]))
        led.plotBrightness(i, 2, 밝기)
    }
}

function lcd표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    let 거리목록 = 전체열스캔()
    lcd줄(1, 상태, 0x000000)
    lcd줄(2, "DEC " + 마지막판단, 0x0000ff)
    lcd줄(3, "L" + 구간최소(거리목록, 0, 1) + " F" + 구간최소(거리목록, 3, 4) + " R" + 구간최소(거리목록, 6, 7), 0xaa00aa)
    lcd줄(4, "STEP " + 적응전진거리cm + "cm FAIL " + 실패연속, 0x008000)
    lcd줄(5, "SCORE " + 마지막탐색점수, 0x000000)
    LED레이더표시(거리목록)
}

function lcd대기표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    lcd줄(1, "FORWARD LIDAR READY", 0x000000)
    lcd줄(2, "B = START", 0x0000ff)
    lcd줄(3, "NO CALIBRATION NEEDED", 0x008000)
    lcd줄(4, "", 0xffffff)
    lcd줄(5, "", 0xffffff)
}

function 로봇초기화(): void {
    if (디버그모드) {
        radio.setGroup(라디오그룹)
        radio.setTransmitPower(7)
    }
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(라이다주소, matrixLidarDistance.Matrix.MAT)
    basic.pause(500)
    로그("BOOT FORWARD LIDAR")
    lcd지우기()
    lcd배경색(0xffffff)
    lcd줄(1, "FORWARD LIDAR READY", 0x000000)
    lcd줄(2, "B = START", 0x0000ff)
    lcd줄(3, "NO CALIBRATION NEEDED", 0x008000)
}

function 출발카운트다운(): void {
    상태 = "START"
    for (let n = 3; n > 0; n--) {
        마지막판단 = "START " + n
        lcd줄(1, "START " + n, 0x000000)
        lcd줄(2, "FRONT LIDAR SCAN", 0x0000ff)
        basic.showNumber(n)
        basic.pause(1000)
    }
    basic.clearScreen()
}

function 열최소읍기(col: number): number {
    let 최소 = 0
    for (let row = 0; row < 8; row++) {
        let raw = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
        let mm = raw >= 라이다무효값mm ? 0 : raw
        if (mm > 0 && (최소 == 0 || mm < 최소)) {
            최소 = mm
        }
    }
    return 최소
}

function 전체열스캔(): number[] {
    let 결과: number[] = []
    for (let col = 0; col < 8; col++) {
        결과.push(열최소읍기(col))
    }
    return 결과
}

function 정면안전(): boolean {
    let c3 = 열최소읍기(3)
    let c4 = 열최소읍기(4)
    return (c3 == 0 || c3 >= 정지거리mm) && (c4 == 0 || c4 >= 정지거리mm)
}

input.onButtonPressed(Button.B, function () {
    if (!주행시작됨) 출발요청 = true
})

로봇초기화()

basic.forever(function () {
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

    if (정면안전()) {
        상태 = "DRIVE"
        마지막판단 = "FWD " + 적응전진거리cm + "cm"
        maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
    } else {
        maqueenPlusV2.pidControlStop()
        상태 = "STOP"
        마지막판단 = "FRONT BLOCKED"
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```
````

이 시점의 동작은 정면이 트여 있으면 전진하고, 막히면 멈춘 채로 가만히 있는 것뿐이다
(회피/탈출은 Task 2, 3에서 추가). 이미 완결된 하나의 동작이므로 그대로 동작 확인이
가능하다.

- [ ] **Step 2: 정적 검증**

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

Expected: `1 blocks, <N> chars` (코드 블록이 1개뿐이므로).

`tsconfig.json`을 백업하고 `"files"`를 임시로 바꾼다:

```bash
cp tsconfig.json tsconfig.json.bak
```

`tsconfig.json`의 `"files"` 배열을 다음으로 임시 교체한다(기존 내용은
`tsconfig.json.bak`에 보존됨):

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
경고 1줄만 출력되고, `_forward_lidar_check.ts` 관련 타입 에러(TS2304/TS2339/TS2554 등)는
0건이어야 한다. 특히 `maqueenPlusV2.pidControlDistance(...)` 호출이 3개 인자로
타입 에러 없이 인식되는지 확인한다.

복구:

```bash
mv tsconfig.json.bak tsconfig.json
rm _forward_lidar_check.ts
git status --short tsconfig.json _forward_lidar_check.ts
```

Expected: 마지막 명령 출력이 비어 있음(두 파일 모두 변경 없음 상태로 복구됨).

- [ ] **Step 3: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add forward-mounted-LiDAR example skeleton with column data layer and stop-only loop"
```

---

## Task 2: 평상시 회피 알고리즘 — 최선열찾기, 회피시도, 가변 전진거리

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md` (Task 1에서 만든 코드 블록)

**Interfaces:**
- Consumes: Task 1의 `열최소읍기()`, `전체열스캔()`, `정면안전()`, `로그()`,
  전역 `적응전진거리cm`, `실패연속`, `전진성공연속`, `상태`, `마지막판단`.
- Produces: `최선열찾기(거리목록: number[]): number`, `회피시도(): boolean`.
  Task 3은 `회피시도()`가 `false`를 반환하고 `실패연속 >= 실패연속한계`일 때
  탈출 모드로 넘어가는 메인루프 분기를 그대로 사용한다.

- [ ] **Step 1: `최선열찾기()`/`회피시도()` 추가**

Task 1의 `정면안전()` 함수 바로 다음(메인루프 `input.onButtonPressed` 앞)에
다음 두 함수를 추가한다:

```typescript
function 최선열찾기(거리목록: number[]): number {
    let 최선시작 = -1
    let 최선길이 = 0
    let 현재시작 = -1
    let 현재길이 = 0
    for (let col = 0; col < 8; col++) {
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

function 회피시도(): boolean {
    let 거리목록 = 전체열스캔()
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
    maqueenPlusV2.pidControlAngle(목표각, maqueenPlusV2.MyInterruption.NotAllowed)
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 적응전진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
    if (!정면안전()) {
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

- [ ] **Step 2: 메인루프의 "else"(막힘) 분기를 회피 호출로 교체**

Task 1에서 작성한 메인루프의 다음 부분을:

```typescript
    } else {
        maqueenPlusV2.pidControlStop()
        상태 = "STOP"
        마지막판단 = "FRONT BLOCKED"
    }
```

다음으로 교체한다:

```typescript
    } else {
        maqueenPlusV2.pidControlStop()
        상태 = "AVOID"
        회피시도()
    }
```

- [ ] **Step 3: 정적 검증 + 의사실행 트레이스**

Task 1 Step 2와 동일한 추출/`tsc --noEmit`/복구 절차를 다시 수행한다(블록 개수는
여전히 1개). 에러 0건을 확인한다.

다음 입력에 대해 `최선열찾기()`를 손으로 트레이스해 기대값과 일치하는지 확인한다
(`안전거리mm = 400`, `최소그룹폭열수 = 2` 기준):

| 입력 `거리목록` | 기대 반환값 | 이유 |
|---|---|---|
| `[0,0,0,0,0,0,0,0]` | `3` | 전부 열림(0) → 길이 8 그룹, 중심 = `0 + (8-1)/2 = 3.5` → 정수 연산이라 `3`(TS는 `/`가 실수 나눗셈이므로 실제로는 `3.5`를 반환함에 주의 — 구현은 `number`형이라 `3.5`가 그대로 반환된다. 회전각 계산 `(3.5-3.5)*7.5=0`이 되어 정중앙을 향하므로 의도된 동작이다.) |
| `[100,100,100,500,500,100,100,100]` | `3.5` | col3,4만 열림(길이 2) → 중심 `3+(2-1)/2=3.5` |
| `[500,500,500,100,100,100,100,100]` | `0.5` | col0,1만 열림(길이 2, `최소그룹폭열수`=2 충족) → 중심 `0+(2-1)/2=0.5` |
| `[100,100,100,100,100,500,500,100]` | `5.5` | col5,6만 열림 → 중심 `5+(2-1)/2=5.5` |
| `[100,100,100,100,100,100,100,100]` | `-1` | 전부 막힘 → 그룹 없음 |

(표의 두 번째 줄에서 짚었듯 `중심열`이 정수가 아닐 수 있음을 확인했다 — 이는
설계상 의도된 동작이며 `목표각 = Math.round((목표열 - 3.5) * 7.5)`에서 `Math.round`로
최종 회전각만 정수화되므로 문제가 되지 않는다.)

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add column-gap avoidance with adaptive forward distance"
```

---

## Task 3: 탈출(360도 굵게→세밀) 알고리즘

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`

**Interfaces:**
- Consumes: Task 1/2의 `전체열스캔()`, `로그()`, 전역 `열가중치`, `탈출각도*`,
  `탈출최소점수`, `탐색점수상한mm`, `실패연속`, `실패연속한계`, `상태`,
  `마지막판단`, `마지막탐색점수`.
- Produces: `탐색점수계산(): number`, `열각도순회탐색(각도목록: number[]): number`,
  `탈출360(): boolean`. 메인루프가 `실패연속 >= 실패연속한계`일 때 `탈출360()`을
  호출하고, 실패 시 `"NO ESCAPE"`로 정지 + X 아이콘 표시한다.

- [ ] **Step 1: 탈출 함수 추가**

Task 2에서 추가한 `회피시도()` 다음에 다음 세 함수를 추가한다:

```typescript
function 탐색점수계산(): number {
    let 거리목록 = 전체열스캔()
    let 점수 = 0
    for (let col = 0; col < 8; col++) {
        let 거리 = 거리목록[col] == 0 ? 탐색점수상한mm : Math.min(거리목록[col], 탐색점수상한mm)
        점수 += 거리 * 열가중치[col]
    }
    return 점수
}

function 열각도순회탐색(각도목록: number[]): number {
    let 최고점수 = -999999
    let 최고각 = 각도목록[0]
    maqueenPlusV2.pidControlAngle(각도목록[0], maqueenPlusV2.MyInterruption.NotAllowed)
    for (let i = 0; i < 각도목록.length; i++) {
        let 후보각 = 각도목록[i]
        let 점수 = 탐색점수계산()
        if (점수 > 최고점수) {
            최고점수 = 점수
            최고각 = 후보각
        }
        로그("ESCAPE DIR " + 후보각 + " SCORE " + 점수)
        if (i < 각도목록.length - 1) {
            maqueenPlusV2.pidControlAngle(각도목록[i + 1] - 각도목록[i], maqueenPlusV2.MyInterruption.NotAllowed)
        }
    }
    let 복귀각 = 최고각 - 각도목록[각도목록.length - 1]
    마지막탐색점수 = 최고점수
    maqueenPlusV2.pidControlAngle(복귀각, maqueenPlusV2.MyInterruption.NotAllowed)
    basic.pause(300)
    return 최고각
}

function 탈출360(): boolean {
    상태 = "ESCAPE"
    maqueenPlusV2.pidControlStop()

    let 최고각 = 열각도순회탐색(탈출각도)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-FINE"
    최고각 = 열각도순회탐색(탈출각도세밀)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-BACK-R"
    최고각 = 열각도순회탐색(탈출각도세밀후방우)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-BACK-L"
    최고각 = 열각도순회탐색(탈출각도세밀후방좌)
    if (마지막탐색점수 >= 탈출최소점수) return true

    로그("ALL 360 ESCAPE STAGES FAILED -> NO ESCAPE")
    return false
}
```

- [ ] **Step 2: 메인루프에 탈출 전환/최종 실패 처리 연결**

Task 2에서 만든 메인루프의 다음 부분을:

```typescript
    } else {
        maqueenPlusV2.pidControlStop()
        상태 = "AVOID"
        회피시도()
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

다음으로 교체한다:

```typescript
    } else {
        maqueenPlusV2.pidControlStop()
        상태 = "AVOID"
        let 회피성공 = 회피시도()
        if (!회피성공 && 실패연속 >= 실패연속한계) {
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
            실패연속 = 0
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

- [ ] **Step 3: 정적 검증 + 의사실행 트레이스**

Task 1 Step 2와 동일한 추출/`tsc --noEmit`/복구 절차를 다시 수행한다. 에러 0건을
확인한다.

`열각도순회탐색()`의 회전 누적이 각 단계마다 정확히 원위치로 복귀하는지 다음
표로 확인한다(진입 헤딩을 0°로 가정):

| 단계 | 각도목록 | 진입 회전 | 루프 중 회전 합 | 최종 위치(예: 최고각=45 가정) | 복귀각 | 복귀 후 위치 |
|---|---|---|---|---|---|---|
| 1 | `[-90,-45,0,45,90]` | `-90` | `45+45+45+45=180` | `90` | `45-90=-45` | `90-45=45`... |

위 표는 실제로는 `열각도순회탐색()` 내부에서 마지막 루프 위치(`각도목록[len-1]=90`)에서
`복귀각 = 최고각 - 90`만큼 추가 회전해 `최고각`(예: `45`)에 정확히 도달하게 하는
것이 목적이다(`90 + (45-90) = 45`). 이는 `2026-06-21-fine-angle-rescan.md`에서
이미 검증된 동일한 수학 패턴이며, `탈출360()`이 각 단계 실패 시 호출하는
`maqueenPlusV2.pidControlAngle(-최고각, ...)`은 그 단계가 도달한 `최고각`만큼만
정확히 되돌리므로(단계 진입 시점 헤딩이 항상 0 기준), 다음 단계의
`열각도순회탐색(각도목록[0])` 첫 회전이 항상 진입 헤딩 기준 절대각으로 정확히
맞아 들어간다. 4단계 각도 배열(`탈출각도`, `탈출각도세밀`, `탈출각도세밀후방우`,
`탈출각도세밀후방좌`)이 합쳐서 -180~180을 15° 간격으로(1단계는 45° 간격으로)
빠짐없이 덮는지 배열 값을 손으로 나열해 확인한다.

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Add 4-stage coarse-to-fine 360 escape search triggered by repeated avoidance failure"
```

---

## Task 4: 하드웨어 체크리스트 문서화 + 최종 통합 검증

**Files:**
- Modify: `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md` (문서 끝에 체크리스트 섹션 추가)

**Interfaces:**
- Consumes: Task 1~3에서 완성된 전체 코드 블록(수정하지 않음, 문서 텍스트만 추가).

- [ ] **Step 1: 코드 블록 뒤에 조정값 표 + 하드웨어 체크리스트 섹션 추가**

코드 블록(마지막 ` ``` ` 다음 줄) 바로 뒤에 다음 내용을 추가한다:

````markdown

## 기본 조정값

| 변수 | 기본값 | 의미 |
|---|---:|---|
| `정지거리mm` | 250 | 중앙 열(col3,4)이 이 거리 미만이면 즉시 정지 |
| `안전거리mm` | 400 | 회피 시 "열렸다"고 판단하는 열별 기준거리 |
| `최소그룹폭열수` | 2 | 이 개수 미만으로 연속 열린 열은 노이즈로 무시 |
| `적응전진거리cm` | 6 (4~10 가변) | 회피 후 전진 거리, 성공/실패에 따라 가변 |
| `실패연속한계` | 5 | 회피 시도 연속 실패 시 탈출 모드 전환 기준 |
| `탐색점수상한mm` | 1000 | 점수 계산 시 거리값 상한 |
| `열가중치` | `[1, 1.5, 2, 3, 3, 2, 1.5, 1]` | 탐색 점수 계산 시 중앙 열에 더 큰 가중치 |
| `탈출최소점수` | 8000 | 탈출 탐색에서 이 점수 이상이면 그 방향을 채택 |
| `라이다무효값mm` | 4000 | 이상이면 "감지 없음"으로 0 처리 |

## 하드웨어 체크리스트

라이다를 수평·정면으로 장착한 상태에서 다음을 확인한다:

1. 정면이 트인 공간에서 `B` 시작 후 평상시 직진이 계속 이어지는지.
2. 한쪽이 좁게 막힌 상황(예: 왼쪽에 박스)에서 반대쪽(오른쪽)의 열린 열 그룹으로
   회전·회피하는지, LCD `STEP`/`FAIL` 값과 5x5 LED 근접도 표시가 실제 장애물
   위치와 맞는지.
3. 좁은 복도/모서리에서 5회 연속 회피 실패 후 LCD 상태가 `ESCAPE`로 바뀌고
   360도 탐색이 시작되는지.
4. 로봇 사방을 완전히 막은 상태에서 4단계(`ESCAPE`→`ESCAPE-FINE`→`ESCAPE-BACK-R`→
   `ESCAPE-BACK-L`) 모두 실패해 LCD에 `NO ESCAPE`가 표시되고 X 아이콘이 뜨며
   정지하는지.
````

- [ ] **Step 2: 최종 통합 검증**

Task 1 Step 2와 동일한 추출/`tsc --noEmit`/복구 절차를 한 번 더 수행해, 문서
텍스트 추가가 코드 블록 추출 정규식(` ```typescript ... ``` `)에 영향을 주지
않았는지 확인한다(여전히 `1 blocks`, 에러 0건).

전체 흐름을 손으로 한 번 더 트레이스한다: 부팅(`로봇초기화()`) → `B` 누름
(`출발요청=true`) → `출발카운트다운()` → `주행시작됨=true` → 매 틱
`정면안전()` 확인 → 안전하면 전진, 막히면 `회피시도()` → 5회 연속 실패 시
`탈출360()` → 성공하면 `실패연속=0`으로 평상시 루프 복귀, 4단계 모두 실패하면
`주행시작됨=false`로 돌아가 `B`로 재시작 가능한 상태가 되는지 확인한다.

- [ ] **Step 3: Commit**

```bash
git add AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md
git commit -m "Document tuning values and hardware checklist for forward-LiDAR example"
```
