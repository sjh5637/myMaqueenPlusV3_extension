# 부팅 시 라이더 기울기 보정 흐름 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-06-21-wander-boot-tilt-calibration-design.md`에 정의된 새 부팅/버튼 흐름(A=즉시 주행 시작, B=라이더 기울기 실시간 보정모드)을 `AUTONOMOUS_WANDER_EXAMPLE.md`에 구현한다.

**Architecture:** 기존 `각도진단()`/`바닥보정()`/Y6(260~520)·Y7(≥200) 임계값은 그대로 재사용한다. 새로 추가하는 건 `바닥보정()`의 Y5/Y6/Y7/좌/우 raw 표본 수집 루프를 가볍게 복사한 `기울기보정라이브틱()` 하나뿐이고(기준값/카운트다운/상태리셋 없이 표본 수집 + `각도진단()` 호출 + LCD 갱신만), 나머지는 버튼 핸들러 3개와 메인 루프의 `!주행시작됨` 분기, 그리고 이제 죽은 코드가 되는 `보정요청`/`보정완료` 플래그 제거다. 이 프로젝트는 자동화 테스트 러너가 없으므로(MakeCode/PXT 하드웨어 펌웨어), 각 태스크의 "테스트"는 코드 정적 점검(tsc 타입체크, 의사실행 트레이스)과 최종 태스크의 실제 하드웨어 체크리스트로 구성된다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit, `maqueenPlusV2`/`matrixLidarDistance` 확장, 기존 `lcd문자`/`각도색`/`각도진단`/`정렬삽입`/`지점읽기` 헬퍼.

## Global Constraints

- 메인 자율주행 로직(전진/회피/탐색 알고리즘 본체)은 건드리지 않는다 — 이번 변경은 부팅 전 단계(주행 시작 전)의 버튼/표시 흐름에만 한정한다.
- `각도진단()`의 판정 임계값(Y6 260~520mm, Y7 ≥200mm @ 기본높이 140mm)은 수정하지 않는다.
- A 버튼은 항상 `바닥보정()` → `출발준비()`를 순서대로 호출한다(각도상태와 무관하게, 게이트 없음).
- B 버튼은 주행 중이 아닐 때만 `기울기보정모드중 = true`로 라이브 모드에 진입한다.
- AB(높이 변경)는 라이브 모드 중에도 그대로 허용한다 — `높이변경()`은 수정하지 않는다(`기울기보정모드중`을 끄지 않음).
- `기울기보정라이브틱()`은 5회 반복으로 표본을 모은다(1회만 모으면 `각도진단()` 내부의 `목록.length < 3` 가드가 항상 걸려 잘못된 판정이 나오므로 — `바닥보정()`과 동일한 반복 수를 유지).

---

### Task 1: `기울기보정모드중` 상태 + `기울기보정라이브틱()` 함수 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `지점읽기(x, y)`, `정렬삽입(목록, 값)`, `각도진단(y5목록, y6목록, y7목록, 좌목록, 우목록)`, `lcd문자(번호, x, y, 내용, 색)`, `각도색()`, 전역 `보정Y5`/`보정Y6`/`보정Y7`/`각도상태`(모두 기존, 수정 없음).
- Produces: 전역 `기울기보정모드중: boolean`, 전역 상수 `기울기보정틱대기ms`, 함수 `기울기보정라이브틱(): void` — Task 2(버튼 핸들러)와 Task 3(메인 루프)가 사용.

- [ ] **Step 1: 상수 추가**

`AUTONOMOUS_WANDER_EXAMPLE.md`에서 다음 줄을 찾는다:

```typescript
const 루프대기ms = 40
const LCD갱신간격ms = 500
```

그 사이에 새 상수를 추가해 아래처럼 바꾼다:

```typescript
const 루프대기ms = 40
const 기울기보정틱대기ms = 100
const LCD갱신간격ms = 500
```

- [ ] **Step 2: 전역 플래그 추가**

다음 줄을 찾는다:

```typescript
let 높이변경요청 = false
let 보정완료 = false
```

`높이변경요청`과 `보정완료` 사이에 새 플래그를 추가해 아래처럼 바꾼다:

```typescript
let 높이변경요청 = false
let 기울기보정모드중 = false
let 보정완료 = false
```

(`보정완료`는 Task 3에서 삭제되지만, 이 태스크에서는 아직 그대로 둔다 — 태스크 단위로 한 번에 하나씩만 바꾼다.)

- [ ] **Step 3: `기울기보정라이브틱()` 함수 작성**

`각도진단()` 함수가 끝나는 지점(`}` 다음, `function 바닥보정(): void {` 바로 전)에 추가한다. 즉 다음 코드:

```typescript
function 각도진단(y5목록: number[], y6목록: number[], y7목록: number[], 좌목록: number[], 우목록: number[]): void {
    ...(기존 내용, 수정 없음)...
}

function 바닥보정(): void {
```

를 아래로 바꾼다(`각도진단()` 본문은 그대로, 사이에 새 함수만 끼워 넣음):

```typescript
function 각도진단(y5목록: number[], y6목록: number[], y7목록: number[], 좌목록: number[], 우목록: number[]): void {
    ...(기존 내용, 수정 없음)...
}

function 기울기보정라이브틱(): void {
    let y5목록: number[] = []
    let y6목록: number[] = []
    let y7목록: number[] = []
    let 좌목록: number[] = []
    let 우목록: number[] = []
    for (let n = 0; n < 5; n++) {
        let c5a = 지점읽기(3, 5)
        let c5b = 지점읽기(4, 5)
        let c6a = 지점읽기(3, 6)
        let c6b = 지점읽기(4, 6)
        let c7a = 지점읽기(3, 7)
        let c7b = 지점읽기(4, 7)
        let l6 = 지점읽기(1, 6)
        let l7 = 지점읽기(1, 7)
        let r6 = 지점읽기(6, 6)
        let r7 = 지점읽기(6, 7)
        if (c5a != 0) 정렬삽입(y5목록, c5a)
        if (c5b != 0) 정렬삽입(y5목록, c5b)
        if (c6a != 0) 정렬삽입(y6목록, c6a)
        if (c6b != 0) 정렬삽입(y6목록, c6b)
        if (c7a != 0) 정렬삽입(y7목록, c7a)
        if (c7b != 0) 정렬삽입(y7목록, c7b)
        if (l6 != 0) 정렬삽입(좌목록, l6)
        if (l7 != 0) 정렬삽입(좌목록, l7)
        if (r6 != 0) 정렬삽입(우목록, r6)
        if (r7 != 0) 정렬삽입(우목록, r7)
    }
    각도진단(y5목록, y6목록, y7목록, 좌목록, 우목록)
    lcd문자(1, 8, 16, "TILT CAL LIVE", 0x000000)
    lcd문자(2, 8, 54, "ADJUST TILT BY HAND", 0x0000ff)
    lcd문자(3, 8, 92, "PRESS A TO START", 0x008000)
    lcd문자(4, 8, 130, "Y5 " + 보정Y5 + " Y6 " + 보정Y6 + " Y7 " + 보정Y7, 0xaa00aa)
    lcd문자(5, 8, 168, 각도상태, 각도색())
}

function 바닥보정(): void {
```

- [ ] **Step 4: 의사실행 트레이스로 정적 검증**

`기울기보정라이브틱()`의 표본 수집 루프(5회 반복, 매회 10개 지점)가 `바닥보정()`(Task 1 수정 전 원본, 라인 659-684 부근)의 Y5/Y6/Y7/좌/우 수집 루프와 한 줄씩 동일한지 대조한다 — 좌표(`지점읽기(3,5)` 등)와 `정렬삽입` 호출 순서가 정확히 같아야 한다(전체샘플읽기/보정샘플/기준값/막힘연속 관련 줄만 빠져 있어야 함). `각도진단()` 호출 시 5회 반복이면 각 리스트(`y6목록` 등)가 최대 2개씩 쌓여 5회 후 최대 10개가 되므로, `각도진단()` 내부의 `y6목록.length < 3 || y7목록.length < 3` 가드를 통과할 수 있는 충분한 표본 수임을 확인한다(빈 바닥에서 정상 동작 시 대부분의 표본이 유효하므로 3개 미만이 되는 경우는 드묾).

Expected: 표본 수집 로직이 `바닥보정()`과 동일하고, 5회 반복이 `각도진단()`의 최소 표본 가드를 충분히 만족시킴.

- [ ] **Step 5: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Add live tilt-calibration tick function and mode flag"
```

---

### Task 2: 버튼 핸들러를 새 의미로 교체

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: 전역 `기울기보정모드중`(Task 1), `출발요청`/`주행시작됨`/`높이변경요청`(기존).
- Produces: 없음(이벤트 핸들러 재배선) — Task 3가 새 버튼 의미를 전제로 메인 루프를 재구성함.

- [ ] **Step 1: 버튼 핸들러 교체**

다음 코드를 찾는다:

```typescript
input.onButtonPressed(Button.A, function () {
    보정요청 = true
})

input.onButtonPressed(Button.B, function () {
    출발요청 = true
})

input.onButtonPressed(Button.AB, function () {
    높이변경요청 = true
})
```

아래로 바꾼다:

```typescript
input.onButtonPressed(Button.A, function () {
    기울기보정모드중 = false
    출발요청 = true
})

input.onButtonPressed(Button.B, function () {
    if (!주행시작됨) 기울기보정모드중 = true
})

input.onButtonPressed(Button.AB, function () {
    높이변경요청 = true
})
```

(`보정요청 = true` 대입은 삭제된다 — `보정요청` 변수 자체는 Task 3에서 정리한다.)

- [ ] **Step 2: 정적 검증**

스펙(`2026-06-21-wander-boot-tilt-calibration-design.md`) "새 동작 흐름" 1~2번과 대조: A는 라이브 모드 플래그를 끄고 `출발요청`만 세팅(무거운 작업은 메인 루프가 처리하는 기존 패턴 유지), B는 주행 중이 아닐 때만 라이브 모드 플래그를 세팅함을 확인한다. AB는 변경 없음을 확인한다.

Expected: 버튼 핸들러가 플래그만 설정하고 무거운 함수를 직접 호출하지 않음(기존 패턴과 일치), 스펙의 버튼 의미와 1:1 대응.

- [ ] **Step 3: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Repurpose A/B buttons for immediate-start and live tilt-cal entry"
```

---

### Task 3: 메인 루프 재구성 + 죽은 플래그/안내문구 정리

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `기울기보정라이브틱()`(Task 1), `기울기보정틱대기ms`(Task 1), `기울기보정모드중`(Task 1), 새 버튼 의미(Task 2), 기존 `바닥보정()`/`출발준비()`/`lcd대기표시()`/`로봇초기화()`.
- Produces: 없음 — 이 태스크로 새 흐름이 완결됨.

- [ ] **Step 1: 메인 루프의 `!주행시작됨` 분기 교체**

다음 블록을 찾는다(보정요청 분기 + 출발 게이트 분기, 메인 `basic.forever` 안):

```typescript
    if (보정요청) {
        보정요청 = false
        바닥보정()
        basic.pause(루프대기ms)
        return
    }

    if (!주행시작됨) {
        if (출발요청 && 보정완료 && 각도상태 == "ANGLE OK") {
            로그("START PRESSED -> 출발준비")
            출발준비()
        } else {
            let 이전판단 = 마지막판단
            if (출발요청 && !보정완료) 마지막판단 = "PRESS A"
            if (출발요청 && 보정완료 && 각도상태 != "ANGLE OK") 마지막판단 = "ANGLE NG"
            if (출발요청 && 마지막판단 != 이전판단) 로그("CANNOT START: " + 마지막판단)
            출발요청 = false
            lcd대기표시(false)
        }
        basic.pause(루프대기ms)
        return
    }
```

아래로 바꾼다:

```typescript
    if (!주행시작됨) {
        if (출발요청) {
            출발요청 = false
            기울기보정모드중 = false
            로그("START PRESSED -> 출발준비")
            바닥보정()
            출발준비()
        } else if (기울기보정모드중) {
            기울기보정라이브틱()
            basic.pause(기울기보정틱대기ms)
            return
        } else {
            lcd대기표시(false)
        }
        basic.pause(루프대기ms)
        return
    }
```

- [ ] **Step 2: 죽은 `보정요청`/`보정완료` 플래그 제거**

다음 줄을 찾아 삭제한다:

```typescript
let 보정요청 = false
```

다음 줄도 찾아 삭제한다:

```typescript
let 보정완료 = false
```

`높이변경()` 함수 안에서 다음 두 줄을 찾아 삭제한다:

```typescript
    보정요청 = false
    주행시작됨 = false
    출발요청 = false
    보정완료 = false
```

위 4줄을 아래로 바꾼다(가운데 두 줄만 삭제, 나머지는 유지):

```typescript
    주행시작됨 = false
    출발요청 = false
```

`바닥보정()` 함수 끝부분에서 다음 줄을 찾아 삭제한다:

```typescript
    보정완료 = true
```

(이 줄이 있던 자리는 그냥 빈 줄 없이 다음 줄로 이어지면 된다 — 주변 줄인 `주행시작됨 = false` / `출발요청 = false`는 그대로 둔다.)

- [ ] **Step 3: `lcd대기표시()` 안내 문구 갱신**

다음 줄을 찾는다:

```typescript
    lcd문자(2, 8, 54, "A CAL  B START", 0x0000ff)
```

아래로 바꾼다:

```typescript
    lcd문자(2, 8, 54, "A START  B TILT CAL", 0x0000ff)
```

다음 줄을 찾는다:

```typescript
    lcd문자(5, 8, 168, 보정완료 ? 각도상태 : "PRESS A CAL", 보정완료 ? 각도색() : 0xff8800)
```

아래로 바꾼다:

```typescript
    lcd문자(5, 8, 168, 각도상태, 각도색())
```

- [ ] **Step 4: `로봇초기화()` 부팅 안내 문구 갱신**

다음 줄을 찾는다:

```typescript
    lcd문자(2, 8, 54, "A = CALIBRATE", 0x0000ff)
    lcd문자(3, 8, 92, "B = START", 0x008000)
```

아래로 바꾼다:

```typescript
    lcd문자(2, 8, 54, "A = START", 0x0000ff)
    lcd문자(3, 8, 92, "B = TILT CAL", 0x008000)
```

- [ ] **Step 5: 정적 검증 — 참조 누락 확인**

`보정요청`과 `보정완료`라는 단어가 파일 전체에 더 이상 남아있지 않은지 확인한다:

```bash
grep -n "보정요청\|보정완료" "AUTONOMOUS_WANDER_EXAMPLE.md"
```

Expected: 출력 없음(두 변수와 그 사용처가 모두 제거됨).

- [ ] **Step 6: 정적 검증 — 흐름 대조**

스펙 "새 동작 흐름" 3번과 코드를 대조: `출발요청`이 true면 항상 `바닥보정()` → `출발준비()`가 각도상태와 무관하게 호출됨(게이트 없음)을 확인. `출발요청`이 false이고 `기울기보정모드중`이 true면 `기울기보정라이브틱()`이 호출되고 `return`으로 루프를 빠짐(다른 주행 로직을 건너뜀)을 확인. 둘 다 false면 기존처럼 `lcd대기표시(false)`만 호출됨을 확인.

Expected: 3-way 분기가 스펙과 1:1 대응, 누락 없음.

- [ ] **Step 7: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Rewire start flow around live tilt calibration, drop dead start-gate flags"
```

---

### Task 4: 전체 코드 블록 tsc 정적 타입체크

**Files:**
- Read-only check against: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`
- Temporarily modify (then revert): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\tsconfig.json`
- Temporarily create (then delete): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\_wander_check.ts`

**Interfaces:**
- Consumes: Task 1~3에서 작성된 전체 코드.
- Produces: 없음(검증 전용, 코드 변경 없음).

`AUTONOMOUS_WANDER_EXAMPLE.md`는 마크다운이라 기본 tsc 대상이 아니다. 코드 블록만 추출해 임시 `.ts` 파일로 만들고 `tsconfig.json`에 한시적으로 추가해 컴파일을 확인한 뒤 원상복구한다(`PANEL_CALIBRATION_TEST.md`에 썼던 방식과 동일).

- [ ] **Step 1: 코드 블록 추출**

```bash
python3 -c "
import re
text = open('AUTONOMOUS_WANDER_EXAMPLE.md', encoding='utf-8').read()
blocks = re.findall(r'\`\`\`typescript\n(.*?)\n\`\`\`', text, re.S)
open('_wander_check.ts','w',encoding='utf-8').write(blocks[0])
print('written', len(blocks[0]), 'chars from', len(blocks), 'blocks')
"
```

Expected: `written N chars from M blocks` 출력(N>0). 본체 코드가 첫 번째 ```typescript 블록이어야 한다 — 만약 `M`이 1보다 크고 `blocks[0]`이 본체가 아니라면(예: 문서 안에 다른 typescript 예시 블록이 먼저 나오는 경우), 올바른 인덱스를 출력해서 직접 확인하고 그 인덱스를 쓴다.

- [ ] **Step 2: tsconfig.json 백업 후 임시 수정**

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

- [ ] **Step 3: tsc 실행**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...` 경고 1줄만 출력되고, `_wander_check.ts` 관련 타입 에러(TS2304/TS2339/TS2552 등)는 0건. 에러가 있다면(예: Task 1~3에서 변수명을 잘못 옮겼거나 빠뜨린 경우) 해당 태스크의 코드로 돌아가 수정한 뒤 이 Step부터 다시 실행한다.

- [ ] **Step 4: 원상복구**

```bash
mv tsconfig.json.bak tsconfig.json
rm -f _wander_check.ts
git status --short tsconfig.json _wander_check.ts
```

Expected: 마지막 `git status --short` 출력이 비어 있음.

- [ ] **Step 5: 하드웨어 검증 체크리스트 (사람이 실행)**

이 프로젝트에는 자동화 테스트 러너가 없으므로, 아래 체크리스트는 실제 로봇으로 확인한다.

- [ ] 부팅 직후 LCD에 "A = START" / "B = TILT CAL" 안내가 보이는가.
- [ ] B를 누르면 LCD가 "TILT CAL LIVE" 화면으로 바뀌고 Y5/Y6/Y7 + 각도상태가 주기적으로 갱신되는가(약 0.5~1초 간격 — 5회 반복 raw 읍기 시간 + `기울기보정틱대기ms`).
- [ ] 라이브 모드 중 라이더 기울기를 손으로 바꾸면 Y6/Y7 값과 각도상태 문구가 그에 맞게 바뀌는가.
- [ ] 라이브 모드 중 AB를 누르면 높이가 바뀌고도 라이브 화면이 계속 갱신되는가(다음 틱부터 새 높이 기준으로).
- [ ] 라이브 모드 중이든 대기 화면이든 A를 누르면 3·2·1 카운트다운 → 보정 완료 아이콘 → 주행 시작까지 항상 이어지는가(각도상태와 무관하게).
- [ ] A로 시작한 직후 장애물 회피가 기존과 동일하게 동작하는가(`기준값` 베이스라인이 정상적으로 설정됨).

- [ ] **Step 6: Commit**

이 태스크는 검증만 수행하고 코드를 변경하지 않으므로(Step 5의 하드웨어 체크는 결과를 기록할 코드 변경이 없음) 커밋할 대상이 없다. `git status --short`가 비어 있음을 확인하는 것으로 태스크를 마친다.
