# 재탐색180() 다단계(굵게→세밀하게) 각도 탐색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `재탐색180()`이 정면 ±90°/45° 5방향에서 실패하면 더 세밀한 각도로 정면을
다시 보고, 그래도 실패하면 360° 전체를 세밀하게 다 본 다음에야 "안전한 방향 없음"으로
포기하도록 확장한다.

**Architecture:** 회전+점수측정 루프를 `각도순회탐색(각도목록: number[]): number`
공용 함수로 추출해서, `재탐색180()` 안에서 4개의 각도 배열(기존 1개 + 신규 3개)에
대해 순서대로 호출한다. 각 단계가 끝나면 점수+안전 체크 후 실패 시 되돌리기 회전을
하고 다음 단계로 넘어간다.

**Tech Stack:** MakeCode/PXT TypeScript for micro:bit (target=ES5, static TS,
union 타입 미지원), `maqueenPlusV2`(`pidControlAngle`, `pidControlStop`,
`MyInterruption.NotAllowed`) 확장.

## Global Constraints

- PXT Static TypeScript: `T | null` 같은 union 타입 불가, 함수 밖 실행문 namespace에
  두면 컴파일 깨짐(이 파일은 namespace 밖 평범한 스크립트라 해당 없음).
- 식별자는 숫자로 시작 불가(과거 `5x5LED표시` 실수 재발 방지).
- 이 저장소는 자동 테스트 러너가 없다(MakeCode/PXT 하드웨어 펌웨어). 검증은 정적
  타입체크(`tsc --noEmit`) + 의사실행 트레이스 + 하드웨어 체크리스트(사람이 실행).
- 커밋은 `main` 브랜치에 직접 한다(이 저장소 관례, feature 브랜치 미사용).
- 모든 새 식별자는 기존 코드와 동일하게 한글 이름을 쓴다(이 파일 전체의 기존 컨벤션).

---

### Task 1: `각도순회탐색()` 공용 헬퍼 추출 + 신규 각도 배열 3개 추가

**Files:**
- Modify: `AUTONOMOUS_WANDER_EXAMPLE.md:145` (전역 변수 선언부, 신규 배열 3개 추가)
- Modify: `AUTONOMOUS_WANDER_EXAMPLE.md:870-902` (`재탐색180()` 바로 앞에 새 함수 삽입)

**Interfaces:**
- Consumes(기존, 변경 없음): `탐색점수(후보각: number): number`(`:790`),
  `방향안전확인(): boolean`(`:807`), `회전기록(각도: number): void`(`:522`),
  `lcd문자(줄: number, ?, ?, 문자열: string, 색: number): void`(기존 시그니처),
  `로그(문자열: string): void`(기존), 전역 `감시모드: string`, `마지막판단: string`,
  `예약회전각: number`, `마지막탐색점수: number`.
- Produces: `각도순회탐색(각도목록: number[]): number` — 회전+점수 측정 루프를
  돌고, 최종적으로 `최고각`으로 회전해 그 방향을 보게 만든 뒤 `최고각`을 반환한다.
  부수효과로 전역 `예약회전각`, `마지막판단`, `마지막탐색점수`를 갱신한다.
  Task 2가 이 함수를 4번 호출한다.
  신규 전역 배열 `재탐색각도세밀: number[]`, `재탐색각도세밀후방우: number[]`,
  `재탐색각도세밀후방좌: number[]` — Task 2가 사용.

- [ ] **Step 1: 전역 변수 선언부에 신규 각도 배열 3개 추가**

`AUTONOMOUS_WANDER_EXAMPLE.md:145` 바로 다음 줄에 추가(기존 `let 재탐색각도 = ...`
줄은 그대로 둔다):

```typescript
let 재탐색각도 = [-90, -45, 0, 45, 90]
let 재탐색각도세밀 = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90]
let 재탐색각도세밀후방우 = [105, 120, 135, 150, 165, 180]
let 재탐색각도세밀후방좌 = [-105, -120, -135, -150, -165, -180]
```

- [ ] **Step 2: `각도순회탐색()` 함수 추가**

`AUTONOMOUS_WANDER_EXAMPLE.md:870`(현재 `function 재탐색180(...)` 줄) 바로 앞에
새 함수를 삽입한다:

```typescript
function 각도순회탐색(각도목록: number[]): number {
    let 최고점수 = -999999
    let 최고각 = 각도목록[0]
    maqueenPlusV2.pidControlAngle(각도목록[0], maqueenPlusV2.MyInterruption.NotAllowed)
    for (let i = 0; i < 각도목록.length; i++) {
        let 후보각 = 각도목록[i]
        let 점수 = 탐색점수(후보각)
        if (점수 > 최고점수) {
            최고점수 = 점수
            최고각 = 후보각
        }
        lcd문자(1, 8, 16, 감시모드 + " " + (i + 1) + "/" + 각도목록.length, 0x000000)
        lcd문자(2, 8, 54, "DIR " + 후보각, 0x0000ff)
        lcd문자(3, 8, 92, "SCORE " + 점수, 0x008000)
        lcd문자(4, 8, 130, "BEST " + 최고각, 0xaa00aa)
        로그(감시모드 + " DIR " + 후보각 + " SCORE " + 점수)
        if (i < 각도목록.length - 1) {
            maqueenPlusV2.pidControlAngle(각도목록[i + 1] - 각도목록[i], maqueenPlusV2.MyInterruption.NotAllowed)
        }
    }
    예약회전각 = 최고각 - 각도목록[각도목록.length - 1]
    마지막판단 = "BEST " + 최고각
    로그(감시모드 + " BEST " + 최고각 + " SCORE " + 최고점수)
    maqueenPlusV2.pidControlAngle(예약회전각, maqueenPlusV2.MyInterruption.NotAllowed)
    회전기록(예약회전각)
    basic.pause(300)
    마지막탐색점수 = 최고점수
    return 최고각
}
```

이 시점에서는 아직 아무도 `각도순회탐색()`을 호출하지 않으므로(Task 2에서 연결),
타입 검사만 통과하면 된다.

- [ ] **Step 3: 정적 검증**

`AUTONOMOUS_WANDER_EXAMPLE.md`에서 typescript 코드블록 2개(상단 안내문 코드블록과
본문 전체 스크립트 코드블록)를 추출해 `_wander_check.ts`로 저장한다. 추출은 다음
node 스크립트로 한다(저장소 루트에서 실행):

```bash
node -e "
const fs = require('fs');
const md = fs.readFileSync('AUTONOMOUS_WANDER_EXAMPLE.md', 'utf8');
const blocks = [...md.matchAll(/\`\`\`typescript\n([\s\S]*?)\`\`\`/g)].map(m => m[1]);
fs.writeFileSync('_wander_check.ts', blocks.join('\n\n'));
console.log(blocks.length + ' blocks, ' + blocks.join('').length + ' chars');
"
```

`tsconfig.json`을 백업하고 `"files"` 배열에 `_wander_check.ts`와
`pxt_modules/matrixLidarDistance/matrixLidarDistance.ts`를 추가한 뒤:

```bash
cp tsconfig.json tsconfig.json.bak
```

`tsconfig.json`의 `"files"` 배열을 임시로 다음과 같이 바꾼다(기존 내용은
`tsconfig.json.bak`에 보존됨):

```json
"files": [
    "_wander_check.ts",
    "pxt_modules/matrixLidarDistance/matrixLidarDistance.ts"
]
```

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `tsconfig.json(3,19): error TS5107: Option 'target=ES5' is deprecated...`
경고 1줄만 출력되고, `_wander_check.ts` 관련 타입 에러(TS2304/TS2339/TS2554 등)는
0건. `각도순회탐색`이 받는 `number[]` 파라미터와 `maqueenPlusV2.pidControlAngle`
호출이 타입 에러 없이 인식되는지 확인한다. 에러가 있으면 Step 2로 돌아가 수정한다.

복구:

```bash
mv tsconfig.json.bak tsconfig.json
rm _wander_check.ts
git status --short tsconfig.json _wander_check.ts
```

Expected: 마지막 명령 출력이 비어 있음(두 파일 모두 변경 없음 상태로 복구됨).

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_WANDER_EXAMPLE.md
git commit -m "Add 각도순회탐색() helper and fine-grained rescan angle arrays"
```

---

### Task 2: `재탐색180()`을 4단계 구조로 리팩터링

**Files:**
- Modify: `AUTONOMOUS_WANDER_EXAMPLE.md:870-902` (`재탐색180()` 본문 전체 교체)

**Interfaces:**
- Consumes(Task 1): `각도순회탐색(각도목록: number[]): number`, `재탐색각도세밀`,
  `재탐색각도세밀후방우`, `재탐색각도세밀후방좌`(전역, Task 1에서 추가),
  `재탐색각도`(기존, 변경 없음).
- Consumes(기존, 변경 없음): `방향안전확인(): boolean`, `재탐색최소점수`(상수, 값 2500),
  `maqueenPlusV2.pidControlStop()`, `maqueenPlusV2.pidControlAngle(...)`.
- Produces: `재탐색180(탈출모드: boolean): boolean` — 시그니처는 기존과 동일하게
  유지(호출자인 `출발준비()`:936, `탈출탐색()`:904, 메인 루프:1007은 수정하지 않음).

- [ ] **Step 1: `재탐색180()` 본문을 4단계 구조로 교체**

현재 `AUTONOMOUS_WANDER_EXAMPLE.md:870-902`의 `재탐색180()` 전체(아래 원본 블록)를:

```typescript
function 재탐색180(탈출모드: boolean): boolean {
    감시모드 = 탈출모드 ? "ESCAPE" : "RESCAN"
    상태 = 탈출모드 ? "탈출탐색" : "재탐색"
    let 최고점수 = -999999
    let 최고각 = 0
    maqueenPlusV2.pidControlStop()
    maqueenPlusV2.pidControlAngle(-90, maqueenPlusV2.MyInterruption.NotAllowed)
    for (let i = 0; i < 재탐색각도.length; i++) {
        let 후보각 = 재탐색각도[i]
        let 점수 = 탐색점수(후보각)
        if (점수 > 최고점수) {
            최고점수 = 점수
            최고각 = 후보각
        }
        lcd문자(1, 8, 16, 감시모드 + " " + (i + 1) + "/" + 재탐색각도.length, 0x000000)
        lcd문자(2, 8, 54, "DIR " + 후보각, 0x0000ff)
        lcd문자(3, 8, 92, "SCORE " + 점수, 0x008000)
        lcd문자(4, 8, 130, "BEST " + 최고각, 0xaa00aa)
        로그(감시모드 + " DIR " + 후보각 + " SCORE " + 점수)
        if (i < 재탐색각도.length - 1) {
            maqueenPlusV2.pidControlAngle(45, maqueenPlusV2.MyInterruption.NotAllowed)
        }
    }
    예약회전각 = 최고각 - 90
    마지막판단 = "BEST " + 최고각
    로그(감시모드 + " BEST " + 최고각 + " SCORE " + 최고점수)
    maqueenPlusV2.pidControlAngle(예약회전각, maqueenPlusV2.MyInterruption.NotAllowed)
    회전기록(예약회전각)
    basic.pause(300)
    마지막탐색점수 = 최고점수
    if (최고점수 < 재탐색최소점수) return false
    return 방향안전확인()
}
```

다음으로 교체한다:

```typescript
function 재탐색180(탈출모드: boolean): boolean {
    감시모드 = 탈출모드 ? "ESCAPE" : "RESCAN"
    상태 = 탈출모드 ? "탈출탐색" : "재탐색"
    maqueenPlusV2.pidControlStop()

    let 최고각 = 각도순회탐색(재탐색각도)
    if (마지막탐색점수 >= 재탐색최소점수 && 방향안전확인()) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    감시모드 = 탈출모드 ? "ESCAPE-FINE" : "RESCAN-FINE"
    최고각 = 각도순회탐색(재탐색각도세밀)
    if (마지막탐색점수 >= 재탐색최소점수 && 방향안전확인()) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    감시모드 = 탈출모드 ? "ESCAPE-BACK-R" : "RESCAN-BACK-R"
    최고각 = 각도순회탐색(재탐색각도세밀후방우)
    if (마지막탐색점수 >= 재탐색최소점수 && 방향안전확인()) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    감시모드 = 탈출모드 ? "ESCAPE-BACK-L" : "RESCAN-BACK-L"
    최고각 = 각도순회탐색(재탐색각도세밀후방좌)
    if (마지막탐색점수 >= 재탐색최소점수 && 방향안전확인()) return true

    로그("ALL 360 FINE STAGES FAILED -> NO SAFE DIR")
    return false
}
```

- [ ] **Step 2: 의사실행 트레이스로 회전량 일관성 확인**

손으로 다음을 계산해서 기존 동작과 일치하는지 확인한다(코드 실행 없이 종이/메모로):

1. `각도순회탐색(재탐색각도)` 호출 시 `재탐색각도 = [-90,-45,0,45,90]`이므로:
   - 진입 회전: `pidControlAngle(-90, ...)` — 기존 `재탐색180()`의 초기
     `pidControlAngle(-90, ...)`과 동일.
   - 루프 내 회전: `목록[1]-목록[0] = -45-(-90) = 45`, `목록[2]-목록[1] = 0-(-45) = 45`,
     이하 전부 45 — 기존의 고정 `pidControlAngle(45, ...)`과 동일.
   - 종료 시 `예약회전각 = 최고각 - 목록[4] = 최고각 - 90` — 기존 `예약회전각 = 최고각 - 90`과
     동일.
   - 결론: 1단계는 기존 `재탐색180()`과 회전 시퀀스가 100% 동일하다(리팩터링 전후
     동치 확인).
2. `각도순회탐색(재탐색각도세밀)` 호출 시 `목록[0] = -90`이므로 1단계 실패 후
   `pidControlAngle(-최고각1, ...)`로 원위치 복귀한 다음 다시 `-90`부터 시작 —
   진입 헤딩이 항상 "재탐색180() 호출 시점의 헤딩"으로 보존됨을 확인.
   루프 내 회전은 전부 `15`(예: `-75-(-90)=15`) — 의도한 15° 간격과 일치.
3. `각도순회탐색(재탐색각도세밀후방우)`의 `목록[0] = 105`이므로 2단계 실패 후
   되돌리기(`-최고각2`)로 원위치 복귀 후 `105`로 회전 — 정면이 아니라 우후방부터
   탐색 시작함을 확인. 루프 내 회전은 전부 `15`.
4. `재탐색각도세밀후방좌`의 `목록[0] = -105`도 동일 패턴, 회전은 전부 `-15`.

위 4가지 모두 의도(기존 1단계 동치 + 2~4단계 15° 간격 + 매 단계 원위치 기준 재시작)와
일치하면 통과로 본다. 불일치가 있으면 Step 1로 돌아가 배열 값 또는 되돌리기 호출을
수정한다.

- [ ] **Step 3: 정적 검증**

Task 1 Step 3과 동일한 추출/스플라이스/복구 절차를 다시 수행한다:

```bash
node -e "
const fs = require('fs');
const md = fs.readFileSync('AUTONOMOUS_WANDER_EXAMPLE.md', 'utf8');
const blocks = [...md.matchAll(/\`\`\`typescript\n([\s\S]*?)\`\`\`/g)].map(m => m[1]);
fs.writeFileSync('_wander_check.ts', blocks.join('\n\n'));
console.log(blocks.length + ' blocks, ' + blocks.join('').length + ' chars');
"
cp tsconfig.json tsconfig.json.bak
```

`tsconfig.json`의 `"files"`를 Task 1 Step 3과 동일하게 임시 수정 후:

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `TS5107` 경고 1줄만, 그 외 타입 에러 0건. 특히 `재탐색180`이 여전히
`(탈출모드: boolean): boolean` 시그니처로 호출자(`출발준비()`, `탈출탐색()`, 메인
루프의 `재탐색180(false)`)와 타입이 맞는지 확인한다.

복구:

```bash
mv tsconfig.json.bak tsconfig.json
rm _wander_check.ts
git status --short tsconfig.json _wander_check.ts
```

Expected: 출력 없음.

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_WANDER_EXAMPLE.md
git commit -m "Expand 재탐색180() into 4-stage coarse-to-fine 360 angle search"
```

---

### Task 3: 문서 갱신

**Files:**
- Modify: `AUTONOMOUS_WANDER_EXAMPLE.md` (설명 섹션, 정확한 줄 번호는 Step 1에서
  `Grep`으로 다시 찾는다 — Task 1/2의 코드 삽입으로 본문 줄 번호가 밀려 있을 수 있음)

**Interfaces:**
- Consumes: 없음(문서 전용 작업).
- Produces: 없음.

- [ ] **Step 1: 재탐색 관련 설명 문단 찾기**

```bash
grep -n "재탐색180\|RESCAN\|±90\|재탐색각도" AUTONOMOUS_WANDER_EXAMPLE.md
```

이 명령으로 나온 줄 번호들을 확인해서, "정면 ±90°에서 5방향만 본다"거나 "재탐색
실패 시 바로 ESCAPE/NO SAFE DIR로 간다"는 식의 기존 설명 문장을 찾는다(Task 1/2
이전에 읽은 문서 본문 기준으로는 상단 "사용 흐름"/"핵심 변화" 섹션 근처에 있다).

- [ ] **Step 2: 설명 문장을 4단계 동작에 맞게 갱신**

찾은 문장을 다음 내용을 포함하도록 고친다(정확한 `old_string`은 Step 1 결과를 보고
결정): "재탐색은 정면 ±90°(45°, 5방향) → 같은 범위를 15° 13방향으로 → 우후방
105~180° → 좌후방 -105~-180°까지 총 4단계로 360° 전체를 점점 세밀하게 다시 본
다음에야 안전한 방향이 없다고 판단한다."

- [ ] **Step 3: 정적 검증**

Task 2 Step 3과 동일한 tsc 추출/검증/복구 절차를 한 번 더 수행해 문서 코드블록이
깨지지 않았는지 확인한다(문서 문장만 바꿨다면 코드블록 내용은 그대로이므로 에러가
없어야 한다).

- [ ] **Step 4: Commit**

```bash
git add AUTONOMOUS_WANDER_EXAMPLE.md
git commit -m "Document 4-stage coarse-to-fine rescan behavior"
```

---

### Task 4: 하드웨어 검증 체크리스트 (사람이 실행)

**Files:** 없음(코드 변경 없음, 검증 전용 태스크).

**Interfaces:** 없음.

- [ ] **Step 1: 정면 좁은 틈 시나리오**

정면 거의 전체를 막고 한쪽에만 좁은(약 15~30° 폭) 틈을 남긴 채 A로 출발을 시도한다.
1단계(45°)로는 틈을 못 찾고 2단계(15°, `RESCAN-FINE`)에서 틈을 찾아 그 방향으로
출발하는지 LCD `RESCAN-FINE n/13`/로그를 보고 확인한다.

- [ ] **Step 2: 후방 틈 시나리오**

정면+양옆을 막고 우후방(약 120~150° 부근)에만 틈을 남긴다. 1~2단계가 모두 실패하고
3단계(`RESCAN-BACK-R`)에서 그 틈을 찾는지 확인한다. 좌후방에 틈을 두는 경우도 동일하게
4단계(`RESCAN-BACK-L`)에서 찾는지 확인한다.

- [ ] **Step 3: 완전 차단 시나리오**

로봇을 사방이 막힌 좁은 공간(또는 상자 안)에 두고 출발을 시도한다. 4단계 모두 실패한
뒤 `"NO SAFE DIR"` 로그와 `basic.showIcon(IconNames.No)`(X 표시)가 뜨고, 그 전에는
포기하지 않는지(즉 1~3단계에서 섣불리 멈추지 않는지) 확인한다.

- [ ] **Step 4: 정상 경로 회귀 확인**

평소처럼 충분히 열린 공간에서 출발해, 항상 1단계(`RESCAN` 또는 그 전 단계인
`초기360탐색()`)에서 바로 안전한 방향을 찾고 2~4단계로 넘어가지 않는지(즉 정상
경로의 속도/동작이 기존과 동일한지) 확인한다.

- [ ] **Step 5: 결과 기록**

위 4가지를 모두 실행해보고, 이상이 있으면 Task 1~3으로 돌아가 수정한다. 이상이
없으면 별도 커밋 없이(코드 변경 없으므로) 검증 완료로 표시한다.
