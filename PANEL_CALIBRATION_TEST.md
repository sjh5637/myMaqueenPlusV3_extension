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
      시작하는 9줄(MinDist 1줄, MaxErr L/C/R/U 4줄, Asymmetry 1줄,
      JumpL/C/R 3줄)이 수신되는가.
- [ ] SUMMARY MinDist 값이 실제로 센서가 안정적으로 값을 내기 시작한
      거리와 대략 일치하는가(줄자 기준 육안 확인).
