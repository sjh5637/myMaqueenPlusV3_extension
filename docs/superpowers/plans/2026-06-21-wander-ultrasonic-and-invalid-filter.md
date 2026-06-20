# 라이다 무효값(4000) 필터 + 전방 초음파 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-06-21-wander-ultrasonic-and-invalid-filter-design.md`에 정의된, 라이다 무효값(4000) 필터링과 전방 초음파 비상정지 보조 통합을 `AUTONOMOUS_WANDER_EXAMPLE.md`에 구현한다.

**Architecture:** 두 가지 독립 변경을 순서대로 적용한다. (1) 라이다 raw 값 진입점 두 곳(`거리읽기`/`지점읽기`)에 `유효거리()` 정규화를 끼워 4000(이상)을 0으로 바꾼다 — 이미 모든 다운스트림이 0을 무효로 처리하므로 개별 함수는 손대지 않는다. (2) 전방 초음파(`maqueenPlusV2.readUltrasonic`)를 읽는 `초음파읍기()`와 라이다 정면값/초음파값 중 보수적인 쪽을 고르는 `정면최소거리()`를 추가하고, `감시샘플읽기()`가 매 틱 초음파를 갱신하게 하고, `정면위험()`의 마지막 거리 비교 한 줄만 `정면최소거리()`로 바꾼다. LCD에 초음파 값을 한 칸 추가한다. 이 프로젝트는 자동화 테스트 러너가 없으므로(MakeCode/PXT 하드웨어 펌웨어), 각 태스크의 "테스트"는 코드 정적 점검(tsc 타입체크, 의사실행 트레이스, grep)과 최종 태스크의 실제 하드웨어 체크리스트로 구성된다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit, `maqueenPlusV2`(`readUltrasonic`)/`matrixLidarDistance`(`matrixPointOutput`) 확장, `DigitalPin` core enum.

## Global Constraints

- 메인 자율주행 알고리즘 본체(전진/회피/탐색 방향 결정)는 건드리지 않는다 — 이번 변경은 센서 읽기 정규화와 정면 비상정지 한 줄, LCD 표시 한 줄에만 한정한다.
- 4000 필터는 `>=`(`==`가 아님)로 한다: `원시값 >= 라이다무효값mm ? 0 : 원시값` (`라이다무효값mm = 4000`).
- 4000 필터는 `거리읽기`/`지점읽기` 두 진입점에서만 적용한다 — 다운스트림 함수(`트인거리값`, `거리색`, `막힌샘플인가`, `구역최소`, `높이최소`, `바닥보정` 표본 수집, `각도진단` 입력)는 수정하지 않는다(이미 0을 무효로 처리하므로).
- 초음파는 정면 비상정지(`정면위험()`의 집계 거리 비교)에만 쓴다 — 좌/우 회전 방향 결정(`구역점수`/`탐색점수`)에는 쓰지 않는다.
- `초음파읍기()`는 cm를 mm로 변환(`cm * 10`)하고, `cm <= 0`이면 0(무효)을 반환한다. `초음파사용 == false`면 0을 반환한다.
- `정면최소거리()`는 라이다 정면 구역 최소(`구역최소(1)`)와 `최근초음파mm` 중 둘 다 유효(>0)한 값들의 `Math.min`을 반환하고, 둘 다 무효면 0을 반환한다(기존 "0=무효" 관례 유지).
- `초음파TRIG = DigitalPin.P13`, `초음파ECHO = DigitalPin.P14`.

---

### Task 1: 라이다 무효값(4000) 필터 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `matrixLidarDistance.matrixPointOutput(라이다주소, x, y)`, 전역 `라이다주소`/`샘플X`/`샘플Y`(기존).
- Produces: 전역 상수 `라이다무효값mm`, 함수 `유효거리(원시값: number): number` — 이후 모든 라이다 읽기가 거치는 정규화. `거리읽기`/`지점읽기`의 반환값이 이제 4000 이상을 0으로 바꿔 내보낸다(Task 2의 `구역최소(1)`도 이 정규화의 혜택을 받음).

- [ ] **Step 1: `라이다무효값mm` 상수 추가**

`AUTONOMOUS_WANDER_EXAMPLE.md`에서 다음 줄을 찾는다:

```typescript
const 긴급정지거리mm = 280
```

그 바로 다음 줄에 새 상수를 추가해 아래처럼 바꾼다:

```typescript
const 긴급정지거리mm = 280
const 라이다무효값mm = 4000
```

- [ ] **Step 2: `유효거리()` 헬퍼 추가 + `거리읽기()` 정규화**

다음 코드를 찾는다:

```typescript
function 거리읽기(index: number): number {
    return matrixLidarDistance.matrixPointOutput(라이다주소, 샘플X[index], 샘플Y[index])
}
```

아래로 바꾼다(`유효거리()`를 바로 앞에 추가하고, `거리읽기()`가 그걸 통과하도록):

```typescript
function 유효거리(원시값: number): number {
    return 원시값 >= 라이다무효값mm ? 0 : 원시값
}

function 거리읽기(index: number): number {
    return 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, 샘플X[index], 샘플Y[index]))
}
```

- [ ] **Step 3: `지점읽기()` 정규화**

다음 코드를 찾는다:

```typescript
function 지점읽기(x: number, y: number): number {
    return matrixLidarDistance.matrixPointOutput(라이다주소, x, y)
}
```

아래로 바꾼다:

```typescript
function 지점읽기(x: number, y: number): number {
    return 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, x, y))
}
```

- [ ] **Step 4: 의사실행 트레이스로 정적 검증**

`유효거리(4000)` → `4000 >= 4000` 참 → `0` 반환. `유효거리(4001)` → 참 → `0`. `유효거리(280)` → `280 >= 4000` 거짓 → `280` 그대로. `유효거리(0)` → 거짓 → `0`(원래도 0이라 변화 없음). 즉 4000 이상만 0으로 바뀌고 정상 거리값은 그대로 통과함을 확인한다. 그리고 `거리읽기`/`지점읽기` 외에 `matrixPointOutput`을 직접 호출하는 곳이 더 없는지 확인한다:

```bash
grep -n "matrixPointOutput" "AUTONOMOUS_WANDER_EXAMPLE.md"
```

Expected: `matrixPointOutput` 호출이 정확히 `거리읽기`와 `지점읽기` 두 함수 안에서만 나타남(다른 직접 호출 없음). 4000 이상 → 0, 그 외 → 그대로.

- [ ] **Step 5: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Filter lidar no-detection sentinel (>=4000) to 0 at read entry points"
```

---

### Task 2: 전방 초음파 상태/헬퍼 추가

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `maqueenPlusV2.readUltrasonic(trig, echo)`, `구역최소(구역: number): number`(기존, 정면=1), `Math.min`.
- Produces: 전역 상수 `초음파TRIG`/`초음파ECHO`, 전역 변수 `초음파사용: boolean`/`최근초음파mm: number`, 함수 `초음파읍기(): number`, 함수 `정면최소거리(): number` — Task 3가 `감시샘플읽기()`/`정면위험()`/`lcd표시()`에서 사용.

- [ ] **Step 1: 전역 변수 추가**

다음 코드를 찾는다:

```typescript
let LCD맵사용 = true
let LCD맵이전색: number[] = []
```

`LCD맵사용` 줄 바로 앞에 초음파 상태 변수 2개를 추가해 아래처럼 바꾼다:

```typescript
let 초음파사용 = true
let 최근초음파mm = 0
let LCD맵사용 = true
let LCD맵이전색: number[] = []
```

- [ ] **Step 2: 전역 상수 추가**

다음 코드를 찾는다:

```typescript
const 라디오그룹 = 77
```

그 바로 다음 줄에 초음파 핀 상수 2개를 추가해 아래처럼 바꾼다:

```typescript
const 라디오그룹 = 77
const 초음파TRIG = DigitalPin.P13
const 초음파ECHO = DigitalPin.P14
```

- [ ] **Step 3: `초음파읍기()`와 `정면최소거리()` 함수 추가**

`구역최소()` 함수가 끝나는 지점 바로 뒤에 두 함수를 추가한다. 다음 코드를 찾는다:

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

function 초음파읍기(): number {
    if (!초음파사용) return 0
    let cm = maqueenPlusV2.readUltrasonic(초음파TRIG, 초음파ECHO)
    return cm <= 0 ? 0 : cm * 10
}

function 정면최소거리(): number {
    let 라이다값 = 구역최소(1)
    let a = 라이다값 > 0 ? 라이다값 : 9999
    let b = 최근초음파mm > 0 ? 최근초음파mm : 9999
    let 결과 = Math.min(a, b)
    return 결과 == 9999 ? 0 : 결과
}
```

- [ ] **Step 4: 의사실행 트레이스로 정적 검증**

`초음파읍기()`: `초음파사용=false`면 `0`. `readUltrasonic`이 `0`(에코 실패) 반환 → `cm <= 0` → `0`. `25`(cm) 반환 → `25 * 10 = 250`(mm). `정면최소거리()`: 라이다=200, 초음파=250 → `a=200, b=250` → `Math.min=200` → `200`(라이다가 더 가까움). 라이다=0(무효), 초음파=250 → `a=9999, b=250` → `250`. 라이다=200, 초음파=0(무효) → `a=200, b=9999` → `200`. 둘 다 0 → `a=9999, b=9999` → `9999 == 9999` → `0`(무효). 즉 둘 중 유효한 더 가까운 값을 고르고, 둘 다 무효면 0을 반환함을 확인한다.

Expected: 보수적(더 가까운) 값 선택 + 둘 다 무효 시 0 반환이 위 트레이스대로 동작.

- [ ] **Step 5: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Add front ultrasonic read helper and lidar/ultrasonic front-min fusion"
```

---

### Task 3: 초음파를 비상정지·표시에 연결

**Files:**
- Modify: `D:\microbit\9. ExtensionsModule\pxt-DFRobot_MaqueenPlus_v20-master\AUTONOMOUS_WANDER_EXAMPLE.md`

**Interfaces:**
- Consumes: `초음파읍기()`/`정면최소거리()`(Task 2), 전역 `최근초음파mm`(Task 2), 기존 `감시샘플읽기`/`정면위험`/`lcd표시`/`구역최소`.
- Produces: 없음 — 이 태스크로 초음파가 실제 동작에 반영됨.

- [ ] **Step 1: `감시샘플읽기()`가 매 틱 초음파를 갱신하게 한다**

다음 코드를 찾는다:

```typescript
function 감시샘플읽기(): void {
    if (감시모드 == "FAST") 빠른샘플읽기()
    else 전체샘플읽기()
}
```

아래로 바꾼다:

```typescript
function 감시샘플읽기(): void {
    if (감시모드 == "FAST") 빠른샘플읽기()
    else 전체샘플읽기()
    최근초음파mm = 초음파읍기()
}
```

- [ ] **Step 2: `정면위험()`이 정면 거리 비교에 초음파를 포함하게 한다**

다음 코드를 찾는다:

```typescript
    if (위험연속 >= 막힘연속필요) return true
    let 정면최소 = 구역최소(1)
    return 정면최소 != 0 && 정면최소 < 긴급정지거리mm
}
```

아래로 바꾼다(`구역최소(1)` → `정면최소거리()`, 나머지 두 줄은 그대로):

```typescript
    if (위험연속 >= 막힘연속필요) return true
    let 정면최소 = 정면최소거리()
    return 정면최소 != 0 && 정면최소 < 긴급정지거리mm
}
```

- [ ] **Step 3: LCD에 초음파 값 표시 추가**

다음 코드를 찾는다:

```typescript
    lcd문자(4, 140, 54, "L" + 구역최소(0) + " F" + 구역최소(1) + " R" + 구역최소(2), 0xaa00aa)
```

아래로 바꾼다(`" U" + 최근초음파mm` 추가):

```typescript
    lcd문자(4, 140, 54, "L" + 구역최소(0) + " F" + 구역최소(1) + " R" + 구역최소(2) + " U" + 최근초음파mm, 0xaa00aa)
```

- [ ] **Step 4: 흐름 정적 검증**

스펙(`2026-06-21-wander-ultrasonic-and-invalid-filter-design.md`)의 "기존 함수 수정"/"LCD 표시 추가"와 대조한다: (1) `감시샘플읽기()`가 FAST/CHECK 양쪽 경로 후 항상 `최근초음파mm`을 갱신함을 확인(라이다 샘플 읽은 직후 1회). (2) `정면위험()`의 마지막 집계 비교만 `정면최소거리()`로 바뀌고, 그 위의 `샘플긴급인가`/`구역막힘수(1)` 기반 점진 판단(라이다 개별 포인트)은 그대로임을 확인. (3) `lcd표시()` 4번째 줄에만 `" U" + 최근초음파mm`이 추가되고 다른 줄은 안 바뀜을 확인.

Expected: 세 수정이 스펙과 1:1 대응, 초음파가 정면 비상정지·표시에만 반영되고 방향 결정 로직(`구역점수`/`탐색점수`)에는 안 들어감.

- [ ] **Step 5: Commit**

```bash
git add "AUTONOMOUS_WANDER_EXAMPLE.md"
git commit -m "Wire ultrasonic into per-tick update, front emergency-stop check, and LCD"
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

`AUTONOMOUS_WANDER_EXAMPLE.md`는 마크다운이라 기본 tsc 대상이 아니다. 코드 블록만 추출해 임시 `.ts` 파일로 만들고 `tsconfig.json`에 한시적으로 추가해 컴파일을 확인한 뒤 원상복구한다.

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

Expected: `written N chars from M blocks` 출력(N>0). 본체 코드가 첫 번째 ```typescript 블록이어야 한다 — 만약 `blocks[0]`이 본체가 아니면 올바른 인덱스를 확인해서 그 인덱스를 쓴다.

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

Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...` 경고 1줄만 출력되고, `_wander_check.ts` 관련 타입 에러(TS2304/TS2339 등)는 0건. 특히 `DigitalPin.P13`/`DigitalPin.P14`/`maqueenPlusV2.readUltrasonic`가 타입 에러 없이 인식되는지 확인한다. 에러가 있으면 해당 태스크 코드로 돌아가 수정 후 이 Step부터 재실행한다.

- [x] **Step 4: 원상복구**

```bash
mv tsconfig.json.bak tsconfig.json
rm -f _wander_check.ts
git status --short tsconfig.json _wander_check.ts
```

Expected: 마지막 `git status --short` 출력이 비어 있음.

- [ ] **Step 5: 하드웨어 검증 체크리스트 (사람이 실행)**

이 프로젝트에는 자동화 테스트 러너가 없으므로, 아래는 실제 로봇으로 확인한다.

- [ ] 부팅 후 빈 바닥에서 `기준값`이 정상적으로 잡히고, 4000 필터 적용 전후로 평소 회피 동작이 달라지지 않는가(라이더가 멀쩡한 지점에서는).
- [ ] 라이다가 놓치기 쉬운 낮은 장애물(손바닥 등)을 정면에 댔을 때, 라이다가 못 봐도 초음파로 감지해 정지하는가.
- [ ] 초음파 연결을 빼거나 `초음파사용 = false`로 두면, 기존처럼 라이다만으로 정상 회피하는가.
- [ ] 주행 중 LCD 4번째 줄이 `"L.. F.. R.. U.."` 형식으로 초음파 값까지 표시하는가.
- [ ] `lcd레이더맵표시()`에서 예전에 4000이라 파란색이던 칸이 이제 회색(0과 동일)으로 보이는가.

- [ ] **Step 6: Commit**

이 태스크는 검증만 수행하고 코드를 변경하지 않으므로 커밋할 대상이 없다. `git status --short`가 비어 있음을 확인하는 것으로 태스크를 마친다.
