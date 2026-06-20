# 라이더 기울기(tilt) 실시간 보정 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-06-20-lidar-tilt-calibration-mode-design.md`에 정의된, 로고 터치로 시작해 10cm 자동 후진 후 라이더 최하단 행(Y7) raw 값을 LCD에 실시간으로 보여주는 기울기 보정 모드를 `PANEL_CALIBRATION_TEST.md`에 추가한다.

**Architecture:** 기존 `PANEL_CALIBRATION_TEST.md`의 단일 TypeScript 코드 블록에 새 상수/함수/이벤트 핸들러를 추가한다(새 파일 없음). 새로 추가되는 것은: 상수 6개, LCD 표시 헬퍼 1개(`lcd기울기보정표시`), 측정+표시 함수 1개(`기울기보정틱`), 시작 함수 1개(`기울기보정시작`), 로고 터치 이벤트 핸들러 1개. 기존 헬퍼(`정렬삽입`, `중앙값`, `지점읽기`, `lcd문자`, `lcd대기표시`)와 기존 전역 변수(`시작됨`, `중단요청`)를 그대로 재사용하고, 기존 A 버튼 중단 핸들러도 수정 없이 그대로 이 모드의 중단에 쓰인다. 이 프로젝트에는 자동화 테스트 러너가 없으므로(MakeCode/PXT 하드웨어 펌웨어), 각 태스크의 "테스트"는 코드 정적 점검(타입체크, 스펙 대조)과 최종 태스크의 실제 하드웨어 체크리스트로 구성된다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit, `maqueenPlusV2` 확장(`pidControlDistance`, `pidControlStop`), `matrixLidarDistance` 확장(8x8 ToF 그리드), micro:bit core `input.onLogoEvent`/`TouchButtonEvent` (로고 터치센서, micro:bit V2 전용).

## Global Constraints

- 메인 자율주행 코드(`AUTONOMOUS_WANDER_EXAMPLE.md`)는 수정하지 않는다.
- 이 모드는 라디오 전송을 하지 않는다 — LCD만 갱신한다.
- 이 모드는 자동 OK/NG 판정을 하지 않는다 — `DIFF`/`SPREAD` 숫자만 보여주고 사람이 판단한다.
- 최하단 행은 8x8 그리드의 y=7 (`지점읽기(x, 7)`, x=0..7)이다.
- 목표거리는 `Math.round(Math.sqrt(보정후진거리mm² + 기본라이더높이mm²))`로 계산하며 하드코딩 리터럴을 쓰지 않는다(`기본라이더높이mm`가 바뀌면 같이 재계산되어야 함).
- 라이브 루프 갱신 주기는 `기울기갱신지연ms`(150ms) 상수를 쓴다.
- 새 함수는 기존 네이밍 컨벤션(한글 함수명/변수명, PascalCase 아님)을 따른다.

---

### Task 1: 전역 상수 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: 기존 전역 상수 `기본라이더높이mm`(140, 이미 정의됨).
- Produces: 전역 상수 `보정후진거리cm`, `보정후진거리mm`, `거리허용오차mm`, `컬럼편차참고mm`, `목표거리mm`, `기울기갱신지연ms` — Task 3(`기울기보정틱`), Task 4(`기울기보정시작`)가 사용.

- [ ] **Step 1: 상수 블록에 추가**

현재 코드 블록의 다음 부분(`const 회전테스트스텝도 = 5` 바로 다음, `radio.setGroup(라디오그룹)` 바로 전):

```typescript
const 회전테스트범위도 = 45
const 회전테스트스텝도 = 5

radio.setGroup(라디오그룹)
```

을 아래로 바꾼다(빈 줄 포함, `radio.setGroup` 줄은 그대로 유지):

```typescript
const 회전테스트범위도 = 45
const 회전테스트스텝도 = 5
const 보정후진거리cm = 10
const 보정후진거리mm = 100
const 거리허용오차mm = 15
const 컬럼편차참고mm = 10
const 목표거리mm = Math.round(Math.sqrt(보정후진거리mm * 보정후진거리mm + 기본라이더높이mm * 기본라이더높이mm))
const 기울기갱신지연ms = 150

radio.setGroup(라디오그룹)
```

- [ ] **Step 2: 수식 검증**

`보정후진거리mm = 100`, `기본라이더높이mm = 140`이므로 `목표거리mm = Math.round(Math.sqrt(100*100 + 140*140)) = Math.round(Math.sqrt(10000+19600)) = Math.round(Math.sqrt(29600)) = Math.round(172.04...) = 172`임을 계산기로 확인한다.

Expected: `목표거리mm`가 172로 계산됨(상수 리터럴이 아니라 수식으로 작성되어 있어 `기본라이더높이mm` 변경 시 자동 반영됨).

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add constants for lidar tilt calibration mode"
```

---

### Task 2: LCD 표시 헬퍼 `lcd기울기보정표시` 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: `lcd문자(번호, x, y, 내용, 색)` (기존 헬퍼).
- Produces: `lcd기울기보정표시(값들: number[], 차이mm: number, 편차mm: number): void` — Task 3(`기울기보정틱`)이 호출.

- [ ] **Step 1: 함수 작성**

기존 `lcd요약표시` 함수 바로 다음(`그리드3회읍기` 함수 바로 전)에 추가:

```typescript
function lcd기울기보정표시(값들: number[], 차이mm: number, 편차mm: number): void {
    let 값줄 = ""
    for (let i = 0; i < 값들.length; i++) {
        if (i > 0) 값줄 += " "
        값줄 += 값들[i]
    }
    let 차이부호 = 차이mm > 0 ? "+" : ""
    lcd문자(1, 8, 16, "TILT CAL", 0x000000)
    lcd문자(2, 8, 54, 값줄, 0x0000ff)
    lcd문자(3, 8, 92, "DIFF " + 차이부호 + 차이mm + "mm", 0x008000)
    lcd문자(4, 8, 130, "SPREAD " + 편차mm + "mm", 0xaa00aa)
    lcd문자(5, 8, 168, "A=STOP", 0x000000)
}
```

`차이부호`는 `차이mm > 0`일 때만 `"+"`를 붙인다 — 음수는 `차이mm` 자체에 `-`가 포함되어 있고, 0은 부호 없이 `0mm`로 보여야 하므로 `>=`가 아니라 `>`를 쓴다(`>=`였다면 0도 `"+0mm"`이 되어 0이 양수처럼 보이는 오류가 생긴다).

- [ ] **Step 2: 의사실행 트레이스로 정적 검증**

`lcd기울기보정표시([118,120,119,121,117,119,120,118], 12, 4)`를 트레이스: `값줄 = "118 120 119 121 117 119 120 118"`(8개 값, 공백 구분), `차이부호 = "+"`(12 > 0), 3행 = `"DIFF +12mm"`.
`lcd기울기보정표시([...], -8, 3)`을 트레이스: `차이부호 = ""`(-8 > 0이 거짓), 3행 = `"DIFF " + "" + (-8) + "mm"` = `"DIFF -8mm"`(부호 중복 없음).
`lcd기울기보정표시([...], 0, 0)`을 트레이스: `차이부호 = ""`(0 > 0이 거짓), 3행 = `"DIFF 0mm"`(양수 기호 없음).

Expected: 양수/음수/0 모든 경우에 부호가 정확히 한 번만(필요할 때만) 표시됨.

- [ ] **Step 3: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add LCD display helper for tilt calibration readout"
```

---

### Task 3: 측정 함수 `기울기보정틱` 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: `지점읽기(x, y)`, `정렬삽입`, `중앙값` (기존 헬퍼), `lcd기울기보정표시` (Task 2), 전역 상수 `목표거리mm` (Task 1).
- Produces: `기울기보정틱(): void` — Task 4(`기울기보정시작`)가 루프에서 반복 호출.

- [ ] **Step 1: 함수 작성**

`lcd기울기보정표시` 함수 바로 다음에 추가:

```typescript
function 기울기보정틱(): void {
    let 유효목록: number[] = []
    let 값들: number[] = []
    for (let x = 0; x < 8; x++) {
        let 값 = 지점읽기(x, 7)
        값들.push(값)
        if (값 != 0) 정렬삽입(유효목록, 값)
    }

    let 중간값 = 중앙값(유효목록)
    let 편차mm = 유효목록.length >= 2 ? (유효목록[유효목록.length - 1] - 유효목록[0]) : 0
    let 차이mm = 중간값 - 목표거리mm

    lcd기울기보정표시(값들, 차이mm, 편차mm)
}
```

- [ ] **Step 2: 의사실행 트레이스로 정적 검증 — 정상 케이스**

8개 컬럼이 모두 `[170, 172, 171, 173, 169, 171, 172, 170]`이라고 가정. `유효목록`은 `정렬삽입`을 거쳐 오름차순 정렬: `[169,170,170,171,171,172,172,173]`(8개). `중앙값`은 `목록[Math.idiv(8,2)] = 목록[4] = 171`. `편차mm = 유효목록[7] - 유효목록[0] = 173 - 169 = 4`. `차이mm = 171 - 172 = -1`. `lcd기울기보정표시(값들, -1, 4)` 호출 시 3행은 `"DIFF -1mm"`(Task 2의 수정된 버전 기준, 음수는 부호 중복 없음).

Expected: median/편차/차이 계산이 위 손계산과 일치.

- [ ] **Step 3: 의사실행 트레이스로 정적 검증 — 전부 0(미인식) 케이스**

8개 컬럼이 모두 `0`이면 `유효목록 = []`(빈 배열, `값 != 0` 조건에서 전부 걸러짐). `중앙값([])`은 기존 구현상 `목록.length == 0`이므로 `0`을 반환. `편차mm`은 `유효목록.length >= 2`가 거짓(`0 >= 2` 거짓)이므로 `0`. `차이mm = 0 - 172 = -172`. 에러 없이 `"DIFF -172mm"`, `"SPREAD 0mm"`로 표시되어 스펙의 "0이 나온다는 사실 자체가 유효한 피드백" 요구를 만족함을 확인.

Expected: 0 값 8개여도 예외 없이 계산되고 표시됨.

- [ ] **Step 4: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add per-tick bottom-row measurement for tilt calibration"
```

---

### Task 4: 시작 함수 `기울기보정시작`과 로고 터치 핸들러 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: `기울기보정틱` (Task 3), `lcd대기표시` (기존 헬퍼), 전역 `시작됨`/`중단요청` (기존), 전역 상수 `보정후진거리cm`/`기울기갱신지연ms` (Task 1), `maqueenPlusV2.pidControlDistance`, `maqueenPlusV2.SpeedDirection.SpeedCCW`, `maqueenPlusV2.MyInterruption.NotAllowed`, micro:bit core `input.onLogoEvent`, `TouchButtonEvent.Pressed`.
- Produces: `기울기보정시작(): void`, `input.onLogoEvent(...)` 핸들러 — 이 태스크로 모드가 완결됨. 기존 `input.onButtonPressed(Button.A, ...)` 핸들러를 수정 없이 그대로 재사용(이미 `시작됨`/`중단요청`/`pidControlStop()`을 처리하므로 이 모드의 A 버튼 중단도 자동으로 동작함).

- [ ] **Step 1: `기울기보정시작` 함수 작성**

`회전테스트시작` 함수가 끝나는 지점(`}` 다음, `input.onButtonPressed(Button.AB, ...)` 블록 바로 전)에 추가:

```typescript
function 기울기보정시작(): void {
    if (시작됨) return
    시작됨 = true
    중단요청 = false

    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 보정후진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)

    while (!중단요청) {
        기울기보정틱()
        basic.pause(기울기갱신지연ms)
    }

    lcd대기표시()
    시작됨 = false
}
```

- [ ] **Step 2: 로고 터치 핸들러 추가**

기존 `input.onButtonPressed(Button.AB, ...)` 블록 바로 다음(`input.onButtonPressed(Button.B, ...)` 블록 전)에 추가:

```typescript
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    기울기보정시작()
})
```

- [ ] **Step 3: 흐름 정적 검증**

설계서 "동작 흐름" 1~4번과 코드를 순서대로 대조: (1) 로고 터치 트리거 — `input.onLogoEvent(TouchButtonEvent.Pressed, ...)`가 `기울기보정시작()`을 호출함을 확인. (2) 다른 모드 진행 중이면 무시 — `기울기보정시작` 첫 줄 `if (시작됨) return`이 다른 모드(`각도체크시작`/`패널테스트시작`/`회전테스트시작`)가 이미 `시작됨 = true`로 설정해 둔 상태에서 즉시 반환됨을 확인(모든 시작 함수가 공통으로 `시작됨` 전역을 공유하므로 상호 배타적임). (3) 10cm 후진 — `pidControlDistance(SpeedCCW, 보정후진거리cm, NotAllowed)`가 블로킹 호출이라 후진이 끝난 뒤에야 `while` 루프로 진입함을 확인(다른 PID 호출과 동일 패턴). (4) A 버튼 중단 — 기존 `input.onButtonPressed(Button.A, ...)` 핸들러가 `시작됨`이 true인 동안 `중단요청 = true`와 `pidControlStop()`을 호출하고, `while (!중단요청)` 루프가 다음 틱 검사에서 빠져나와 `lcd대기표시()` 후 `시작됨 = false`로 정리됨을 확인. `pidControlStop()`은 라이브 루프 중에는 실제로 움직이는 PID 동작이 없으므로 동작 없음(no-op)이지만 호출해도 에러 없이 안전함을 확인(기존 `maqueenPlusV2.pidControlStop()` 시그니처가 인자 없는 함수임을 `maqueenPlusV3.ts:1097-1102`에서 재확인).

Expected: 4단계 모두 코드에서 1:1로 확인됨, 누락 없음.

- [ ] **Step 4: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Add tilt calibration start function and logo touch trigger"
```

---

### Task 5: 전체 코드 블록 정적 타입체크 (tsc)

**Files:**
- Read-only check against: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`
- Temporarily modify (then revert): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\tsconfig.json`
- Temporarily create (then delete): `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\_panel_check.ts`

**Interfaces:**
- Consumes: Task 1~4에서 작성된 전체 코드.
- Produces: 없음 (검증 전용 태스크, 코드 변경 없음).

이 프로젝트는 `tsconfig.json`의 `"files"` 배열로 컴파일 대상을 한정해야 IDE/tsc가 micro:bit 전용 타입(`matrixLidarDistance`, `maqueenPlusV2`, `TouchButtonEvent` 등)을 인식한다. `PANEL_CALIBRATION_TEST.md`는 마크다운이라 기본적으로 tsc 대상이 아니므로, 코드 블록만 추출해 임시 `.ts` 파일로 만들고 `tsconfig.json`에 한시적으로 추가해 컴파일을 확인한 뒤 원상복구한다.

- [ ] **Step 1: 코드 블록 추출**

```bash
python3 -c "
import re
text = open('PANEL_CALIBRATION_TEST.md', encoding='utf-8').read()
blocks = re.findall(r'\`\`\`typescript\n(.*?)\n\`\`\`', text, re.S)
open('_panel_check.ts','w',encoding='utf-8').write(blocks[0])
print('written', len(blocks[0]), 'chars from', len(blocks), 'blocks')
"
```

Expected: `written N chars from 2 blocks` 출력(N은 첫 번째 코드 블록 길이, 본체 코드 블록이어야 함 — 수신기 코드 블록은 2번째라 추출되지 않음).

- [ ] **Step 2: tsconfig.json 백업 후 임시 수정**

```bash
cp tsconfig.json tsconfig.json.bak
python3 -c "
import json
c = json.load(open('tsconfig.json', encoding='utf-8'))
c['files'].insert(0, '_panel_check.ts')
c['files'].insert(1, 'pxt_modules/matrixLidarDistance/matrixLidarDistance.ts')
json.dump(c, open('tsconfig.json','w', encoding='utf-8'), indent=4)
"
```

- [ ] **Step 3: tsc 실행**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...` 경고 1줄만 출력되고, `_panel_check.ts` 관련 타입 에러(TS2304/TS2339 등)는 0건. 만약 타입 에러가 있다면(예: `TouchButtonEvent` 미인식, `maqueenPlusV2.pidControlDistance` 인자 타입 불일치 등) Task 1~4의 해당 코드로 돌아가 수정한 뒤 이 Step부터 다시 실행한다.

- [ ] **Step 4: 원상복구**

```bash
mv tsconfig.json.bak tsconfig.json
rm -f _panel_check.ts
git status --short tsconfig.json _panel_check.ts
```

Expected: 마지막 `git status --short` 출력이 비어 있음(두 파일 모두 원래 상태로 복구되어 git diff 없음).

- [ ] **Step 5: Commit**

이 태스크는 검증만 수행하고 파일을 변경하지 않으므로 커밋할 대상이 없다. `git status --short`가 비어 있음을 확인하는 것으로 태스크를 마친다.

---

### Task 6: 문서 섹션 갱신 (사용 방법, 로그 형식, 준비물, 체크리스트) + 최종 Commit

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\PANEL_CALIBRATION_TEST.md`

**Interfaces:**
- Consumes: Task 1~5에서 정의된 모든 함수/상수.
- Produces: 없음 (문서 마무리).

- [ ] **Step 1: "이 스크립트는 계산을 하지 않는다" 섹션에 예외 추가**

다음 문단(현재 파일의 7~22번째 줄 부근, "마이크로비트는 그냥 매 스텝..." 문단 바로 다음)을 찾는다:

```
마이크로비트는 그냥 매 스텝 8개 컬럼의 raw 라이다 값 + 초음파 값을
명령거리와 함께 한 줄로 보내고, 각도 체크 단계에서는 raw 샘플 리스트만
보낸다. 이 로그를 그대로 전달하면 그 다음 분석/계산은 받는 쪽에서
한다.
```

바로 다음에 새 문단을 추가한다:

```
**예외**: 아래 "라이더 기울기 실시간 보정" 모드(로고 터치)는 위
원칙과 달리 `DIFF`(목표거리와의 차이)와 `SPREAD`(컬럼 간 편차) 두
숫자를 계산해서 LCD에 보여준다. 이건 무선 왕복 없이 그 자리에서 손으로
기울기를 조절하며 즉시 피드백을 받기 위한 것이지 자동 판정이 아니다 —
OK/NG 표시는 하지 않고 숫자만 보여주며, "맞다/틀리다"는 사람이 직접
판단한다. 두 숫자 모두 센서 장착 높이와 후진거리를 기반으로 한
근사값이라 그렇다.
```

- [ ] **Step 2: "사용 방법" 목록에 단계 추가**

현재 8번 항목(`8. 콘솔에 찍힌 로그를 그대로 복사해서 분석을 요청한다.`) 바로 다음에 9번 항목을 추가한다:

```
9. 라이더 기울기를 손으로 조절하고 싶다면, 로봇을 패널(또는 임의의
   평평한 면) 앞에 두고 **로고를 터치**한다. 로봇이 자동으로 10cm
   후진한 뒤 LCD에 최하단 행 raw 값과 `DIFF`/`SPREAD` 숫자가 실시간으로
   갱신된다. 기울기를 조절하며 두 숫자를 참고하고, 끝나면 **A 버튼**을
   눌러 종료한다(다른 모드가 진행 중일 때는 로고 터치가 무시된다).
```

- [ ] **Step 3: "로그 형식 설명" 섹션에 LCD 형식 설명 추가**

"로그 형식 설명 (raw 데이터만, 판단 없음)" 섹션의 마지막 항목(`CALTEST BOOT`/`CALTEST START`/... 줄) 바로 다음에 새 항목을 추가한다:

```
- **라이더 기울기 보정 LCD (라디오 전송 없음)** — 로고 터치 후 LCD에
  `TILT CAL` / 8개 raw 값(공백 구분) / `DIFF ±Nmm`(최하단 행 median과
  목표거리 약 172mm의 차이, 부호로 방향 힌트) / `SPREAD Nmm`(8개 컬럼
  중 유효값의 최대-최소 편차) / `A=STOP`이 150ms 주기로 갱신된다. 라디오
  로그에는 나타나지 않는다 — 이 모드는 로컬 LCD 전용이다.
```

- [ ] **Step 4: "실행 전 준비물"에 로고 터치 안내 추가**

"수신기는 위 '무선 디버그 수신기' 코드를..." 항목 바로 다음에 새 항목을 추가한다:

```
- 라이더 기울기를 손으로 맞추고 싶다면 로고를 터치하면 된다(micro:bit
  V2 로고 터치센서 필요). 10cm 후진 후 LCD의 `DIFF`/`SPREAD` 값을 참고
  기준으로 삼되, 두 값 모두 근사값이므로 대략 `DIFF`가 0에 가깝고
  `SPREAD`가 한 자리 수(`거리허용오차mm`=15, `컬럼편차참고mm`=10
  안쪽)면 충분하다고 보면 된다 — 정확한 기준값을 정해주는 게 아니라
  참고용 숫자다.
```

- [ ] **Step 5: "실행 후 하드웨어 검증 체크리스트"에 항목 추가**

체크리스트의 마지막 항목(`콘솔 전체 로그(...)를 그대로 복사해...`) 바로 다음에 새 항목들을 추가한다:

```
- [ ] **로고를 터치**하면 로봇이 정확히 10cm 후진하는가(줄자로 대조).
      이때 다른 모드(B/AB)가 진행 중이면 로고 터치가 무시되는가.
- [ ] 후진 후 LCD에 `TILT CAL`과 8개 raw 값, `DIFF ±Nmm`, `SPREAD Nmm`,
      `A=STOP`이 약 150ms 주기로 끊김 없이 갱신되는가.
- [ ] 라이더 기울기를 손으로 바꿔가며 `DIFF`가 0에 가까워지거나
      멀어지는 방향으로, `SPREAD`가 커지거나 작아지는 방향으로 눈에
      보이게 변하는가(평평하게 모서리를 볼 때 `SPREAD`가 작아지는지
      확인).
- [ ] **A 버튼**을 누르면 즉시 LCD가 대기 화면으로 돌아가는가(라디오
      콘솔에는 아무 로그도 남지 않아야 정상 — 이 모드는 LCD 전용).
```

- [ ] **Step 6: Commit**

```bash
git add "PANEL_CALIBRATION_TEST.md"
git commit -m "Document lidar tilt calibration mode usage and verification steps"
```
