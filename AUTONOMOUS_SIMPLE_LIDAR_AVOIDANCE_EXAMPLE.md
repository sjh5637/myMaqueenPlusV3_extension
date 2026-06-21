# 간단 라이다 전용 자율주행 예제

이 예제는 초음파 센서를 쓰지 않습니다. 8x8 Matrix LiDAR 값만 보고 전진, 완만한 회피 조향, 정지 후 회전을 합니다.

기존 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE_DIRECTDRIVE.md`에서 문제가 됐던 긴 라디오 로그, 기준값/델타 비교, 백그라운드 64칸 스캔은 뺐습니다. 360도 탐색은 평상시에는 쓰지 않고, 부분 탐색을 여러 번 해도 막힐 때만 실행합니다.

## 동작 순서

1. `B` 버튼을 누르면 시작/정지 토글.
2. 매 루프마다 앞쪽 핵심 열과 가장 아래 행 `y=7`을 확인합니다.
3. `y=7`은 가까운 충돌권 전용으로 보고, 매우 가까운 값이 잡히면 즉시 회피합니다.
4. 가운데 열이 가까우면 물체에 더 접근한 뒤 왼쪽/오른쪽 가까운 정도 차이로 자연스럽게 한쪽 바퀴 속도를 더 줘서 피합니다.
5. 막힘이 2번 연속이면 정지, 짧게 후진, 왼쪽/오른쪽 열린 점수를 비교해서 정확한 각도로 회전합니다.
6. 같은 방향 회피가 반복되거나 실제 바퀴 속도가 멈추면 랜덤 부분 탐색을 수행합니다.
7. 부분 탐색이 랜덤 한계에 도달하면 360도 탐색 후 선택 방향 주변을 10도 단위로 정밀 탐색합니다.

## 코드

```typescript
const LCD주소 = 0x2c
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라이다무효값mm = 4000

// 현재 테스트 데이터 기준: 바닥을 조금 보는 각도라 너무 아래 행은 바닥 영향이 큽니다.
// 바닥 오검출이 많으면 판정행끝을 3으로 낮추세요.
const 판정행시작 = 0
const 판정행끝 = 4

const 정지거리mm = 170
const 회피시작거리mm = 240
const 아래행위험거리mm = 120
const 긴급근접거리mm = 150
const 통로측면거리mm = 200
const 열린거리상한mm = 1200

const 시작전진속도 = 45
const 저속전진속도 = 45
const 최고전진속도 = 80
const 후진속도 = 45
const 조향최대보정 = 26
const 통로보정최대 = 18

const 루프대기ms = 60
const LCD갱신간격ms = 500
const LCD쓰기지연ms = 5
const 후진시간ms = 260
const 기본회전각도 = 45
const 큰회전각도 = 75
const 막힘연속필요 = 2
const 같은방향회전한계 = 2
const 좌우점수차이한계 = 120
const 정지감지주기ms = 900
const 정지감지속도기준 = 1
const 정밀탐색실패한계 = 4
const 정밀탐색간격도 = 30
const 세밀탐색간격도 = 10
const 정밀탐색후보수 = 5
const 부분탐색최소한계 = 1
const 부분탐색최대한계 = 10

let 주행중 = false
let 열거리 = [0, 0, 0, 0, 0, 0, 0, 0]
let 현재속도 = 시작전진속도
let 막힘연속 = 0
let 아래행위험연속 = 0
let 실패연속 = 0
let 마지막회전방향 = 0
let 같은방향회전수 = 0
let 마지막정지감지시각 = 0
let 마지막명령전진 = false
let 아래행위험쪽 = 0
let 상태 = "READY"
let 중앙최소 = 0
let 아래행최소 = 0
let 아래행좌최소 = 0
let 아래행중최소 = 0
let 아래행우최소 = 0
let 마지막LCD시각 = 0
let 부분탐색횟수 = 0
let 부분탐색한계 = 4
let 마지막탐색모드 = 0
let 마지막선택각 = 0

function lcd명령쓰기(데이터: number[]): void {
    let 보낼위치 = 0
    while (보낼위치 < 데이터.length) {
        let 끝 = Math.min(보낼위치 + 32, 데이터.length)
        let 조각 = 데이터.slice(보낼위치, 끝)
        pins.i2cWriteBuffer(LCD주소, pins.createBufferFromArray(조각), 끝 < 데이터.length)
        보낼위치 = 끝
        basic.pause(LCD쓰기지연ms)
    }
}

function lcd명령(명령: number, 데이터: number[]): void {
    let 패킷 = [0x55, 0xaa, 데이터.length + 1, 명령]
    for (let i = 0; i < 데이터.length; i++) 패킷.push(데이터[i])
    lcd명령쓰기(패킷)
}

function lcd지우기(): void {
    lcd명령(0x1d, [])
    basic.pause(1500)
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
    for (let i = 0; i < 내용.length; i++) 데이터.push(내용.charCodeAt(i))
    lcd명령(0x18, 데이터)
}

function lcd줄(번호: number, 내용: string, 색: number): void {
    let y목록 = [16, 54, 92, 130]
    let 표시 = 내용
    if (표시.length > 24) 표시 = 표시.substr(0, 24)
    while (표시.length < 24) 표시 += " "
    lcd문자(번호, 8, y목록[번호 - 1], 표시, 색)
}

function lcd표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    if (!주행중) {
        lcd줄(1, "READY", 0x000000)
        lcd줄(2, "PRESS B TO START", 0x0000ff)
        lcd줄(3, "LIDAR ONLY", 0x008000)
        lcd줄(4, "TAG v0.0.26", 0xaa00aa)
    } else {
        lcd줄(1, "STATE " + 상태, 0x000000)
        lcd줄(2, "C" + 중앙최소 + " B" + 아래행최소 + " V" + 현재속도, 0x0000ff)
        lcd줄(3, "F" + 실패연속 + " M" + 막힘연속 + " D" + 마지막회전방향, 0x008000)
        let 화면모드 = Math.idiv(input.runningTime(), 3000) % 3
        if (화면모드 == 0) {
            lcd줄(4, "Y7 L" + 아래행좌최소 + " C" + 아래행중최소 + " R" + 아래행우최소, 0xaa00aa)
        } else if (화면모드 == 1) {
            lcd줄(4, "P" + 부분탐색횟수 + "/" + 부분탐색한계 + " M" + 마지막탐색모드 + " A" + 마지막선택각, 0xaa00aa)
        } else {
            lcd줄(4, "S" + 같은방향회전수 + " Y7" + 아래행위험연속, 0xaa00aa)
        }
    }
}

function 유효거리(raw: number): number {
    if (raw <= 0 || raw >= 라이다무효값mm) {
        return 0
    }
    return raw
}

function 제한값(v: number, lo: number, hi: number): number {
    if (v < lo) return lo
    if (v > hi) return hi
    return v
}

function 열최소거리(col: number): number {
    let best = 0
    for (let row = 판정행시작; row <= 판정행끝; row++) {
        let d = 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, col, row))
        if (d > 0 && (best == 0 || d < best)) {
            best = d
        }
    }
    return best
}

function 핵심장면읽기(): void {
    열거리[0] = 0
    열거리[7] = 0
    for (let col = 1; col <= 6; col++) {
        열거리[col] = 열최소거리(col)
    }
}

function 전체장면읽기(): void {
    for (let col = 0; col < 8; col++) {
        열거리[col] = 열최소거리(col)
    }
}

function 아래행위험읽기(): boolean {
    let leftHit = 0
    let rightHit = 0
    아래행최소 = 0
    아래행좌최소 = 0
    아래행중최소 = 0
    아래행우최소 = 0
    for (let col = 1; col <= 6; col++) {
        let d = 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, col, 7))
        if (d > 0 && (아래행최소 == 0 || d < 아래행최소)) {
            아래행최소 = d
        }
        if (d > 0 && col <= 2 && (아래행좌최소 == 0 || d < 아래행좌최소)) {
            아래행좌최소 = d
        }
        if (d > 0 && col >= 3 && col <= 4 && (아래행중최소 == 0 || d < 아래행중최소)) {
            아래행중최소 = d
        }
        if (d > 0 && col >= 5 && (아래행우최소 == 0 || d < 아래행우최소)) {
            아래행우최소 = d
        }
        if (d > 0 && d < 아래행위험거리mm) {
            if (col <= 3) {
                leftHit += 1
            } else {
                rightHit += 1
            }
        }
    }
    아래행위험쪽 = rightHit > leftHit ? 1 : (leftHit > rightHit ? -1 : 0)
    if (leftHit + rightHit > 0) {
        아래행위험연속 += 1
    } else {
        아래행위험연속 = 0
    }
    return 아래행위험연속 >= 1
}

function 범위최소거리(fromCol: number, toCol: number): number {
    let best = 0
    for (let col = fromCol; col <= toCol; col++) {
        let d = 열거리[col]
        if (d > 0 && (best == 0 || d < best)) {
            best = d
        }
    }
    return best
}

function 막힌중앙열수(): number {
    let count = 0
    for (let col = 2; col <= 5; col++) {
        if (열거리[col] > 0 && 열거리[col] < 정지거리mm) {
            count += 1
        }
    }
    return count
}

function 정면막힘확정(): boolean {
    if (막힌중앙열수() >= 2) {
        막힘연속 += 1
    } else {
        막힘연속 = 0
    }
    return 막힘연속 >= 막힘연속필요
}

function 긴급근접위험(): boolean {
    let centerNear = 범위최소거리(2, 5)
    중앙최소 = centerNear
    return centerNear > 0 && centerNear < 긴급근접거리mm
}

function 열린점수(fromCol: number, toCol: number): number {
    let score = 0
    for (let col = fromCol; col <= toCol; col++) {
        let d = 열거리[col]
        if (d == 0) {
            score += 열린거리상한mm
        } else if (d > 열린거리상한mm) {
            score += 열린거리상한mm
        } else {
            score += d
        }
    }
    return score
}

function 정지(): void {
    마지막명령전진 = false
    maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
}

function 전진명령(left: number, right: number): void {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 제한값(left, 0, 최고전진속도))
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 제한값(right, 0, 최고전진속도))
    마지막명령전진 = true
}

function 후진짧게(): void {
    상태 = "BACK"
    lcd표시(true)
    마지막명령전진 = false
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Backward, 후진속도)
    basic.pause(후진시간ms)
    정지()
    basic.pause(80)
}

function 각도회전(방향: number, 각도: number): void {
    상태 = "TURN" + 방향 * 각도
    lcd표시(true)
    마지막명령전진 = false
    정지()
    basic.pause(80)
    maqueenPlusV2.pidControlAngle(방향 * 각도, maqueenPlusV2.MyInterruption.NotAllowed)
    basic.pause(80)
}

function 회피방향계산(): number {
    if (아래행위험쪽 != 0) {
        return 0 - 아래행위험쪽
    }
    let leftScore = 열린점수(0, 2)
    let rightScore = 열린점수(5, 7)
    if (rightScore > leftScore + 좌우점수차이한계) {
        return 1
    } else if (leftScore > rightScore + 좌우점수차이한계) {
        return -1
    } else if (마지막회전방향 != 0) {
        return 0 - 마지막회전방향
    }
    return 1
}

function 회피회전(강제정밀탐색: boolean): void {
    상태 = "AVOID"
    정지()
    basic.showIcon(IconNames.No)
    후진짧게()
    if (강제정밀탐색 || 실패연속 >= 정밀탐색실패한계) {
        탐색복구()
        return
    }

    전체장면읽기()
    let 방향 = 회피방향계산()

    if (방향 == 마지막회전방향) {
        같은방향회전수 += 1
    } else {
        같은방향회전수 = 1
    }
    마지막회전방향 = 방향

    let 각도 = 같은방향회전수 > 같은방향회전한계 || 실패연속 >= 3 ? 큰회전각도 : 기본회전각도
    각도회전(방향, 각도)
}

function 자연회피전진(): void {
    let centerNear = 범위최소거리(2, 5)
    중앙최소 = centerNear
    let base = 현재속도
    if (centerNear > 0 && centerNear < 회피시작거리mm) {
        base = 저속전진속도
    } else if (현재속도 < 최고전진속도) {
        현재속도 += 1
    }

    let leftNear = 범위최소거리(1, 3)
    let rightNear = 범위최소거리(4, 6)
    if (leftNear == 0) leftNear = 회피시작거리mm
    if (rightNear == 0) rightNear = 회피시작거리mm

    let steer = 0
    if (centerNear > 0 && centerNear < 회피시작거리mm) {
        steer = 제한값(Math.round((leftNear - rightNear) * 조향최대보정 / 회피시작거리mm), -조향최대보정, 조향최대보정)
        상태 = "CURVE"
    } else if ((leftNear > 0 && leftNear < 통로측면거리mm) || (rightNear > 0 && rightNear < 통로측면거리mm)) {
        steer = 제한값(Math.round((leftNear - rightNear) * 통로보정최대 / 통로측면거리mm), -통로보정최대, 통로보정최대)
        base = 저속전진속도
        상태 = "PASS"
    } else {
        상태 = "RUN"
    }
    전진명령(base - steer, base + steer)
    basic.showArrow(ArrowNames.North)
}

function 정지감지됨(): boolean {
    let now = input.runningTime()
    if (!마지막명령전진 || now - 마지막정지감지시각 < 정지감지주기ms) return false
    마지막정지감지시각 = now
    let left = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
    let right = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
    return left <= 정지감지속도기준 && right <= 정지감지속도기준
}

function 점수용거리(d: number): number {
    if (d == 0 || d > 열린거리상한mm) return 열린거리상한mm
    return d
}

function 정밀탐색점수(): number {
    전체장면읽기()
    let score = 0
    for (let col = 0; col < 8; col++) {
        let weight = 1
        if (col >= 2 && col <= 5) weight = 3
        score += 점수용거리(열거리[col]) * weight
        if (열거리[col] > 0 && 열거리[col] < 정지거리mm) {
            score -= 900
        }
    }
    for (let col2 = 1; col2 <= 6; col2++) {
        let d2 = 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, col2, 7))
        if (d2 > 0 && d2 < 아래행위험거리mm) score -= 1200
    }
    return score
}

function 후보삽입(각목록: number[], 점수목록: number[], 각도: number, 점수: number): void {
    for (let i = 0; i < 정밀탐색후보수; i++) {
        if (점수 > 점수목록[i]) {
            for (let j = 정밀탐색후보수 - 1; j > i; j--) {
                점수목록[j] = 점수목록[j - 1]
                각목록[j] = 각목록[j - 1]
            }
            점수목록[i] = 점수
            각목록[i] = 각도
            return
        }
    }
}

function 탐색후보선택(후보각: number[], 후보점수: number[]): number {
    let 선택범위 = 0
    for (let k = 0; k < 정밀탐색후보수; k++) {
        if (후보점수[k] > -999000) 선택범위 += 1
    }
    if (선택범위 <= 0) 선택범위 = 1
    let 선택 = randint(0, 선택범위 - 1)
    return 후보각[선택]
}

function 부분탐색(모드: number): void {
    상태 = "SCAN" + 모드
    lcd표시(true)
    basic.showIcon(IconNames.Diamond)
    let 후보각 = [0, 0, 0, 0, 0]
    let 후보점수 = [-999999, -999999, -999999, -999999, -999999]
    let 현재각 = 0
    후보삽입(후보각, 후보점수, 현재각, 정밀탐색점수())

    let 방향 = 1
    let 단계수 = 3
    if (모드 == 2) {
        방향 = -1
        단계수 = 3
    } else if (모드 == 3) {
        방향 = -1
        단계수 = 6
    } else if (모드 == 4) {
        방향 = 1
        단계수 = 5
    }

    for (let i = 1; i <= 단계수; i++) {
        각도회전(방향, 정밀탐색간격도)
        현재각 += 정밀탐색간격도
        후보삽입(후보각, 후보점수, 방향 * 현재각, 정밀탐색점수())
    }
    각도회전(0 - 방향, 정밀탐색간격도 * 단계수)

    let 목표각 = 탐색후보선택(후보각, 후보점수)
    마지막선택각 = 목표각
    if (목표각 != 0) {
        각도회전(목표각 > 0 ? 1 : -1, Math.abs(목표각))
    }
}

function 정밀탐색360세밀(): void {
    상태 = "SCAN360"
    lcd표시(true)
    basic.showIcon(IconNames.Diamond)
    let 후보각 = [0, 0, 0, 0, 0]
    let 후보점수 = [-999999, -999999, -999999, -999999, -999999]
    let 현재각 = 0
    후보삽입(후보각, 후보점수, 현재각, 정밀탐색점수())

    for (let i = 1; i <= 12; i++) {
        각도회전(1, 정밀탐색간격도)
        현재각 += 정밀탐색간격도
        if (현재각 > 180) 현재각 -= 360
        후보삽입(후보각, 후보점수, 현재각, 정밀탐색점수())
    }

    let 큰목표각 = 탐색후보선택(후보각, 후보점수)
    if (큰목표각 != 0) {
        각도회전(큰목표각 > 0 ? 1 : -1, Math.abs(큰목표각))
    }

    상태 = "FINE"
    lcd표시(true)
    let 세밀후보각 = [0, 0, 0, 0, 0]
    let 세밀후보점수 = [-999999, -999999, -999999, -999999, -999999]
    후보삽입(세밀후보각, 세밀후보점수, 0, 정밀탐색점수())

    for (let leftStep = 1; leftStep <= 3; leftStep++) {
        각도회전(-1, 세밀탐색간격도)
        후보삽입(세밀후보각, 세밀후보점수, 0 - leftStep * 세밀탐색간격도, 정밀탐색점수())
    }
    각도회전(1, 세밀탐색간격도 * 3)
    for (let rightStep = 1; rightStep <= 3; rightStep++) {
        각도회전(1, 세밀탐색간격도)
        후보삽입(세밀후보각, 세밀후보점수, rightStep * 세밀탐색간격도, 정밀탐색점수())
    }
    각도회전(-1, 세밀탐색간격도 * 3)

    let 세밀목표각 = 탐색후보선택(세밀후보각, 세밀후보점수)
    마지막선택각 = 큰목표각 + 세밀목표각
    if (세밀목표각 != 0) {
        각도회전(세밀목표각 > 0 ? 1 : -1, Math.abs(세밀목표각))
    }
}

function 탐색복구(): void {
    부분탐색횟수 += 1
    if (부분탐색횟수 >= 부분탐색한계) {
        마지막탐색모드 = 9
        정밀탐색360세밀()
        부분탐색횟수 = 0
        부분탐색한계 = randint(부분탐색최소한계, 부분탐색최대한계)
    } else {
        마지막탐색모드 = randint(1, 4)
        부분탐색(마지막탐색모드)
    }
    실패연속 = 0
    막힘연속 = 0
    아래행위험연속 = 0
}

input.onButtonPressed(Button.B, function () {
    주행중 = !(주행중)
    if (주행중) {
        상태 = "RUN"
        현재속도 = 시작전진속도
        막힘연속 = 0
        아래행위험연속 = 0
        실패연속 = 0
        마지막회전방향 = 0
        같은방향회전수 = 0
        부분탐색횟수 = 0
        부분탐색한계 = randint(부분탐색최소한계, 부분탐색최대한계)
        마지막탐색모드 = 0
        마지막선택각 = 0
        마지막정지감지시각 = input.runningTime()
        마지막명령전진 = false
        basic.showIcon(IconNames.Happy)
        lcd표시(true)
    } else {
        상태 = "STOP"
        정지()
        basic.showIcon(IconNames.Target)
        lcd표시(true)
    }
})

basic.forever(function () {
    if (!주행중) {
        lcd표시(false)
        basic.pause(100)
        return
    }

    핵심장면읽기()

    if (아래행위험읽기() || 긴급근접위험()) {
        상태 = "DANGER"
        현재속도 = 시작전진속도
        실패연속 += 1
        회피회전(false)
    } else if (정지감지됨()) {
        상태 = "STALL"
        현재속도 = 시작전진속도
        실패연속 += 정밀탐색실패한계
        회피회전(true)
    } else if (정면막힘확정()) {
        상태 = "BLOCK"
        현재속도 = 시작전진속도
        실패연속 += 1
        회피회전(false)
    } else {
        if (실패연속 > 0) 실패연속 -= 1
        자연회피전진()
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})

lcd지우기()
lcd표시(true)
basic.showIcon(IconNames.Target)
```

## 조정 기준

| 값 | 기본값 | 조정할 때 |
|---|---:|---|
| `판정행끝` | 4 | 바닥 때문에 자주 막힌다고 판단하면 3으로 낮춤 |
| `정지거리mm` | 170 | 너무 가까이 붙으면 200~240으로 올림 |
| `회피시작거리mm` | 240 | 더 가까이 붙은 뒤 피하려면 낮추고, 더 일찍 피하려면 올림 |
| `아래행위험거리mm` | 120 | `y=7` 아래 행 근접 위험 기준. 빈 공간에서도 자주 반응하면 낮춤 |
| LCD `Y7 L/C/R` | 좌/중/우 아래 행 최소값 | `아래행위험거리mm`를 맞출 때 참고. 0은 유효값 없음 |
| `통로측면거리mm` | 200 | 좁은 통로에서 벽에 닿지 않게 보정하기 시작하는 측면 거리 |
| `시작전진속도` | 45 | 출발이 안 되면 50, 너무 빠르면 40 |
| `최고전진속도` | 80 | 너무 빠르면 65~70 |
| `기본회전각도` | 45 | 일반 회피 각도 |
| `큰회전각도` | 75 | 반복 막힘에서 더 크게 도는 각도 |
| `좌우점수차이한계` | 120 | 좌우가 비슷할 때 최근 실패 반대 방향을 더 쉽게 쓰려면 값을 올림 |
| `정밀탐색실패한계` | 4 | 이 횟수 이상 실패하면 부분 탐색 또는 360도 정밀 탐색 |
| `부분탐색한계` | 1~10 랜덤 | 이 횟수만큼 부분 탐색 후 360도+10도 정밀 탐색 |
