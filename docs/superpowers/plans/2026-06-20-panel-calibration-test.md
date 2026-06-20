# 차폭 패널 보정 테스트 스크립트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-06-20-panel-calibration-test-design.md`에 정의된, 15x15x5cm 패널을 이용한 1회성 LiDAR/초음파 보정-테스트 MakeCode 스크립트를 새 문서 `PANEL_CALIBRATION_TEST.md`에 작성한다.

**Architecture:** 메인 자율주행 코드(`AUTONOMOUS_WANDER_EXAMPLE.md`)와 완전히 분리된 단일 TypeScript 블록. 부팅 시 초기화 → B 버튼으로 시작 → 3,2,1 카운트다운 → 0~30cm 31스텝 루프(스텝 1부터 1cm씩 PID 후진) → 각 스텝마다 8x8 그리드 3회 반복 읍기로 노이즈/중앙값 산출 후 좌/중앙/우 구역값+초음파를 라디오로 9줄 전송 → 종료 후 `테스트요약()`으로 최소인식거리/최대오차/좌우비대칭/점프목록을 라디오로 전송. 이 프로젝트에는 자동화 테스트 러너가 없으므로(MakeCode/PXT 하드웨어 펌웨어), 각 태스크의 "테스트"는 코드 정적 점검(타입/네이밍 일치, 의사실행 트레이스)과 최종 태스크의 실제 하드웨어 체크리스트로 구성된다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit, `maqueenPlusV2` 확장(`pidControlDistance`, `readUltrasonic`, `I2CInit`), `matrixLidarDistance` 확장(8x8 ToF 그리드), `radio` (그룹 77), `basic`(5x5 매트릭스 숫자/아이콘).

## Global Constraints

- 메인 자율주행 코드(`AUTONOMOUS_WANDER_EXAMPLE.md`)는 수정하지 않는다.
- 라이다 높이(A+B) 자동 스윕은 넣지 않는다.
- LCD 레이더맵 등 무거운 화면 갱신은 넣지 않는다 — 진행 상황은 5x5 매트릭스 숫자만 표시한다.
- 매트릭스 라이다 주소: `matrixLidarDistance.Addr.Addr4` (0x33), 8x8 그리드.
- 전면 초음파: TRIG = `DigitalPin.P13`, ECHO = `DigitalPin.P14`, `maqueenPlusV2.readUltrasonic(P13, P14)` (단위 cm).
- 라디오 그룹: 77.
- 최대거리: 30cm, 총 31스텝(0~30).
- 점프 임계값: 25mm (기대 변화량 10mm의 2.5배).
- 좌/중앙/우 구역 컬럼: 좌=x=1, 중앙=x=3,4, 우=x=6, 행은 모두 y=3,4 (메인 코드 구역 정의와 동일 위치).
- 라디오/N/A 표기: 0 또는 무효 측정값은 오차 계산에서 `"N/A"`로 표기하고 스크립트는 멈추지 않는다.

---

### Task 1: 파일 스캐폴드, 전역 상태, 헬퍼 함수

**Files:**
- Create: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Produces: `정렬삽입(목록: number[], 값: number): void`, `중앙값(목록: number[]): number`, `범위값(목록: number[]): number`, `로그(내용: string): void`, `지점읽기(x: number, y: number): number` — 이후 모든 태스크가 사용.
- Produces: 전역 상수 `라이다주소`, `라디오그룹`, `최대거리cm`, `큐브테스트_점프임계mm`, `그리드샘플반복`.
- Produces: 전역 변수 `이전좌값`, `이전중앙값`, `이전우값`, `시작됨`, `좌결과`, `중앙결과`, `우결과`, `dL결과`, `dC결과`, `dR결과`, `dU결과`, `좌JUMP`, `중앙JUMP`, `우JUMP` (모두 `number[]`/`boolean[]`).

- [ ] **Step 1: 문서 골격과 헬퍼 함수 작성**

`PANEL_CALIBRATION_TEST.md` 파일을 새로 만들고 아래 내용을 작성한다:

````markdown
# 차폭 패널 보정 테스트 스크립트

`docs/superpowers/specs/2026-06-20-panel-calibration-test-design.md` 설계를
구현한 1회성 벤치 테스트 스크립트. 메인 자율주행 코드와는 완전히 분리되어
있으며, 패널 앞에서 로봇을 1cm씩 후진시키며 LiDAR/초음파 측정값을 라디오로
보고한다.

## 사용 방법

1. 5cm 정육면체 9개로 가로15×높이15×두께5cm 패널을 세워 바닥에 고정한다.
2. 로봇을 패널 정면 중앙, 거리 0(코를 맞댄 상태)에 둔다.
3. 아래 코드를 새 MakeCode 프로젝트에 붙여넣고 다운로드한다.
4. 별도 수신기 마이크로비트(라디오 그룹 77)로 로그를 캡처한다.
5. B 버튼을 눌러 시작한다.

```typescript
// ===== 차폭 패널 LiDAR/초음파 보정 테스트 =====
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라디오그룹 = 77
const 최대거리cm = 30
const 큐브테스트_점프임계mm = 25
const 그리드샘플반복 = 3

radio.setGroup(라디오그룹)
radio.setTransmitPower(7)

let 이전좌값 = -1
let 이전중앙값 = -1
let 이전우값 = -1
let 시작됨 = false

let 좌결과: number[] = []
let 중앙결과: number[] = []
let 우결과: number[] = []
let dL결과: number[] = []
let dC결과: number[] = []
let dR결과: number[] = []
let dU결과: number[] = []
let 좌JUMP: boolean[] = []
let 중앙JUMP: boolean[] = []
let 우JUMP: boolean[] = []

function 정렬삽입(목록: number[], 값: number): void {
    목록.push(값)
    for (let i = 목록.length - 1; i > 0; i--) {
        if (목록[i] < 목록[i - 1]) {
            let 임시 = 목록[i]
            목록[i] = 목록[i - 1]
            목록[i - 1] = 임시
        } else {
            break
        }
    }
}

function 중앙값(목록: number[]): number {
    if (목록.length == 0) return 0
    return 목록[Math.idiv(목록.length, 2)]
}

function 범위값(목록: number[]): number {
    if (목록.length < 2) return 0
    return 목록[목록.length - 1] - 목록[0]
}

function 지점읽기(x: number, y: number): number {
    return matrixLidarDistance.matrixPointOutput(라이다주소, x, y)
}

function 로그(내용: string): void {
    radio.sendString(input.runningTime() + "ms " + 내용)
}
```
````

- [ ] **Step 2: 정적 점검**

`정렬삽입`은 메인 코드(`AUTONOMOUS_WANDER_EXAMPLE.md:357-366`)의 검증된 삽입정렬 구현과 동일한 알고리즘인지 비교 확인한다(동일해야 함). `중앙값`/`범위값`도 메인 코드(`:368-376`)와 시그니처가 일치하는지 확인한다. 이름 충돌이 없는지(파일이 완전히 분리되어 있으므로 메인 코드와 같은 함수명을 재사용해도 안전함) 확인한다.

Expected: 세 헬퍼 함수의 시그니처와 동작이 메인 코드와 동일하고, 새 파일 안에서 중복 정의가 없음.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add panel calibration test scaffold and shared helpers"
```

---

### Task 2: 8x8 그리드 3회 읍기 + 구역값/노이즈 계산

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md` (Task 1의 코드 블록 바로 아래에 추가)

**Interfaces:**
- Consumes: `지점읽기(x, y)`, `정렬삽입`, `중앙값`, `범위값` (Task 1).
- Produces: `그리드3회읍기(): number[][][]`, `중앙값그리드(샘플들: number[][][]): number[][]`, `구역median(그리드: number[][], 컬럼들: number[], 행들: number[]): number`, `구역노이즈(샘플들: number[][][], 컬럼들: number[], 행들: number[]): number` — Task 3(`스텝측정`)이 사용.

- [ ] **Step 1: 그리드/구역 함수 작성**

```typescript
function 그리드3회읍기(): number[][][] {
    let 결과: number[][][] = []
    for (let n = 0; n < 그리드샘플반복; n++) {
        let 그리드: number[][] = []
        for (let y = 0; y < 8; y++) {
            let 행: number[] = []
            for (let x = 0; x < 8; x++) 행.push(지점읽기(x, y))
            그리드.push(행)
        }
        결과.push(그리드)
    }
    return 결과
}

function 셀값목록(샘플들: number[][][], x: number, y: number): number[] {
    let 목록: number[] = []
    for (let n = 0; n < 샘플들.length; n++) 정렬삽입(목록, 샘플들[n][y][x])
    return 목록
}

function 중앙값그리드(샘플들: number[][][]): number[][] {
    let 결과: number[][] = []
    for (let y = 0; y < 8; y++) {
        let 행: number[] = []
        for (let x = 0; x < 8; x++) 행.push(중앙값(셀값목록(샘플들, x, y)))
        결과.push(행)
    }
    return 결과
}

function 구역median(그리드: number[][], 컬럼들: number[], 행들: number[]): number {
    let 목록: number[] = []
    for (let yi = 0; yi < 행들.length; yi++) {
        for (let xi = 0; xi < 컬럼들.length; xi++) {
            정렬삽입(목록, 그리드[행들[yi]][컬럼들[xi]])
        }
    }
    return 중앙값(목록)
}

function 구역노이즈(샘플들: number[][][], 컬럼들: number[], 행들: number[]): number {
    let 최대범위 = 0
    for (let yi = 0; yi < 행들.length; yi++) {
        for (let xi = 0; xi < 컬럼들.length; xi++) {
            let 범위 = 범위값(셀값목록(샘플들, 컬럼들[xi], 행들[yi]))
            if (범위 > 최대범위) 최대범위 = 범위
        }
    }
    return 최대범위
}
```

- [ ] **Step 2: 의사실행 트레이스로 정적 검증**

`구역median(그리드, [1], [3,4])`을 손으로 트레이스: `행들=[3,4]`, `컬럼들=[1]` → `그리드[3][1]`, `그리드[4][1]` 두 값만 모아 `정렬삽입` 후 `중앙값`. 2개 값에 대해 `중앙값`은 `목록[Math.idiv(2,2)] = 목록[1]`(더 큰 값)을 반환함을 확인 — 설계서의 "y=3..4 행의 median" 요구를 충족하는 결정적 동작임을 확인. `구역median(그리드, [3,4], [3,4])`는 4개 값(중앙 구역) 중 `목록[2]`를 반환함을 확인.

Expected: 좌/우 구역은 2값 중 인덱스 1, 중앙 구역은 4값 중 인덱스 2를 반환하는 결정적 규칙이며, 스텝마다 동일하게 적용되어 일관성이 유지됨.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add grid sampling and zone median/noise helpers to calibration test"
```

---

### Task 3: 스텝측정() — 라디오 9줄 로그 + 점프 판정 + 결과 누적

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: `그리드3회읍기`, `중앙값그리드`, `구역median`, `구역노이즈` (Task 2), `로그` (Task 1), `maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)`, 전역 `이전좌값`/`이전중앙값`/`이전우값`/`좌결과`/`중앙결과`/`우결과`/`dL결과`/`dC결과`/`dR결과`/`dU결과`/`좌JUMP`/`중앙JUMP`/`우JUMP` (Task 1).
- Produces: `스텝측정(스텝번호: number): void` — Task 4(`보정테스트시작`)가 매 스텝마다 호출.

- [ ] **Step 1: 오차/점프 헬퍼와 스텝측정() 작성**

```typescript
function 오차문자열(값mm: number, 기대mm: number): string {
    return 값mm == 0 ? "N/A" : "" + (값mm - 기대mm)
}

function 점프인가(이전: number, 현재: number): boolean {
    if (이전 < 0) return false
    if (이전 == 0 || 현재 == 0) return false
    return Math.abs(현재 - 이전) > 큐브테스트_점프임계mm
}

const dN_A = 99999

function 스텝측정(스텝번호: number): void {
    let 샘플들 = 그리드3회읍기()
    let 그리드 = 중앙값그리드(샘플들)

    let 좌값 = 구역median(그리드, [1], [3, 4])
    let 중앙값값 = 구역median(그리드, [3, 4], [3, 4])
    let 우값 = 구역median(그리드, [6], [3, 4])

    let 노이즈좌 = 구역노이즈(샘플들, [1], [3, 4])
    let 노이즈중 = 구역노이즈(샘플들, [3, 4], [3, 4])
    let 노이즈우 = 구역노이즈(샘플들, [6], [3, 4])

    let 초음파cm = maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)
    let 초음파값 = Math.round(초음파cm * 10)

    let 기대거리mm = 스텝번호 * 10

    let jL = 점프인가(이전좌값, 좌값)
    let jC = 점프인가(이전중앙값, 중앙값값)
    let jR = 점프인가(이전우값, 우값)

    let 점프문자열 = ""
    if (jL) 점프문자열 += "L"
    if (jC) 점프문자열 += "C"
    if (jR) 점프문자열 += "R"
    if (점프문자열 != "") 점프문자열 = "JUMP:" + 점프문자열

    로그("STEP " + 스텝번호 + " cm=" + 스텝번호 + " exp=" + 기대거리mm + "mm"
        + " L=" + 좌값 + "mm C=" + 중앙값값 + "mm R=" + 우값 + "mm"
        + " uson=" + 초음파값 + "mm"
        + " dL=" + 오차문자열(좌값, 기대거리mm)
        + " dC=" + 오차문자열(중앙값값, 기대거리mm)
        + " dR=" + 오차문자열(우값, 기대거리mm)
        + " dU=" + 오차문자열(초음파값, 기대거리mm)
        + " nL=" + 노이즈좌 + " nC=" + 노이즈중 + " nR=" + 노이즈우
        + " " + 점프문자열)

    for (let y = 0; y < 8; y++) {
        let 줄 = "ROW" + y + ":"
        for (let x = 0; x < 8; x++) 줄 += " " + 그리드[y][x]
        로그(줄)
    }

    좌결과.push(좌값)
    중앙결과.push(중앙값값)
    우결과.push(우값)
    dL결과.push(좌값 == 0 ? dN_A : 좌값 - 기대거리mm)
    dC결과.push(중앙값값 == 0 ? dN_A : 중앙값값 - 기대거리mm)
    dR결과.push(우값 == 0 ? dN_A : 우값 - 기대거리mm)
    dU결과.push(초음파값 <= 0 ? dN_A : 초음파값 - 기대거리mm)
    좌JUMP.push(jL)
    중앙JUMP.push(jC)
    우JUMP.push(jR)

    이전좌값 = 좌값
    이전중앙값 = 중앙값값
    이전우값 = 우값
}
```

- [ ] **Step 2: 스펙 대조 정적 검증**

설계서(스텝당 측정 로직, 7번)의 라디오 전송 형식(헤더 1줄 + ROW0~ROW7 8줄 = 총 9줄)과 코드의 `로그()` 호출 횟수(헤더 1회 + `for (y=0..7)` 루프 8회)를 줄 단위로 대조한다. 헤더 문자열의 필드 순서(`STEP cm exp L C R uson dL dC dR dU nL nC nR JUMP`)가 설계서 86-89번 줄과 정확히 일치하는지 확인한다. `점프인가`가 "직전 스텝 값과 비교"(설계서 81-84번 줄)를 만족하는지 — 갱신은 `스텝측정` 끝에서 일어나므로 다음 호출 시 이전 값이 정확히 직전 스텝 값임을 확인한다.

Expected: 라디오 로그 9줄, 필드 순서, 점프 비교 시점이 스펙과 일치. 불일치 없음.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add per-step measurement, radio logging, and jump detection"
```

---

### Task 4: 테스트요약() — 종료 후 분석 리포트

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: 전역 `좌결과`/`중앙결과`/`우결과`/`dL결과`/`dC결과`/`dR결과`/`dU결과`/`좌JUMP`/`중앙JUMP`/`우JUMP` (Task 1), `로그` (Task 1), `dN_A` (Task 3), `큐브테스트_점프임계mm` (Task 1).
- Produces: `테스트요약(): void` — Task 5(`보정테스트시작`)가 루프 종료 후 호출.

- [ ] **Step 1: 요약 헬퍼와 테스트요약() 작성**

```typescript
function 최소인식거리(결과: number[]): number {
    for (let i = 0; i < 결과.length - 1; i++) {
        if (결과[i] != 0 && 결과[i + 1] != 0 && Math.abs(결과[i + 1] - 결과[i]) <= 큐브테스트_점프임계mm) {
            return i * 10
        }
    }
    return -1
}

function 최대오차스텝(d결과: number[]): string {
    let 최대값 = -1
    let 최대스텝 = -1
    for (let i = 0; i < d결과.length; i++) {
        if (d결과[i] == dN_A) continue
        if (Math.abs(d결과[i]) > 최대값) {
            최대값 = Math.abs(d결과[i])
            최대스텝 = i
        }
    }
    return 최대스텝 < 0 ? "N/A" : ("step" + 최대스텝 + " d=" + d결과[최대스텝])
}

function 점프목록(jump결과: boolean[]): string {
    let 목록 = ""
    for (let i = 0; i < jump결과.length; i++) {
        if (jump결과[i]) 목록 += i + ","
    }
    return 목록 == "" ? "none" : 목록
}

function 테스트요약(): void {
    로그("SUMMARY MinDist L=" + 최소인식거리(좌결과) + "mm C=" + 최소인식거리(중앙결과) + "mm R=" + 최소인식거리(우결과) + "mm")
    로그("SUMMARY MaxErr L:" + 최대오차스텝(dL결과))
    로그("SUMMARY MaxErr C:" + 최대오차스텝(dC결과))
    로그("SUMMARY MaxErr R:" + 최대오차스텝(dR결과))
    로그("SUMMARY MaxErr U:" + 최대오차스텝(dU결과))

    let 최대비대칭 = -1
    let 비대칭스텝 = -1
    for (let i = 0; i < dL결과.length; i++) {
        if (dL결과[i] == dN_A || dR결과[i] == dN_A) continue
        let 차이 = Math.abs(dL결과[i] - dR결과[i])
        if (차이 > 최대비대칭) {
            최대비대칭 = 차이
            비대칭스텝 = i
        }
    }
    로그("SUMMARY Asymmetry step=" + 비대칭스텝 + " diffLR=" + 최대비대칭)

    로그("SUMMARY JumpL " + 점프목록(좌JUMP))
    로그("SUMMARY JumpC " + 점프목록(중앙JUMP))
    로그("SUMMARY JumpR " + 점프목록(우JUMP))
}
```

- [ ] **Step 2: 스펙 대조 정적 검증**

설계서 "종료 후 요약" 4개 항목(구역별 최소 인식 거리, 구역별 최대 오차 스텝, 좌우 비대칭, 점프 목록)이 모두 `테스트요약()` 안에서 각각 한 줄 이상 라디오로 전송되는지 확인한다. `최소인식거리`가 "처음으로 0이 아니고 다음 스텝도 0이 아니며 차이가 점프임계 이내로 안정된 첫 스텝"(설계서 101-103번 줄) 조건을 그대로 구현했는지 코드의 `if` 조건과 한 줄씩 대조한다.

Expected: 4개 요약 항목 모두 라디오 전송 코드 존재, 최소인식거리 조건이 스펙 문장과 1:1 대응.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add end-of-test summary report for calibration test"
```

---

### Task 5: 초기화, 카운트다운, 메인 루프, 버튼 핸들러

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: `스텝측정` (Task 3), `테스트요약` (Task 4), `로그` (Task 1), 전역 `시작됨`/`이전좌값`/`이전중앙값`/`이전우값`/`좌결과`/`중앙결과`/`우결과`/`dL결과`/`dC결과`/`dR결과`/`dU결과`/`좌JUMP`/`중앙JUMP`/`우JUMP` (Task 1), `maqueenPlusV2.I2CInit()`, `matrixLidarDistance.initialize`, `maqueenPlusV2.pidControlDistance`, `maqueenPlusV2.SpeedDirection.SpeedCCW`, `maqueenPlusV2.MyInterruption.NotAllowed`.
- Produces: `로봇초기화_테스트(): void`, `보정테스트시작(): void`, 최종 실행 진입점(`input.onButtonPressed(Button.B, ...)` + 부팅 시 `로봇초기화_테스트()` 호출) — 이 태스크로 스크립트가 완결됨.

- [ ] **Step 1: 초기화/루프/버튼 핸들러 작성**

```typescript
function 로봇초기화_테스트(): void {
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(라이다주소, matrixLidarDistance.Matrix.MAT)
    basic.pause(500)
    로그("CALTEST BOOT")
    basic.showIcon(IconNames.Target)
}

function 보정테스트시작(): void {
    시작됨 = true
    이전좌값 = -1
    이전중앙값 = -1
    이전우값 = -1
    좌결과 = []
    중앙결과 = []
    우결과 = []
    dL결과 = []
    dC결과 = []
    dR결과 = []
    dU결과 = []
    좌JUMP = []
    중앙JUMP = []
    우JUMP = []

    로그("CALTEST START")
    for (let n = 3; n > 0; n--) {
        basic.showNumber(n)
        basic.pause(700)
    }
    basic.clearScreen()

    for (let 스텝 = 0; 스텝 <= 최대거리cm; 스텝++) {
        if (스텝 > 0) {
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 1, maqueenPlusV2.MyInterruption.NotAllowed)
        }
        basic.showNumber(스텝)
        스텝측정(스텝)
        basic.pause(150)
    }

    테스트요약()
    basic.showIcon(IconNames.Yes)
    로그("CALTEST DONE")
    시작됨 = false
}

input.onButtonPressed(Button.B, function () {
    if (!시작됨) 보정테스트시작()
})

로봇초기화_테스트()
```

- [ ] **Step 2: 흐름 정적 검증**

설계서 "동작 흐름" 1~5번과 코드를 순서대로 대조: (1) 부팅 시 `로봇초기화_테스트()` 호출 — 파일 맨 끝 `로봇초기화_테스트()` 호출문 확인. (2) B 버튼 시작 — `input.onButtonPressed(Button.B, ...)`에서 `시작됨` 플래그로 중복 시작 방지 확인. (3) 3,2,1 카운트다운 — `for (let n = 3; n > 0; n--)` 확인. (4) 스텝 0은 후진 없이 측정, 스텝 1~30은 1cm PID 후진 후 측정 — `if (스텝 > 0)` 분기로 스텝 0만 후진을 건너뜀을 확인. (5) 종료 후 `테스트요약()` + 완료 아이콘 — 루프 종료 직후 `테스트요약()`, `basic.showIcon(IconNames.Yes)` 호출 확인.

Expected: 5단계 모두 코드에서 1:1로 확인됨, 누락 없음.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add init, countdown, main loop, and button handler for calibration test"
```

---

### Task 6: 전체 통합 정적 리뷰 + 하드웨어 검증 체크리스트 문서화

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md` (코드 블록 뒤에 안내 섹션 추가)

**Interfaces:**
- Consumes: Task 1~5에서 정의된 모든 함수/변수 전체.
- Produces: 없음 (문서 마무리, 사람이 실행할 하드웨어 검증 절차).

- [ ] **Step 1: 변수/함수 네이밍 일치 전체 재검토**

`PANEL_CALIBRATION_TEST.md` 전체 코드 블록을 다시 읽고 다음을 확인한다:
- `좌값`/`중앙값값`/`우값`(스텝측정 내 지역변수)과 `좌결과`/`중앙결과`/`우결과`(전역 배열)가 일관되게 짝지어 push되는지.
- `dL결과`/`dC결과`/`dR결과`/`dU결과`에 들어가는 부호(`값 - 기대거리mm`)가 `오차문자열`의 부호와 동일한지(둘 다 `값 - 기대`).
- `dN_A`(99999)가 `오차문자열`의 `"N/A"` 분기와 별개로 숫자 배열(`dL결과` 등)에서만 사용되고, 라디오 로그 문자열에는 절대 노출되지 않는지(라디오 로그는 항상 `오차문자열`을 통해 "N/A" 문자열로 표기).
- Math.idiv 사용처(`중앙값`)가 PXT 런타임에서 지원되는 표준 함수인지 — 메인 코드(`AUTONOMOUS_WANDER_EXAMPLE.md`)에서 이미 동일하게 사용 중이므로 호환성 확인됨.

Expected: 발견된 불일치 없음. 발견 시 즉시 코드 수정 후 재확인.

- [ ] **Step 2: 하드웨어 검증 체크리스트를 문서 끝에 추가**

`PANEL_CALIBRATION_TEST.md` 코드 블록 바로 뒤에 아래 섹션을 추가한다:

````markdown
## 실행 전 준비물

- 5cm 정육면체 나무 블록 9개 (또는 동일 규격 패널)를 3x3로 쌓아 가로15cm
  × 높이15cm × 두께5cm 패널을 만들어 세워서 바닥에 고정한다 (로봇에는
  붙이지 않음).
- 줄자 또는 바닥 표시로 0, 10, 20, 30cm 지점을 미리 표시해둔다.
- 별도 수신기 마이크로비트를 라디오 그룹 77로 설정하고 `radio.onReceivedString`
  + `serial.writeLine`으로 시리얼 콘솔에 로그를 받는다 (`AUTONOMOUS_WANDER_EXAMPLE.md`의
  "무선(라디오) 디버그 콘솔" 섹션과 동일 채널 재사용 가능).

## 실행 후 하드웨어 검증 체크리스트

- [ ] 부팅 직후 5x5 매트릭스에 대기 아이콘이 표시되는가.
- [ ] B 버튼을 누르면 3, 2, 1 숫자가 순서대로 표시되는가.
- [ ] 각 스텝마다 로봇이 정확히 1cm씩 후진하는지 줄자로 대조했을 때, 예상
      스텝 위치(0~30cm)와 실제 위치가 육안으로 일치하는가.
- [ ] 수신기 콘솔에 스텝 0~30 각각 9줄(헤더 1줄 + ROW0~ROW7) 총 279줄의
      로그가 끊김 없이 수신되는가.
- [ ] 스텝 0에서 L/C/R 값이 0(미인식) 또는 비정상적으로 작은 값으로
      나오는 것을 확인했는가(정상 — 센서 최소 인식 거리 추정용).
- [ ] 테스트 종료 시 5x5 매트릭스에 완료(Yes) 아이콘이 표시되고, SUMMARY로
      시작하는 7줄(MinDist, MaxErr L/C/R/U, Asymmetry, JumpL/C/R)이
      수신되는가.
- [ ] SUMMARY MinDist 값이 실제로 센서가 안정적으로 값을 내기 시작한
      거리와 대략 일치하는가(줄자 기준 육안 확인).
````

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add hardware verification checklist for panel calibration test"
```
