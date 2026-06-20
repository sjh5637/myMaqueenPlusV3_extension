# LCD 8x8 레이더맵을 5x5 LED 표시로 교체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-06-21-led-radar-replace-lcd-map-design.md`에 정의된 대로, `AUTONOMOUS_WANDER_EXAMPLE.md`의 느린 8x8 LCD 레이더맵을 제거하고 micro:bit 본체 5x5 LED 중앙 한 줄로 좌/정면/우 근접도를 표시하도록 교체한다.

**Architecture:** 4단계로 진행한다. (1) 8x8 맵 전용 코드(함수 3개 + 전역 9개 + 호출 1곳)를 제거한다. (2) `거리색()`을 대체하는 `거리밝기()`와 5x5 LED를 그리는 `LED레이더표시()`를 추가한다. (3) 메인 루프와 대기 화면에 새 함수를 연결한다. (4) 문서를 갱신하고 전체 코드 블록을 tsc로 정적 검증한다. 이 프로젝트는 자동화 테스트 러너가 없으므로(MakeCode/PXT 하드웨어 펌웨어), 각 태스크의 "테스트"는 코드 정적 점검(grep, 의사실행 트레이스)과 마지막 태스크의 tsc 컴파일 체크 + 하드웨어 체크리스트로 구성된다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit, core `led`/`basic` 네임스페이스(`led.plotBrightness`, `basic.clearScreen`).

## Global Constraints

- LCD 텍스트 상태 표시(`lcd문자(...)` 호출들)는 변경하지 않는다 — 이번 변경은 8x8 레이더맵 제거와 5x5 LED 추가, 관련 문서 갱신에만 한정한다.
- 자율주행 의사결정 로직(전진/회피/탐색 방향 결정)은 건드리지 않는다.
- `거리밝기()`는 `거리색()`과 동일한 거리 구간을 그대로 재사용한다: `거리==0→0`, `<긴급정지거리mm→255`, `<320→200`, `<520→130`, `<800→70`, 그 외(≥800)→20.
- 5x5 LED 열 매핑: 0,1열=좌(`구역최소(0)`), 2열=정면(`정면최소거리()`), 3,4열=우(`구역최소(2)`). row는 2(중앙)만 사용, 나머지 행은 항상 꺼짐.
- `LED레이더표시()`는 추가 센서 I2C 읽기를 하지 않는다 — 그 틱에 이미 읽힌 `최근값`/`최근초음파mm` 기반 계산값만 사용한다.
- `지점읽기()`, `lcd명령쓰기()`, `LCD맵칸쓰기지연ms`는 다른 기능(기울기보정, LCD 텍스트 청크 전송)에서도 쓰이므로 그대로 둔다 — 삭제하지 않는다.

---

### Task 1: 8x8 LCD 레이더맵 코드 제거

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: 없음(삭제 작업).
- Produces: 코드베이스에서 `lcd레이더맵표시`/`lcd사각형`/`거리색`/`LCD맵*`/`마지막맵시각`가 전부 제거된 상태 — Task 2가 빈 자리에 새 함수를 추가.

- [x] **Step 1: 전역 상수 6개 제거**

다음 코드를 찾는다:

```typescript
const LCD맵갱신간격ms = 1000
const LCD맵X = 8
const LCD맵Y = 8
const LCD맵칸 = 14
const LCD맵간격 = 2
const LCD맵ID시작 = 20
```

이 6줄을 통째로 삭제한다. (바로 앞 줄 `const LCD갱신간격ms = 500`과 바로 뒤 줄 `const 막힘속도기준 = 1`은 그대로 둔다.)

- [x] **Step 2: 전역 변수 3개 제거**

다음 코드를 찾는다:

```typescript
let LCD맵사용 = true
let LCD맵이전색: number[] = []
```

이 2줄을 삭제한다(바로 앞 줄 `let 최근초음파mm = 0`은 그대로 둔다).

다음 코드를 찾는다:

```typescript
let 마지막맵시각 = 0
```

이 줄도 삭제한다(앞뒤 `let 마지막정밀확인시각 = 0` / `let 적응전진거리cm = 전진거리cm`은 그대로 둔다).

- [x] **Step 3: `lcd표시()` 안의 호출 제거**

다음 코드를 찾는다:

```typescript
    lcd문자(5, 140, 92, 각도상태 + " N" + 보정노이즈, 각도색())
    lcd레이더맵표시(false)
}
```

아래로 바꾼다(`lcd레이더맵표시(false)` 줄만 삭제):

```typescript
    lcd문자(5, 140, 92, 각도상태 + " N" + 보정노이즈, 각도색())
}
```

- [x] **Step 4: `거리색()` 함수 제거**

다음 코드를 찾는다:

```typescript
function 거리색(거리: number): number {
    if (거리 == 0) return 0x202020
    if (거리 < 긴급정지거리mm) return 0xff0000
    if (거리 < 320) return 0xff9900
    if (거리 < 520) return 0xffff00
    if (거리 < 800) return 0x00cc00
    return 0x0066ff
}
```

이 함수 전체를 삭제한다.

- [x] **Step 5: `lcd레이더맵표시()` 함수 제거**

다음 코드를 찾는다(바로 앞에 빈 줄 하나, Step 4에서 삭제한 `거리색()` 자리 다음에 위치):

```typescript
function lcd레이더맵표시(강제: boolean): void {
    if (!LCD맵사용) return
    if (!강제 && input.runningTime() - 마지막맵시각 < LCD맵갱신간격ms) return
    마지막맵시각 = input.runningTime()
    if (LCD맵이전색.length != 64) {
        LCD맵이전색 = []
        for (let i = 0; i < 64; i++) LCD맵이전색.push(-1)
        강제 = true
    }
    let 그린칸수 = 0
    let 시작시각 = input.runningTime()
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let 거리 = 지점읽기(x, y)
            let 색 = 거리색(거리)
            let 칸번호 = y * 8 + x
            if (!강제 && LCD맵이전색[칸번호] == 색) continue
            LCD맵이전색[칸번호] = 색
            let px = LCD맵X + x * (LCD맵칸 + LCD맵간격)
            let py = LCD맵Y + y * (LCD맵칸 + LCD맵간격)
            lcd사각형(LCD맵ID시작 + 칸번호, px, py, LCD맵칸, LCD맵칸, 색)
            그린칸수 += 1
        }
    }
    if (디버그모드 && 그린칸수 > 0) 로그("MAP drew" + 그린칸수 + " ms" + (input.runningTime() - 시작시각))
}
```

이 함수 전체를 삭제한다.

- [x] **Step 6: `lcd사각형()` 함수 제거**

다음 코드를 찾는다:

```typescript
function lcd사각형(id: number, x: number, y: number, w: number, h: number, 색: number): void {
    let 데이터 = [
        id,
        1,
        0x22,
        0x22,
        0x22,
        1,
        (색 >> 16) & 0xff,
        (색 >> 8) & 0xff,
        색 & 0xff,
        0,
        (x >> 8) & 0xff,
        x & 0xff,
        (y >> 8) & 0xff,
        y & 0xff,
        (w >> 8) & 0xff,
        w & 0xff,
        (h >> 8) & 0xff,
        h & 0xff
    ]
    lcd명령(0x04, 데이터)
}
```

이 함수 전체를 삭제한다.

- [x] **Step 7: 정적 검증**

```bash
grep -n "LCD맵\|마지막맵시각\|lcd사각형\|거리색\|레이더맵" "AUTONOMOUS_WANDER_EXAMPLE.md"
```

Expected: 코드 블록(```typescript 안) 안에는 더 이상 `LCD맵`/`마지막맵시각`/`lcd사각형`/`거리색`/`레이더맵`이 나타나지 않는다. (문서 설명 텍스트 부분과 두 번째 ```typescript 블록—무선 디버그 수신기—에는 원래 이 식별자들이 없으므로 매치 자체가 없어야 한다.)

- [x] **Step 8: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Remove 8x8 LCD radar map (functions, globals, call site)"
```

---

### Task 2: `거리밝기()`와 `LED레이더표시()` 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `구역최소(구역: number): number`(기존), `정면최소거리(): number`(기존, ultrasonic 융합), `led.plotBrightness(x, y, brightness)`/`basic.clearScreen()`(core).
- Produces: 함수 `거리밝기(거리: number): number`, 함수 `LED레이더표시(): void` — Task 3이 메인 루프에서 호출.

- [x] **Step 1: `구역최소()` 함수 뒤에 두 함수 추가**

다음 코드를 찾는다(Task 1 이후에도 그대로 남아있는 함수):

```typescript
function 구역최소(구역: number): number {
    let 최소 = 9999
    for (let i = 0; i < 샘플수; i++) {
        if (샘플구역[i] == 구역) 최소 = Math.min(최소, 트인거리값(최근값[i]))
    }
    return 최소 == 9999 ? 0 : 최소
}
```

아래로 바꾼다(기존 `구역최소()`는 그대로 두고 바로 뒤에 두 함수 추가):

```typescript
function 구역최소(구역: number): number {
    let 최소 = 9999
    for (let i = 0; i < 샘플수; i++) {
        if (샘플구역[i] == 구역) 최소 = Math.min(최소, 트인거리값(최근값[i]))
    }
    return 최소 == 9999 ? 0 : 최소
}

function 거리밝기(거리: number): number {
    if (거리 == 0) return 0
    if (거리 < 긴급정지거리mm) return 255
    if (거리 < 320) return 200
    if (거리 < 520) return 130
    if (거리 < 800) return 70
    return 20
}

function LED레이더표시(): void {
    basic.clearScreen()
    led.plotBrightness(0, 2, 거리밝기(구역최소(0)))
    led.plotBrightness(1, 2, 거리밝기(구역최소(0)))
    led.plotBrightness(2, 2, 거리밝기(정면최소거리()))
    led.plotBrightness(3, 2, 거리밝기(구역최소(2)))
    led.plotBrightness(4, 2, 거리밝기(구역최소(2)))
}
```

(`초음파읍기()`/`정면최소거리()`는 `구역최소()` 바로 다음, 이 새 함수들 바로 뒤에 이미 존재한다 — 순서상 문제 없음.)

- [x] **Step 2: 의사실행 트레이스로 정적 검증**

`거리밝기(0)` → `0`. `거리밝기(279)` → `279 < 280` 참 → `255`. `거리밝기(280)` → 첫 조건 거짓, `280 < 320` 참 → `200`. `거리밝기(319)` → `200`. `거리밝기(320)` → `320<520` 참 → `130`. `거리밝기(799)` → `130`. `거리밝기(800)` → 모든 `<` 조건 거짓 → `20`. 즉 경계값에서 정확히 한 단계씩 떨어지고, 0만 완전히 꺼짐(`0`)을 확인한다.

`LED레이더표시()`: 좌측이 가까우면(`구역최소(0)`=200) 0,1열이 밝게(`200`), 정면이 멀면(`정면최소거리()`=900) 2열이 어둡게(`20`), 우측이 무효(0)면 3,4열이 꺼짐(`0`). row 0,1,3,4는 `clearScreen()` 이후 한 번도 `plotBrightness`가 호출되지 않으므로 항상 꺼짐 상태임을 확인한다.

- [x] **Step 3: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Add brightness-bucket helper and 5x5 LED radar display function"
```

---

### Task 3: 메인 루프와 대기 화면에 연결

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `LED레이더표시()`(Task 2), 기존 `감시샘플읽기()`/`막힘연속갱신()`/`lcd대기표시()`.
- Produces: 없음 — 이 태스크로 5x5 LED가 실제 주행 루프와 대기 화면에 반영됨.

- [x] **Step 1: 메인 루프에서 매 틱 `LED레이더표시()` 호출**

다음 코드를 찾는다:

```typescript
    감시샘플읽기()
    막힘연속갱신()
    let 정면위험상태 = 정면위험()
```

아래로 바꾼다:

```typescript
    감시샘플읽기()
    막힘연속갱신()
    LED레이더표시()
    let 정면위험상태 = 정면위험()
```

- [x] **Step 2: 대기 화면에서 LED 정리**

다음 코드를 찾는다:

```typescript
function lcd대기표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    lcd문자(1, 8, 16, "HEIGHT " + 라이더높이mm + "mm", 0x000000)
```

아래로 바꾼다(`basic.clearScreen()` 한 줄 추가):

```typescript
function lcd대기표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    basic.clearScreen()
    lcd문자(1, 8, 16, "HEIGHT " + 라이더높이mm + "mm", 0x000000)
```

- [x] **Step 3: 흐름 정적 검증**

```bash
grep -n "LED레이더표시\|basic.clearScreen" "AUTONOMOUS_WANDER_EXAMPLE.md"
```

Expected: `LED레이더표시` 함수 정의 1곳 + 메인 루프 호출 1곳(총 2곳), `basic.clearScreen()`가 `LED레이더표시()` 내부 1곳 + `lcd대기표시()` 내부 1곳(총 2곳) 나타난다. 메인 루프 호출이 `감시샘플읽기()`/`막힘연속갱신()` 다음, `정면위험상태` 계산 이전에 있는지 확인한다(이 시점에 `최근값`/`최근초음파mm`가 그 틱 기준으로 이미 갱신돼 있어야 함).

- [x] **Step 4: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Wire 5x5 LED radar into per-tick main loop and clear it on standby"
```

---

### Task 4: 문서 갱신

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: 없음(문서 텍스트만 수정).
- Produces: 없음 — 사람이 읽는 설명을 새 동작과 일치시킴.

- [x] **Step 1: 사용 흐름 설명 갱신**

다음 코드를 찾는다:

```
LCD는 대기/보정/탐색/주행 상태를 계속 표시합니다. 주행 중에는 현재 LiDAR 판단 모드
(`FAST`, `CHECK`, `RESCAN`, `ESCAPE`, `FULL`), `L/F/R`, `Y5/Y6/Y7`, 각도 상태와 보정
노이즈를 보여줍니다.
```

아래로 바꾼다:

```
LCD는 대기/보정/탐색/주행 상태를 계속 표시합니다. 주행 중에는 현재 LiDAR 판단 모드
(`FAST`, `CHECK`, `RESCAN`, `ESCAPE`, `FULL`), `L/F/R`, `Y5/Y6/Y7`, 각도 상태와 보정
노이즈를 보여줍니다. 좌/정면/우 장애물 근접도는 micro:bit 본체 5x5 LED의 가운데 한
줄(밝을수록 가까움)로 거의 실시간 표시됩니다.
```

다음 코드를 찾는다:

```
이 코드는 `getData()`의 좌/정면/우 요약값 대신 **8x8 Matrix 원본 빔 일부를 직접 읽어서**
낮은 물체/정면 물체/높은 물체를 나눠 판단합니다. 실시간 주행에서는 6점 FAST 또는 12점
CHECK로 판단하고, LCD 레이더맵은 저빈도 갱신으로 8x8 전체를 시각화합니다.
```

아래로 바꾼다:

```
이 코드는 `getData()`의 좌/정면/우 요약값 대신 **8x8 Matrix 원본 빔 일부를 직접 읽어서**
낮은 물체/정면 물체/높은 물체를 나눠 판단합니다. 실시간 주행에서는 6점 FAST 또는 12점
CHECK로 판단하고, 좌/정면/우 근접도는 micro:bit 본체 5x5 LED로 매 틱 시각화합니다.
```

- [x] **Step 2: 조정값 표에서 LCD맵 행 제거**

다음 코드를 찾는다:

```
| `LCD갱신간격ms` | 500 | 주행 중 LCD 갱신 최소 간격 |
| `LCD맵사용` | true | 느리면 `false`로 바꿔 8x8 색상 맵을 끔 |
| `LCD맵갱신간격ms` | 1000 | 8x8 색상 맵 갱신 최소 간격 |
```

아래로 바꾼다:

```
| `LCD갱신간격ms` | 500 | 주행 중 LCD 갱신 최소 간격 |
```

- [x] **Step 3: "핵심 변화" 11번 항목을 5x5 LED 교체로 재작성**

다음 코드를 찾는다:

```
11. **LCD 레이더맵 갱신 속도 개선**: 이전에는 칸 64개를 매번 전부 다시 그리며 I2C 청크마다
    `basic.pause(50)`를 기다려 한 번 그릴 때 3초 이상 걸렸습니다. 이제는 직전 색상과 같은
    칸은 다시 그리지 않고(`LCD맵이전색` 캐시), 청크당 대기시간도 `LCD맵칸쓰기지연ms=5`로
    줄였습니다. 보통 장애물이 없는 칸은 색이 잘 안 바뀌므로 실제로 다시 그리는 칸 수가 크게
    줄어듭니다. 디버그 모드에서는 맵 갱신마다 그린 칸 수와 걸린 시간을 `MAP drew.. ms..`
    로그로 보내므로, 여전히 느리면 이 값을 보고 추가로 줄일 수 있습니다.
```

아래로 바꾼다:

```
11. **8x8 LCD 레이더맵을 5x5 LED로 교체**: I2C로 64칸을 그리던 LCD 레이더맵은 칸이 많이
    바뀌는 틱에서 그리는 데만 수백ms~수초가 걸려 메인 루프를 지연시켰습니다. 이를 완전히
    제거하고, micro:bit 본체 5x5 LED의 가운데 한 줄(`LED레이더표시()`)에 좌/정면/우 근접도를
    밝기로 표시하도록 바꿨습니다. 추가 센서 읽기 없이 그 틱에 이미 읽은 값만 쓰므로 메인
    루프 매 틱(`루프대기ms`=40ms)마다 갱신되고, I2C 지연이 전혀 없습니다.
```

- [x] **Step 4: 테스트 체크리스트 6번 교체**

다음 코드를 찾는다:

```
6. 주행 중 LCD 왼쪽 8x8 색상 맵이 너무 느리게 느껴지면 `LCD맵사용 = false`로 끄고 다시 테스트합니다.
```

아래로 바꾼다:

```
6. 주행 중 micro:bit 본체 5x5 LED 가운데 줄에서 좌/정면/우 밝기가 장애물 거리에 맞게 바뀌는지 확인합니다(가까울수록 밝음, 장애물 없으면 꺼짐).
```

- [x] **Step 5: "LCD 레이더맵 색상" 섹션을 "5x5 LED 밝기" 섹션으로 교체**

다음 코드를 찾는다:

```
## LCD 레이더맵 색상

- 회색/검정: 미감지 또는 0
- 파랑: 먼 거리
- 초록: 비교적 안전한 거리
- 노랑: 주의 거리
- 주황: 가까운 거리
- 빨강: 긴급 거리
```

아래로 바꾼다:

```
## 5x5 LED 밝기

micro:bit 본체 5x5 LED의 가운데 줄(row 2) 5칸이 좌2/정면1/우2를 나타냅니다.

- 꺼짐(0): 미감지 또는 0
- 매우 어두움(20): 먼 거리(800mm 이상)
- 어두움(70): 주의 거리(520~799mm)
- 중간(130): 가까운 거리(320~519mm)
- 밝음(200): 더 가까운 거리(280~319mm)
- 최대 밝기(255): 긴급 거리(`긴급정지거리mm` 미만)
```

- [x] **Step 6: 정적 검증**

```bash
grep -n "8x8\|LCD맵\|레이더맵" "AUTONOMOUS_WANDER_EXAMPLE.md"
```

Expected: 더 이상 8x8 LCD 레이더맵을 현재 동작으로 설명하는 문장이 남아있지 않다(과거형으로 "교체했다"고 설명하는 핵심 변화 11번 문장 정도만 8x8을 언급, 나머지는 5x5 LED 기준으로 서술).

- [x] **Step 7: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Update docs to describe 5x5 LED radar instead of 8x8 LCD map"
```

---

### Task 5: 전체 코드 블록 tsc 정적 타입체크 + 하드웨어 체크리스트

**Files:**
- Read-only check against: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`
- Temporarily modify (then revert): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\tsconfig.json`
- Temporarily create (then delete): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\_wander_check.ts`

**Interfaces:**
- Consumes: Task 1~4에서 작성된 전체 코드.
- Produces: 없음(검증 전용, 코드 변경 없음).

- [x] **Step 1: 코드 블록 추출**

```bash
python3 -c "
import re
text = open('AUTONOMOUS_WANDER_EXAMPLE.md', encoding='utf-8').read()
blocks = re.findall(r'\`\`\`typescript\n(.*?)\n\`\`\`', text, re.S)
open('_wander_check.ts','w',encoding='utf-8').write(blocks[0])
print('written', len(blocks[0]), 'chars from', len(blocks), 'blocks')
"
```

Expected: `written N chars from M blocks` 출력(N>0, M==2 — 본체 코드 + 무선 디버그 수신기). 본체 코드가 첫 번째 ```typescript 블록이어야 한다.

- [x] **Step 2: tsconfig.json 백업 후 임시 수정**

```bash
cp tsconfig.json tsconfig.json.bak
python3 -c "
import json
c = json.load(open('tsconfig.json', encoding='utf-8'))
c['files'].insert(0, '_wander_check.ts')
c['files'].insert(1, 'pxt_modules/matrixLidarDistance/matrixLidarDistance.ts')
json.dump(c, open('tsconfig.json','w', encoding='utf-8'), indent=4)
"
```

- [x] **Step 3: tsc 실행**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...` 경고 1줄만 출력되고, `_wander_check.ts` 관련 타입 에러(TS2304/TS2339 등)는 0건. 특히 `led.plotBrightness`/`basic.clearScreen`이 타입 에러 없이 인식되는지 확인한다. 에러가 있으면 해당 태스크 코드로 돌아가 수정 후 이 Step부터 재실행한다.

- [x] **Step 4: 원상복구**

```bash
mv tsconfig.json.bak tsconfig.json
rm -f _wander_check.ts
git status --short tsconfig.json _wander_check.ts
```

Expected: 마지막 `git status --short` 출력이 비어 있음.

- [ ] **Step 5: 하드웨어 검증 체크리스트 (사람이 실행)**

이 프로젝트에는 자동화 테스트 러너가 없으므로, 아래는 실제 로봇으로 확인한다.

- [ ] 부팅 후 대기 화면에서 5x5 LED가 꺼져 있는가.
- [ ] 주행 시작 후 좌측에 장애물을 가까이 대면 0,1열이 밝아지고, 치우면 꺼지는가.
- [ ] 정면에 장애물을 가까이 대면 2열이 밝아지고(비상정지가 걸리는 거리에서 최대 밝기인가), 우측은 3,4열에서 동일하게 동작하는가.
- [ ] 장애물이 없을 때 5칸 모두 꺼지거나 매우 어두운 상태인가(800mm 이상 구간).
- [ ] 주행을 멈추고(예: 높이 변경 버튼 A+B) 대기 화면으로 돌아오면 5x5 LED가 꺼지는가.
- [ ] 이전 8x8 LCD 맵 대비 메인 루프가 더 빠르게/끊김 없이 도는 느낌인가(LCD 텍스트 갱신이 더 즉각적인가).

- [ ] **Step 6: Commit**

이 태스크는 검증만 수행하고 코드를 변경하지 않으므로 커밋할 대상이 없다. `git status --short`가 비어 있음을 확인하는 것으로 태스크를 마친다.
