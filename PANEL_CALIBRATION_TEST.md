# 차폭 패널 보정 테스트 스크립트 (데이터 수집 전용)

`docs/superpowers/specs/2026-06-20-panel-calibration-test-design.md` 설계를
구현한 1회성 벤치 테스트 스크립트. 메인 자율주행 코드와는 완전히 분리되어
있다.

## 이 스크립트는 "계산"을 하지 않는다

이 스크립트의 역할은 **raw 데이터 수집·전송**까지다. 폭 인식 거리,
보정값(기울기/오프셋), 각도가 적절한지 같은 **판단/계산은 마이크로비트가
아니라 사람(또는 이 로그를 받은 쪽)이 한다.** 그래서 코드에는 의도적으로
다음이 없다:

- 컬럼이 "패널 위에 있는지" 판정하거나 좌/우 인식 폭(mm)을 계산하는 로직
- 거리 보정값(선형회귀 등)을 구하는 로직
- 각도가 OK인지 NG인지 판정하는 로직(`각도진단` 같은 임계값 비교)
- 점프 감지, 최소인식거리, MaxErr 같은 통계 계산

마이크로비트는 그냥 매 스텝 8개 컬럼의 raw 라이다 값 + 초음파 값을
명령거리와 함께 한 줄로 보내고, 각도 체크 단계에서는 raw 샘플 리스트만
보낸다. 이 로그를 그대로 전달하면 그 다음 분석/계산은 받는 쪽에서
한다.

**예외**: 아래 "라이더 기울기 실시간 보정" 모드(로고 터치)는 위
원칙과 달리 `DIFF`(목표거리와의 차이)와 `SPREAD`(컬럼 간 편차) 두
숫자를 계산해서 LCD에 보여준다. 이건 무선 왕복 없이 그 자리에서 손으로
기울기를 조절하며 즉시 피드백을 받기 위한 것이지 자동 판정이 아니다 —
OK/NG 표시는 하지 않고 숫자만 보여주며, "맞다/틀리다"는 사람이 직접
판단한다. 두 숫자 모두 센서 장착 높이와 후진거리를 기반으로 한
근사값이라 그렇다.

## 한 시행(스텝)당 한 줄 로그 + 19자 한도 처리

micro:bit `radio.sendString`은 한 번에 **최대 19자**까지만 보낼 수 있다.
그래서 `로그()`는 내용을 19자 단위로 잘라 여러 패킷으로 보내고, 마지막
패킷 끝에 종료 문자 `$`를 붙인다. **수신기**는 `$`가 나올 때까지 받은
조각들을 이어붙였다가 한 번에 한 줄로 출력하므로, 보내는 쪽 길이에
상관없이 콘솔에는 **시행(스텝)당 한 줄**로 보인다. 이 프로토콜을 쓰려면
아래 "무선 디버그 수신기" 코드를 반드시 같이 써야 한다(기존 단순
패스스루 수신기와는 호환되지 않는다).

테스트는 **두 번의 B 버튼 입력**으로 단계가 나뉜다. 갑자기 패널 테스트가
시작되어 놀라는 일이 없도록, 각도 데이터 수집과 패널 테스트는 각각
별도의 B 버튼 입력을 받아야 시작된다.

1. **1차 B 버튼**: 빈 바닥(라이더 높이 140mm 기준)에서 각도 관련 raw
   샘플(Y5/Y6/Y7/좌하단/우하단 지점들)을 모아 그대로 라디오로 보낸다.
   OK/NG 판정은 하지 않는다 — 이 raw 값을 받은 쪽에서 각도가 적절한지
   판단한다. 전송이 끝나면 항상 다음 단계(패널 테스트 대기)로 넘어간다.
2. **2차 B 버튼**: 3·2·1 카운트다운 후 패널 보정 테스트(0~30cm, 1cm
   스텝)가 시작된다. 1차 버튼을 누르지 않으면 시작되지 않는다.
3. **A+B 동시 버튼**: 위 두 단계와 독립적으로, 로봇을 패널 앞 원하는
   고정 거리에 손으로 놓은 뒤 누르면 그 자리에서 좌우로 `±45도`를
   `5도`씩 회전하며 매 각도마다 raw 데이터를 보낸다(회전이 끝나면
   원래 방향으로 되돌아온다). 회전 중 차폭/패널 인식이 어떻게
   변하는지(턴할 때 옆면이 걸릴 만한 각도 범위)를 보기 위한 데이터로,
   사람이 직접 손으로 좌우로 미는 대신 로봇이 실제 턴 동작과 같은
   방식(`pidControlAngle`)으로 회전하며 측정한다.

매 스텝 측정은 노이즈를 줄이기 위해 8x8 그리드를 10회 반복 읍어 median을
취하므로(이건 판단이 아니라 기본적인 노이즈 제거다) 전체 테스트 시간이
다소 길어진다. 진행 상황은 라디오 로그 외에도 LCD(컬러 LCD, 메인 코드와
동일한 I2C 주소 0x2c)에 실시간으로 표시된다(여기도 판단 없이 측정값만
보여준다).

## 사용 방법

1. 5cm 정육면체 9개로 가로15×높이15×두께5cm 패널을 세워 바닥에 고정한다.
2. 로봇을 패널 정면 중앙 근처, 거리 0(코를 맞댄 상태)에 둔다. 정확히
   한가운데 맞출 필요는 없다.
3. 아래 "차폭 패널 보정 테스트" 코드를 새 MakeCode 프로젝트에 붙여넣고
   다운로드한다.
4. 아래 "무선 디버그 수신기" 코드를 **별도의** 새 MakeCode 프로젝트에
   붙여넣어 다른 마이크로비트에 다운로드하고 USB로 PC에 연결한다(같은
   라디오 그룹 77, 콘솔 탭에서 로그 확인).
5. **1차 B 버튼**을 눌러 각도 raw 데이터 수집을 시작한다. 이 단계에서는
   패널을 잠시 치우고 로봇 앞을 빈 바닥(또는 장애물 없는 상태)으로 두는
   것을 권장한다.
6. 전송이 끝나면(LCD에 "DATA SENT") 패널을 다시 정위치에 놓고, **2차 B
   버튼**을 눌러 본 테스트를 시작한다.
7. 진행 중 비상 정지가 필요하면 A 버튼을 누른다 — 즉시 모터를 멈추고
   테스트를 중단한다.
8. 콘솔에 찍힌 로그를 그대로 복사해서 분석을 요청한다.
9. 라이더 기울기를 손으로 조절하고 싶다면, 로봇을 패널(또는 임의의
   평평한 면) 앞에 두고 **로고를 터치**한다. 로봇이 자동으로 10cm
   후진한 뒤 LCD에 최하단 행 raw 값과 `DIFF`/`SPREAD` 숫자가 실시간으로
   갱신된다. 기울기를 조절하며 두 숫자를 참고하고, 끝나면 **A 버튼**을
   눌러 종료한다(다른 모드가 진행 중일 때는 로고 터치가 무시된다).

```typescript
// ===== 차폭 패널 LiDAR/초음파 데이터 수집 (계산 없음) =====
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라디오그룹 = 77
const 최대거리cm = 30
const 그리드샘플반복 = 10
const LCD주소 = 0x2c
const LCD맵칸쓰기지연ms = 5
const 기본라이더높이mm = 140
const 각도체크반복 = 5
const 로그송신지연ms = 4
const 회전테스트범위도 = 45
const 회전테스트스텝도 = 5
const 보정후진거리cm = 10
const 보정후진거리mm = 100
const 거리허용오차mm = 15
const 컬럼편차참고mm = 10
const 목표거리mm = Math.round(Math.sqrt(보정후진거리mm * 보정후진거리mm + 기본라이더높이mm * 기본라이더높이mm))
const 기울기갱신지연ms = 150

radio.setGroup(라디오그룹)
radio.setTransmitPower(7)

let 시작됨 = false
let 중단요청 = false
let 각도데이터전송됨 = false

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

function 지점읽기(x: number, y: number): number {
    return matrixLidarDistance.matrixPointOutput(라이다주소, x, y)
}

function 로그(내용: string): void {
    // radio.sendString은 한 번에 최대 19자까지만 보낼 수 있다(micro:bit
    // 라디오 한계). 19자 단위로 잘라 여러 패킷으로 보내고, 마지막 패킷
    // 끝에 종료 문자 "$"를 붙인다. 수신기는 "$"가 나올 때까지 받은
    // 조각을 이어붙였다가 한 번에 한 줄로 출력하므로, 보내는 쪽에서는
    // 길게 써도 콘솔에는 시행(스텝)당 한 줄로 보인다.
    let 위치 = 0
    while (true) {
        let 남음 = 내용.length - 위치
        if (남음 <= 18) {
            radio.sendString(내용.substr(위치, 남음) + "$")
            basic.pause(로그송신지연ms)
            break
        } else {
            radio.sendString(내용.substr(위치, 19))
            basic.pause(로그송신지연ms)
            위치 += 19
        }
    }
}

function 목록문자열(목록: number[]): string {
    let 결과 = ""
    for (let i = 0; i < 목록.length; i++) {
        if (i > 0) 결과 += ","
        결과 += 목록[i]
    }
    return 결과 == "" ? "none" : 결과
}

// ----- LCD 헬퍼 (메인 코드 AUTONOMOUS_WANDER_EXAMPLE.md와 동일) -----
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

function lcd대기표시(): void {
    lcd문자(1, 8, 16, "PANEL DATA TEST", 0x000000)
    lcd문자(2, 8, 54, "HEIGHT " + 기본라이더높이mm + "mm", 0x0000ff)
    lcd문자(3, 8, 92, "B = ANGLE DATA", 0x008000)
    lcd문자(4, 8, 130, "A = ABORT WHILE RUN", 0xaa00aa)
    lcd문자(5, 8, 168, "", 0x000000)
}

function lcd패널테스트대기표시(): void {
    lcd문자(1, 8, 16, "ANGLE DATA SENT", 0x008000)
    lcd문자(2, 8, 54, "PUT PANEL BACK", 0x0000ff)
    lcd문자(3, 8, 92, "B = START PANEL TEST", 0x008000)
    lcd문자(4, 8, 130, "A = ABORT WHILE RUN", 0xaa00aa)
    lcd문자(5, 8, 168, "", 0x000000)
}

function lcd각도수집중표시(): void {
    lcd문자(1, 8, 16, "ANGLE DATA...", 0x000000)
    lcd문자(2, 8, 54, "EMPTY FLOOR", 0x0000ff)
    lcd문자(3, 8, 92, "", 0x000000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "", 0x000000)
}

function lcd스텝표시(스텝번호: number, 기대거리mm: number, 초음파값: number): void {
    lcd문자(1, 8, 16, "STEP " + 스텝번호 + "/" + 최대거리cm + " EXP " + 기대거리mm + "mm", 0x000000)
    lcd문자(2, 8, 54, "USON " + 초음파값 + "mm", 0x0000ff)
    lcd문자(3, 8, 92, "SENDING...", 0x008000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "", 0x000000)
}

function lcd요약표시(): void {
    lcd문자(1, 8, 16, "DONE", 0x000000)
    lcd문자(2, 8, 54, "ALL STEPS SENT", 0x0000ff)
    lcd문자(3, 8, 92, "", 0x000000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "SEE RADIO LOG", 0xff8800)
}

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

// ----- 라이더 각도 raw 데이터 수집 (판정 없음) -----
function 각도데이터수집(): void {
    lcd각도수집중표시()
    로그("ANGLE CHECK H" + 기본라이더높이mm)

    let y5목록: number[] = []
    let y6목록: number[] = []
    let y7목록: number[] = []
    let 좌목록: number[] = []
    let 우목록: number[] = []

    for (let n = 0; n < 각도체크반복; n++) {
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
        basic.pause(50)
    }

    // 판정 없이 raw 샘플 그대로 전송 — 각도가 적절한지는 이 데이터를
    // 받은 쪽에서 판단한다.
    로그("AY5=" + 목록문자열(y5목록))
    로그("AY6=" + 목록문자열(y6목록))
    로그("AY7=" + 목록문자열(y7목록))
    로그("AL=" + 목록문자열(좌목록))
    로그("AR=" + 목록문자열(우목록))

    // 라이더가 바닥을 얼마나 보는지 판단할 수 있도록, 현재 높이(140mm
    // 고정)에서 8x8 전역 raw 그리드도 행 단위로 통째로 보낸다(8줄).
    // 판정 없음 — 어느 행/컬럼이 바닥을 보는지는 받는 쪽에서 본다.
    let 바닥샘플들 = 그리드3회읍기()
    let 바닥그리드 = 중앙값그리드(바닥샘플들)
    for (let y = 0; y < 8; y++) {
        let 줄 = "GRD" + y
        for (let x = 0; x < 8; x++) 줄 += "," + 바닥그리드[y][x]
        로그(줄)
    }

    lcd패널테스트대기표시()
}

function 스텝측정(스텝번호: number): void {
    let 샘플들 = 그리드3회읍기()
    let 그리드 = 중앙값그리드(샘플들)
    let 기대거리mm = 스텝번호 * 10

    let 초음파cm = maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)
    let 초음파값 = Math.round(초음파cm * 10)

    lcd스텝표시(스텝번호, 기대거리mm, 초음파값)

    // 판정/계산 없이 8개 컬럼(행3,4의 median) raw 값 + 초음파 값을
    // 명령거리와 함께 한 줄(CSV)로 보낸다:
    // S{step},{exp},{col0},{col1},...,{col7},{uson}
    let 행 = "S" + 스텝번호 + "," + 기대거리mm
    for (let col = 0; col < 8; col++) {
        행 += "," + 구역median(그리드, [col], [3, 4])
    }
    행 += "," + 초음파값
    로그(행)
}

function 로봇초기화_테스트(): void {
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(라이다주소, matrixLidarDistance.Matrix.MAT)
    basic.pause(500)
    lcd지우기()
    로그("CALTEST BOOT")
    basic.showIcon(IconNames.Target)
    lcd대기표시()
}

function 각도체크시작(): void {
    시작됨 = true
    중단요청 = false

    각도데이터수집()

    각도데이터전송됨 = true
    basic.showIcon(IconNames.Yes)
    시작됨 = false
}

function 패널테스트시작(): void {
    시작됨 = true
    중단요청 = false
    각도데이터전송됨 = false

    로그("CALTEST START")
    lcd문자(1, 8, 16, "CALIBRATING", 0x000000)
    lcd문자(2, 8, 54, "3 2 1", 0x0000ff)
    for (let n = 3; n > 0; n--) {
        basic.showNumber(n)
        basic.pause(700)
    }
    basic.clearScreen()

    for (let 스텝 = 0; 스텝 <= 최대거리cm; 스텝++) {
        if (중단요청) {
            maqueenPlusV2.pidControlStop()
            로그("ABORT step=" + 스텝)
            basic.showIcon(IconNames.No)
            basic.pause(500)
            basic.clearScreen()
            lcd대기표시()
            시작됨 = false
            return
        }
        if (스텝 > 0) {
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 1, maqueenPlusV2.MyInterruption.NotAllowed)
        }
        basic.showNumber(스텝)
        스텝측정(스텝)
        basic.pause(150)
    }

    lcd요약표시()
    basic.showIcon(IconNames.Yes)
    로그("CALTEST DONE")
    시작됨 = false
}

// ----- 회전(턴) 테스트: 로봇을 손으로 패널 앞 원하는 거리에 놓고
// AB 버튼을 누르면, 그 자리에서 좌우로 회전하며 매 각도 스텝마다
// raw 데이터를 보낸다. 판정 없음 — 회전 중 차폭/패널 인식이 어떻게
// 변하는지는 받는 쪽에서 분석한다. 끝나면 원래 방향으로 되돌아온다.
function 회전스텝측정(인덱스: number, 각도: number): void {
    let 샘플들 = 그리드3회읍기()
    let 그리드 = 중앙값그리드(샘플들)
    let 초음파cm = maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)
    let 초음파값 = Math.round(초음파cm * 10)

    // R{idx},{angle},{col0}..{col7},{uson}
    let 행 = "R" + 인덱스 + "," + 각도
    for (let col = 0; col < 8; col++) {
        행 += "," + 구역median(그리드, [col], [3, 4])
    }
    행 += "," + 초음파값
    로그(행)
}

function 회전테스트시작(): void {
    if (시작됨) return
    시작됨 = true
    중단요청 = false

    로그("ROTTEST START")
    lcd문자(1, 8, 16, "ROTATE TEST", 0x000000)
    lcd문자(2, 8, 54, "FIXED DISTANCE", 0x0000ff)
    lcd문자(3, 8, 92, "RANGE +-" + 회전테스트범위도, 0x008000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "", 0x000000)

    let 누적각도 = -회전테스트범위도
    maqueenPlusV2.pidControlAngle(-회전테스트범위도, maqueenPlusV2.MyInterruption.NotAllowed)
    let idx = 0
    basic.showNumber(idx)
    회전스텝측정(idx, 누적각도)

    let 총스텝수 = Math.idiv(2 * 회전테스트범위도, 회전테스트스텝도)
    for (let i = 0; i < 총스텝수; i++) {
        if (중단요청) break
        maqueenPlusV2.pidControlAngle(회전테스트스텝도, maqueenPlusV2.MyInterruption.NotAllowed)
        누적각도 += 회전테스트스텝도
        idx += 1
        basic.showNumber(idx)
        회전스텝측정(idx, 누적각도)
        basic.pause(100)
    }

    // 원래 방향으로 복귀
    maqueenPlusV2.pidControlAngle(-누적각도, maqueenPlusV2.MyInterruption.NotAllowed)

    로그("ROTTEST DONE")
    basic.showIcon(IconNames.Yes)
    basic.pause(300)
    basic.clearScreen()
    lcd대기표시()
    시작됨 = false
}

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

input.onButtonPressed(Button.AB, function () {
    회전테스트시작()
})

input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    기울기보정시작()
})

input.onButtonPressed(Button.B, function () {
    if (시작됨) return
    if (각도데이터전송됨) 패널테스트시작()
    else 각도체크시작()
})

input.onButtonPressed(Button.A, function () {
    if (시작됨) {
        중단요청 = true
        maqueenPlusV2.pidControlStop()
    }
})

로봇초기화_테스트()
```

## 무선 디버그 수신기 (새 프로젝트, 별도 마이크로비트)

위 본체 코드는 종료 문자(`$`)로 끝나는 조각들을 19자씩 잘라 보낸다.
아래 수신기는 `$`가 나올 때까지 조각을 이어붙였다가 한 번에 한 줄로
출력한다 — 그래서 결과적으로 **시행(스텝)당 한 줄**이 콘솔에 찍힌다.
기존 `AUTONOMOUS_WANDER_EXAMPLE.md`의 단순 패스스루 수신기와는 다르니,
이 테스트에는 아래 버전을 새 프로젝트로 따로 써야 한다.

```typescript
// ===== 무선 디버그 수신기 (패널 보정 테스트 전용, USB로 PC에 연결) =====
radio.setGroup(77)
radio.setTransmitPower(7)

serial.writeLine("===== RADIO DEBUG RECEIVER READY (group 77) =====")

let 버퍼 = ""

radio.onReceivedString(function (받은조각: string) {
    let 종료위치 = 받은조각.indexOf("$")
    if (종료위치 >= 0) {
        버퍼 += 받은조각.substr(0, 종료위치)
        serial.writeLine(버퍼)
        버퍼 = ""
    } else {
        버퍼 += 받은조각
    }
})

basic.showIcon(IconNames.Target)
```

## 로그 형식 설명 (raw 데이터만, 판단 없음)

- `ANGLE CHECK H140` — 1차 B 버튼 시작 표시.
- `AY5=...`/`AY6=...`/`AY7=...`/`AL=...`/`AR=...` — 각도 관련 raw 샘플
  리스트(쉼표 구분). `Y5`는 행5(컬럼3,4), `Y6`은 행6, `Y7`은 행7, `L`은
  컬럼1의 행6/7, `R`은 컬럼6의 행6/7 raw 값들이다. **각도가 적절한지는
  이 리스트를 보고 판단해야 한다** — 기기는 판정하지 않는다.
- `GRD0`~`GRD7` — 1차 B 버튼 시 함께 전송되는 8x8 전역 raw 그리드(행
  단위 8줄, 각 줄에 그 행의 컬럼 0~7 값이 쉼표로 나열). 라이더가
  바닥을 어디까지 보는지(어느 행/컬럼이 바닥 거리처럼 짧게 잡히는지)는
  이 값을 보고 판단한다 — 기기는 판정하지 않는다.
- `Sn,exp,col0,col1,col2,col3,col4,col5,col6,col7,uson` — 패널 테스트
  스텝마다 한 줄(CSV). `exp`는 명령거리(mm), `col0`~`col7`은 그 스텝에서
  8x8 그리드의 행3/4 median을 컬럼별로 뽑은 raw 값(mm), `uson`은 초음파
  raw 값(mm). 폭 인식 거리·보정값·오차 같은 건 전혀 계산하지 않으니,
  이 CSV를 그대로 전달하면 받는 쪽에서 분석한다.
- `ROTTEST START`/`ROTTEST DONE` — A+B 버튼 회전 테스트 시작/종료 표시.
- `Rk,angle,col0,col1,col2,col3,col4,col5,col6,col7,uson` — 회전
  테스트 각 각도 스텝마다 한 줄(CSV). `angle`은 시작 방향(0도) 기준
  누적 회전각(도, `-45`~`+45`), 나머지 필드는 위 `Sn` 줄과 동일한
  의미다. 로봇을 패널 앞 어떤 고정 거리에 두고 돌렸는지는 기록되지
  않으니, 실행 전 거리를 메모해 두고 분석 요청 시 같이 알려준다.
- `CALTEST BOOT`/`CALTEST START`/`CALTEST DONE`/`ABORT step=N` — 진행
  상태 표시용 로그(판단 아님).
- **라이더 기울기 보정 LCD (라디오 전송 없음)** — 로고 터치 후 LCD에
  `TILT CAL` / 8개 raw 값(공백 구분) / `DIFF ±Nmm`(최하단 행 median과
  목표거리 약 172mm의 차이, 부호로 방향 힌트) / `SPREAD Nmm`(8개 컬럼
  중 유효값의 최대-최소 편차) / `A=STOP`이 150ms 주기로 갱신된다. 라디오
  로그에는 나타나지 않는다 — 이 모드는 로컬 LCD 전용이다.

## 실행 전 준비물

- 5cm 정육면체 나무 블록 9개 (또는 동일 규격 패널)를 3x3로 쌓아 가로15cm
  × 높이15cm × 두께5cm 패널을 만들어 세워서 바닥에 고정한다 (로봇에는
  붙이지 않음).
- 로봇을 패널 정면 중앙 근처에 두면 된다 — 정확히 한가운데 맞출 필요는
  없다.
- 각도 데이터 수집 단계에서는 로봇 전방이 빈 바닥(또는 패널이 치워진
  상태)이어야 한다.
- 라이더 높이는 물리적으로 140mm(`기본라이더높이mm`)에 맞춰 둔다 — 이
  스크립트에는 높이 조절 기능이 없다. **이 스크립트의 A+B 동시 버튼은
  높이 조절이 아니라 회전 테스트 시작 버튼이다** — 메인 자율주행
  코드(`AUTONOMOUS_WANDER_EXAMPLE.md`)의 A+B 높이 조절과는 다른
  동작이니 혼동하지 않는다.
- 줄자 또는 바닥 표시로 0, 10, 20, 30cm 지점을 미리 표시해둔다.
- 회전 테스트(A+B)를 하려면 로봇을 패널 앞 원하는 고정 거리에 손으로
  맞춰 두고, **그 거리(mm)를 따로 메모**해 둔다(로그에 거리가 자동으로
  기록되지 않는다).
- 수신기는 위 "무선 디버그 수신기" 코드를 **새 프로젝트로** 별도
  마이크로비트에 올려서 USB로 PC에 연결한다(기존 패스스루 수신기와는
  프로토콜이 다르므로 재사용 불가).
- 라이더 기울기를 손으로 맞추고 싶다면 로고를 터치하면 된다(micro:bit
  V2 로고 터치센서 필요). 10cm 후진 후 LCD의 `DIFF`/`SPREAD` 값을 참고
  기준으로 삼되, 두 값 모두 근사값이므로 대략 `DIFF`가 0에 가깝고
  `SPREAD`가 한 자리 수(`거리허용오차mm`=15, `컬럼편차참고mm`=10
  안쪽)면 충분하다고 보면 된다 — 정확한 기준값을 정해주는 게 아니라
  참고용 숫자다.

## 실행 후 하드웨어 검증 체크리스트

- [ ] 부팅 직후 5x5 매트릭스에 대기 아이콘, LCD에 "PANEL DATA TEST /
      HEIGHT 140mm / B = ANGLE DATA"가 표시되는가.
- [ ] **1차 B 버튼**을 누르면 LCD에 "ANGLE DATA... / EMPTY FLOOR"가
      표시되고, 콘솔에 `ANGLE CHECK H140`, `AY5=...`~`AR=...` 5줄,
      `GRD0`~`GRD7` 8줄(전역 그리드)이 한 줄씩(여러 패킷이 합쳐져서)
      끊김 없이 찍히는가.
- [ ] 전송이 끝나면 LCD에 "ANGLE DATA SENT / B = START PANEL TEST"가
      표시되고, 이때까지는 패널 테스트(카운트다운/후진)가 시작되지
      않는가.
- [ ] **2차 B 버튼**을 누르면 3, 2, 1 숫자가 순서대로 표시되며 본
      테스트가 시작되는가(콘솔에 `CALTEST START`).
- [ ] 진행 중 A 버튼을 누르면 모터가 즉시 멈추고 콘솔에 `ABORT step=N`이
      찍히는가.
- [ ] 각 스텝마다 콘솔에 `Sn,exp,col0,...,col7,uson` 형태의 **한
      줄짜리 CSV**(필드 11개)가 끊김 없이 찍히는가(31스텝이면 31줄).
- [ ] LCD에 매 스텝 `STEP n/30`, `USON ...mm`이 실시간으로 갱신되는가
      (판정 문구 없이 측정값만 보이는지 확인 — `WIDTH OK` 같은 판단
      문구가 없어야 정상).
- [ ] 테스트 종료 시 콘솔에 `CALTEST DONE`이 찍히고 LCD에 "DONE / ALL
      STEPS SENT"가 표시되는가(SUM/통계 줄이 없어야 정상).
- [ ] **A+B 동시 버튼**(시작됨이 false일 때)을 누르면 콘솔에 `ROTTEST
      START`가 찍히고, 로봇이 제자리에서 좌측으로 45도 회전한 뒤 5도씩
      19번 회전하며 `Rk,angle,col0,...,col7,uson` 형태의 한 줄짜리
      CSV가 매 각도 스텝마다 찍히는가(`angle`이 -45에서 +45까지
      5도씩 증가).
- [ ] 회전 테스트가 끝나면 로봇이 원래(0도) 방향으로 되돌아오고 콘솔에
      `ROTTEST DONE`이 찍히는가. 진행 중 A 버튼으로 중단하면 다음 각도
      스텝부터 멈추는가(이미 시작된 회전 1스텝은 끝까지 도는 게 정상).
- [ ] 콘솔 전체 로그(각도 raw 5줄 + GRD 8줄 + 스텝별 CSV + 필요하면
      회전 테스트 CSV)를 그대로 복사해 분석을 요청할 수 있는 상태인지
      확인한다.
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
