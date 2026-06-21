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
const 정면막힘확인필요 = 2

const 루프대기ms = 40
const LCD갱신간격ms = 500
const 디버그모드 = true
const 라디오그룹 = 78
const LCD맵칸쓰기지연ms = 5
const 로그송신지연ms = 20
// true: 로봇 정면을 마주보고 서 있는 사람 입장에서 거울처럼 보이도록 좌우를 뒤집어 표시
// (라이다 col0~1=로봇 기준 좌측 장애물이 LED의 오른쪽 칸에 표시됨). 실제로 반대로
// 보이면 false로 바꾼다. 회피/탈출 조향 계산에는 영향 없음(표시만 반전).
const LED좌우반전 = true

let 열가중치 = [1, 1.5, 2, 3, 3, 2, 1.5, 1]
let 탈출각도 = [-90, -45, 0, 45, 90]
let 탈출각도세밀 = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90]
let 탈출각도세밀후방우 = [105, 120, 135, 150, 165, 180]
let 탈출각도세밀후방좌 = [-105, -120, -135, -150, -165, -180]

let 적응전진거리cm = 전진거리cm
let 전진성공연속 = 0
let 실패연속 = 0
let 정면막힘연속 = 0
let 상태 = "BOOT"
let 마지막판단 = "INIT"
let 마지막탐색점수 = 0
let 마지막LCD시각 = 0
let 마지막하트비트시각 = 0
let 출발요청 = false
let 주행시작됨 = false

const 하트비트간격ms = 1000

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
        let ledX = LED좌우반전 ? (4 - i) : i
        led.plotBrightness(ledX, 2, 밝기)
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
    로그("START COUNTDOWN")
    for (let n = 3; n > 0; n--) {
        마지막판단 = "START " + n
        lcd줄(1, "START " + n, 0x000000)
        lcd줄(2, "FRONT LIDAR SCAN", 0x0000ff)
        basic.showNumber(n)
        basic.pause(1000)
    }
    basic.clearScreen()
    로그("DRIVE START")
}

// 반환값: 양수 = 실제로 본 가장 가까운 장애물 거리(mm, 보수적/안전 우선),
// 0 = 8행 중 적어도 한 행이 센티널(라이다무효값mm 이상, 확실한 "감지 없음")을 본 경우,
// -1 = 유효한 측정도, 센티널도 못 봤음(전부 raw==0 글리치) — 판단 불가, "모름".
// raw==0 글리치를 센티널과 같은 0으로 합쳐버리면 실제 장애물이 있는데도 8행이 동시에
// 글리치 날 때 "확실히 열림"으로 오판할 수 있어 구분한다(실제 캘리브레이션 로그에서
// 주변 행이 ~300mm인데 한 행만 0을 찍는 글리치가 관찰됨).
function 열최소읍기(col: number): number {
    let 최소 = -1
    let 센티널확인 = false
    for (let row = 0; row < 8; row++) {
        let raw = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
        if (raw >= 라이다무효값mm) {
            센티널확인 = true
        } else if (raw > 0) {
            if (최소 < 0 || raw < 최소) 최소 = raw
        }
        // raw == 0(글리치)은 무시 — 열림으로도 막힘으로도 셈하지 않음
    }
    if (최소 >= 0) return 최소
    if (센티널확인) return 0
    return -1
}

function 전체열스캔(): number[] {
    let 결과: number[] = []
    for (let col = 0; col < 8; col++) {
        결과.push(열최소읍기(col))
    }
    return 결과
}

function 칸안전(거리: number): boolean {
    if (거리 < 0) return false
    if (거리 == 0) return true
    return 거리 >= 정지거리mm
}

function 정면안전(): boolean {
    let c3 = 열최소읍기(3)
    let c4 = 열최소읍기(4)
    return 칸안전(c3) && 칸안전(c4)
}

function 정면블록확정(): boolean {
    if (정면안전()) {
        if (정면막힘연속 > 0) 로그("FRONT CLEAR AGAIN (was " + 정면막힘연속 + ")")
        정면막힘연속 = 0
        return false
    }
    정면막힘연속 += 1
    로그("FRONT BLOCKED CHECK " + 정면막힘연속 + "/" + 정면막힘확인필요)
    return 정면막힘연속 >= 정면막힘확인필요
}

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
    let 전진cm = 안전전진거리cm(목표열, 거리목록)
    로그("AVOID TURN " + 목표각 + " GO " + 전진cm + "cm (step " + 적응전진거리cm + ")")
    maqueenPlusV2.pidControlAngle(목표각, maqueenPlusV2.MyInterruption.NotAllowed)
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 전진cm, maqueenPlusV2.MyInterruption.NotAllowed)
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

function 점수용거리(원시거리: number): number {
    if (원시거리 < 0) return 0
    if (원시거리 == 0) return 탐색점수상한mm
    return Math.min(원시거리, 탐색점수상한mm)
}

function 탐색점수계산(): number {
    let 거리목록 = 전체열스캔()
    let 점수 = 0
    for (let col = 0; col < 8; col++) {
        let 거리 = 점수용거리(거리목록[col])
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

input.onButtonPressed(Button.B, function () {
    if (!주행시작됨) {
        로그("BUTTON B PRESSED")
        출발요청 = true
    }
})

로봇초기화()

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
