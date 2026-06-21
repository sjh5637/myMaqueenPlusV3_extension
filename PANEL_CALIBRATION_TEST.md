# 차폭 패널 보정 테스트 스크립트 (데이터 수집 전용)

`docs/superpowers/specs/2026-06-20-panel-calibration-test-design.md` 설계를
구현한 1회성 벤치 테스트 스크립트. 메인 자율주행 코드와는 완전히 분리되어
있다.

## 이 스크립트는 "계산"을 하지 않는다

이 스크립트의 역할은 **raw 데이터 수집·전송**까지다. 폭 인식 거리,
보정값(기울기/오프셋), 센서 장착 상태가 적절한지 같은 **판단/계산은 마이크로비트가
아니라 사람(또는 이 로그를 받은 쪽)이 한다.** 그래서 코드에는 의도적으로
다음이 없다:

- 컬럼이 "패널 위에 있는지" 판정하거나 좌/우 인식 폭(mm)을 계산하는 로직
- 거리 보정값(선형회귀 등)을 구하는 로직
- 기울기가 OK인지 NG인지 판정하는 로직(임계값 비교)
- 점프 감지, 최소인식거리, MaxErr 같은 통계 계산

마이크로비트는 그냥 매 스텝 8개 컬럼 요약, 자율주행 코드와 동일한 14개 샘플,
8x8 전체 그리드 median, 초음파 값을 명령거리와 함께 보낸다. 이 로그를 그대로 전달하면 그 다음
분석/계산은 받는 쪽에서 한다.

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

테스트는 일부러 단순하게 두 가지 수집 모드만 쓴다. LCD에는 지금 누를
버튼과 해야 할 일을 계속 표시한다.

1. **로고 터치**: 라이더 기울기 실시간 보정 모드. 로봇을 5cm 나무상자
   앞에 붙여 둔 상태에서 누르면, 먼저 10cm 후진한 뒤 LCD에 최하단 행
   8개 raw 값과 `DIFF`/`SPREAD`를 계속 보여준다. 값을 보며 사람이
   센서 기울기를 직접 맞춘다.
2. **B 버튼**: 15×15cm 나무 패널을 로봇 앞 중앙에 붙여 둔 상태에서,
   0~30cm를 1cm씩 후진하며 매 스텝마다 8개 LiDAR 컬럼 요약, 자율주행
   14개 샘플, 8x8 전체 그리드 median, 초음파 값을 라디오 로그로 보낸다.
3. **A 버튼**: PID 이동거리와 초음파 변화량 확인용 15cm 후진
   테스트.

매 스텝 측정은 노이즈를 줄이기 위해 8x8 그리드를 10회 반복 읽어 median을
취하므로(이건 판단이 아니라 기본적인 노이즈 제거다) 전체 테스트 시간이
다소 길어진다. 진행 상황은 라디오 로그 외에도 LCD(컬러 LCD, 메인 코드와
동일한 I2C 주소 0x2c)에 실시간으로 표시된다(여기도 판단 없이 측정값만
보여준다).

## 사용 방법

아래 1~3번(패널 준비, 코드 다운로드, **라이더 기울기 보정**)은 매번 새로
설치하거나 라이더를 손댔을 때 가장 먼저 끝내야 한다 — 4번부터 나오는
패널 테스트는 라이더가 물리적으로 똑바로 잡혀 있다는 전제로 동작하는
측정이라, 기울기가 안 맞은 상태로 먼저 돌리면 그 데이터 자체가 의미가
없어진다.

1. 5cm 정육면체 9개로 가로15×높이15×두께5cm 패널을 세워 바닥에 고정한다.
2. 아래 "차폭 패널 보정 테스트" 코드를 새 MakeCode 프로젝트에 붙여넣고
   로봇에 다운로드한다. 아래 "무선 디버그 수신기" 코드는 **별도의** 새
   MakeCode 프로젝트에 붙여넣어 다른 마이크로비트에 다운로드하고 USB로
   PC에 연결한다(같은 라디오 그룹 77, 콘솔 탭에서 로그 확인) — 4번
   이후부터 필요하니 지금 같이 준비해 둔다.
3. **라이더 기울기부터 맞춘다.** 로봇을 패널(또는 임의의 평평한 면) 앞에
   두고 **로고를 터치**한다. 로봇이 자동으로 10cm 후진한 뒤 LCD에
   최하단 행 raw 값과 `DIFF`/`SPREAD` 숫자가 실시간으로 갱신된다.
   라이더 기울기를 손으로 조절하며 두 숫자를 참고하고(둘 다 0/작은
   값에 가까울수록 좋다 — "실행 전 준비물" 절 참고), 끝나면 **A 버튼**을
   눌러 종료한다. 다른 모드가 진행 중일 때는 로고 터치가 무시되니, 이
   단계는 부팅 직후 가장 먼저 하면 된다.
4. 로봇을 패널 정면 중앙 근처, 거리 0(코를 맞댄 상태)에 둔다(3번에서
   10cm 후진해 있던 상태이므로 다시 옮겨야 한다). 정확히 한가운데
   맞출 필요는 없다.
5. **B 버튼**을 눌러 패널 테스트를 시작한다. 3·2·1 카운트다운 후
   0cm부터 30cm까지 1cm씩 후진하며 각 스텝 데이터를 보낸다.
6. PID/초음파만 따로 확인하고 싶으면 테스트가 진행 중이 아닐 때
   **A 버튼**을 누른다. 로봇이 15cm 후진하고, 이동 전/후 초음파 값을
   `M15B,...` 한 줄로 보낸다. 실제 이동거리는 줄자로 재서 로그와 함께
   알려주면 된다.
7. 진행 중 비상 정지가 필요하면 A 버튼을 누른다 — 즉시 모터를 멈추고
   테스트를 중단한다.
8. 콘솔에 찍힌 로그를 그대로 복사해서 분석을 요청한다.

```typescript
// ===== 차폭 패널 LiDAR/초음파 데이터 수집 (계산 없음) =====
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라디오그룹 = 77
const 최대거리cm = 30
const 그리드샘플반복 = 10
const LCD주소 = 0x2c
const LCD맵칸쓰기지연ms = 5
const 기본라이더높이mm = 145
const 로그송신지연ms = 20
const 보정후진거리cm = 10
const 상자거리mm = 100
const 센서앞오프셋mm = 55
const 보정목표수평거리mm = 상자거리mm + 센서앞오프셋mm
const 후진테스트거리cm = 15
const 거리허용오차mm = 15
const 컬럼편차참고mm = 10
const 목표거리mm = Math.round(Math.sqrt(보정목표수평거리mm * 보정목표수평거리mm + 기본라이더높이mm * 기본라이더높이mm))
const 기울기갱신지연ms = 150
const 라이다무효값mm = 4000
const 자율샘플수 = 14
const 자율기본감지거리mm = 520
const 자율정면여유mm = 85
const 자율측면여유mm = 70
const 자율긴급정지거리mm = 280
const 자율초음파긴급거리mm = 170

let 자율샘플X = [1, 1, 2, 2, 3, 4, 5, 2, 3, 4, 5, 6, 6, 5]
let 자율샘플Y = [3, 4, 5, 3, 3, 3, 3, 4, 4, 4, 4, 3, 4, 5]
let 자율샘플구역 = [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]
let 자율샘플높이 = [1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 1, 2, 2]
let 자율샘플가중치 = [1, 1, 1, 2, 3, 3, 2, 2, 3, 3, 2, 1, 1, 1]

radio.setGroup(라디오그룹)
radio.setTransmitPower(7)

let 시작됨 = false
let 중단요청 = false

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

function 유효거리(원시값: number): number {
    return 원시값 == 0 || 원시값 >= 라이다무효값mm ? 0 : 원시값
}

function 유효값인가(값: number): boolean {
    return 값 != 0 && 값 < 라이다무효값mm
}

function 지점읽기(x: number, y: number): number {
    return 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, x, y))
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
    lcd문자(3, 8, 92, "B=PANEL 0-30CM", 0x008000)
    lcd문자(4, 8, 130, "A=BACK 15CM", 0xaa00aa)
    lcd문자(5, 8, 168, "LOGO=TILT  RUN:A=STOP", 0xff8800)
}

function lcd스텝표시(스텝번호: number, 기대거리mm: number, 초음파값: number): void {
    lcd문자(1, 8, 16, "STEP " + 스텝번호 + "/" + 최대거리cm + " EXP " + 기대거리mm + "mm", 0x000000)
    lcd문자(2, 8, 54, "USON " + 초음파값 + "mm", 0x0000ff)
    lcd문자(3, 8, 92, "SENDING...", 0x008000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "A=STOP", 0xff8800)
}

function lcd요약표시(): void {
    lcd문자(1, 8, 16, "DONE", 0x000000)
    lcd문자(2, 8, 54, "ALL STEPS SENT", 0x0000ff)
    lcd문자(3, 8, 92, "", 0x000000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "SEE RADIO LOG", 0xff8800)
}

function lcd후진테스트표시(시작초음파: number, 끝초음파: number): void {
    lcd문자(1, 8, 16, "BACK 15CM DONE", 0x000000)
    lcd문자(2, 8, 54, "US BEFORE " + 시작초음파 + "mm", 0x0000ff)
    lcd문자(3, 8, 92, "US AFTER  " + 끝초음파 + "mm", 0x008000)
    lcd문자(4, 8, 130, "DELTA " + (끝초음파 - 시작초음파) + "mm", 0xaa00aa)
    lcd문자(5, 8, 168, "MEASURE REAL DIST", 0xff8800)
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
        if (유효값인가(값)) 정렬삽입(유효목록, 값)
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
    for (let n = 0; n < 샘플들.length; n++) {
        let 값 = 샘플들[n][y][x]
        if (유효값인가(값)) 정렬삽입(목록, 값)
    }
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
            let 값 = 그리드[행들[yi]][컬럼들[xi]]
            if (유효값인가(값)) 정렬삽입(목록, 값)
        }
    }
    return 중앙값(목록)
}

function 자율샘플CSV(그리드: number[][]): string {
    let 결과 = ""
    for (let i = 0; i < 자율샘플수; i++) {
        if (i > 0) 결과 += ","
        결과 += 그리드[자율샘플Y[i]][자율샘플X[i]]
    }
    return 결과
}

function 그리드행CSV(그리드: number[][], y: number): string {
    let 결과 = ""
    for (let x = 0; x < 8; x++) {
        if (x > 0) 결과 += ","
        결과 += 그리드[y][x]
    }
    return 결과
}

function 자율설정로그(): void {
    로그("CFG,AUTO,n," + 자율샘플수 + ",detect," + 자율기본감지거리mm + ",frontMargin," + 자율정면여유mm + ",sideMargin," + 자율측면여유mm + ",lidarEmg," + 자율긴급정지거리mm + ",usEmg," + 자율초음파긴급거리mm)
    로그("CFG,AUTOX," + 목록문자열(자율샘플X))
    로그("CFG,AUTOY," + 목록문자열(자율샘플Y))
    로그("CFG,AUTOZONE," + 목록문자열(자율샘플구역))
    로그("CFG,AUTOH," + 목록문자열(자율샘플높이))
    로그("CFG,AUTOW," + 목록문자열(자율샘플가중치))
}

function 스텝측정(스텝번호: number): void {
    let 샘플들 = 그리드3회읍기()
    let 그리드 = 중앙값그리드(샘플들)
    let 기대거리mm = 스텝번호 * 10

    let 초음파cm = maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)
    let 초음파값 = Math.round(초음파cm * 10)

    lcd스텝표시(스텝번호, 기대거리mm, 초음파값)

    // 판정/계산 없이 세 종류의 raw/median 값을 보낸다.
    // S: 사람이 보기 쉬운 컬럼 요약(row3/4 median)
    // A: AUTONOMOUS_WANDER_EXAMPLE.md와 동일한 14개 샘플 순서
    // G: 8x8 전체 median 그리드(row별 8줄)
    let 행 = "S" + 스텝번호 + "," + 기대거리mm
    for (let col = 0; col < 8; col++) {
        행 += "," + 구역median(그리드, [col], [3, 4])
    }
    행 += "," + 초음파값
    로그(행)

    로그("A" + 스텝번호 + "," + 기대거리mm + "," + 초음파값 + "," + 자율샘플CSV(그리드))

    for (let y = 0; y < 8; y++) {
        로그("G" + 스텝번호 + "," + 기대거리mm + "," + y + "," + 그리드행CSV(그리드, y))
    }
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

function 패널테스트시작(): void {
    시작됨 = true
    중단요청 = false

    로그("CALTEST START")
    자율설정로그()
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

function 초음파읽기mm(): number {
    let cm = maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14)
    return Math.round(cm * 10)
}

function 후진15cm테스트시작(): void {
    if (시작됨) return
    시작됨 = true
    중단요청 = false

    lcd문자(1, 8, 16, "BACK 15CM TEST", 0x000000)
    lcd문자(2, 8, 54, "MEASURE WITH RULER", 0x0000ff)
    lcd문자(3, 8, 92, "MOVING BACK...", 0x008000)
    lcd문자(4, 8, 130, "", 0x000000)
    lcd문자(5, 8, 168, "WAIT UNTIL DONE", 0xff8800)

    let 시작초음파 = 초음파읽기mm()
    로그("M15B START US" + 시작초음파)
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 후진테스트거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
    maqueenPlusV2.pidControlStop()
    let 끝초음파 = 초음파읽기mm()
    로그("M15B," + 시작초음파 + "," + 끝초음파 + "," + (끝초음파 - 시작초음파))
    lcd후진테스트표시(시작초음파, 끝초음파)
    basic.showIcon(IconNames.Yes)
    basic.pause(2500)
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

input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    기울기보정시작()
})

input.onButtonPressed(Button.B, function () {
    if (시작됨) return
    패널테스트시작()
})

input.onButtonPressed(Button.A, function () {
    if (시작됨) {
        중단요청 = true
        maqueenPlusV2.pidControlStop()
    } else {
        후진15cm테스트시작()
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

- `CFG,AUTO,...` — 자율주행 코드와 같은 샘플 좌표/구역/가중치/임계값.
  분석할 때 로그가 어떤 코드 기준으로 수집됐는지 확인하기 위한 설정 줄이다.
- `Sn,exp,col0,col1,col2,col3,col4,col5,col6,col7,uson` — 패널 테스트
  스텝마다 한 줄(CSV). `exp`는 명령거리(mm), `col0`~`col7`은 그 스텝에서
  8x8 그리드의 행3/4 median을 컬럼별로 뽑은 값(mm), `uson`은 초음파
  값(mm). 사람이 빠르게 보는 요약용이다.
- `An,exp,uson,v0,v1,...,v13` — 현재 `AUTONOMOUS_WANDER_EXAMPLE.md`의
  `샘플X/Y/구역/높이/가중치`와 같은 순서로 뽑은 14개 샘플값. 거리별
  `GO/NO`, `LIDAR_EMG`, `STABLE`, 방향검증 임계값은 이 줄로 재계산한다.
- `Gn,exp,y,c0,c1,c2,c3,c4,c5,c6,c7` — 8x8 전체 median 그리드. 한 스텝마다
  `y=0..7`까지 8줄이 나온다. 자율주행 샘플을 나중에 바꿔도 이 로그만 있으면
  다시 분석할 수 있다.
  폭 인식 거리·보정값·오차 같은 건 전혀 계산하지 않으니, 이 CSV를 그대로
  전달하면 받는 쪽에서 분석한다. LiDAR 원시값 `0` 또는 `4000` 이상은 무효거리로
  보고 median 계산에서 제외하며, 유효값이 하나도 없으면 `0`으로 기록한다.
- `M15B START USn` — A 버튼 후진 15cm 테스트가 시작될 때의 초음파 값(mm).
- `M15B,before,after,delta` — A 버튼 후진 15cm 테스트 결과 한 줄(CSV).
  `before`는 후진 전 초음파 값(mm), `after`는 후진 후 초음파 값(mm),
  `delta`는 `after - before`다. 실제 후진 거리는 줄자로 재서 이 줄과
  함께 알려주면 PID 이동 오차와 초음파 오차를 나눠서 볼 수 있다.
- `CALTEST BOOT`/`CALTEST START`/`CALTEST DONE`/`ABORT step=N` — 진행
  상태 표시용 로그(판단 아님).
- **라이더 기울기 보정 LCD (라디오 전송 없음)** — 로고 터치 후 LCD에
  `TILT CAL` / 8개 raw 값(공백 구분) / `DIFF ±Nmm`(최하단 행 median과
  목표거리의 차이, 부호로 방향 힌트; 현재 `145mm` 높이와 `100+55mm`
  수평거리 기준) / `SPREAD Nmm`(8개 컬럼 중 유효값의 최대-최소 편차) /
  `A=STOP`이 150ms 주기로 갱신된다. 라디오 로그에는 나타나지 않는다 —
  이 모드는 로컬 LCD 전용이다.

## 실행 전 준비물

- 5cm 정육면체 나무 블록 9개 (또는 동일 규격 패널)를 3x3로 쌓아 가로15cm
  × 높이15cm × 두께5cm 패널을 만들어 세워서 바닥에 고정한다 (로봇에는
  붙이지 않음).
- 로봇을 패널 정면 중앙 근처에 두면 된다 — 정확히 한가운데 맞출 필요는
  없다.
- 라이더 높이는 물리적으로 145mm(`기본라이더높이mm`)에 맞춰 둔다 — 이
  스크립트에는 높이 조절 기능이 없다.
- **기울기는 높이를 맞춘 다음, 다른 모드(B/A)를 돌리기 전에 가장 먼저**
  로고를 터치해서 맞춘다(micro:bit V2 로고 터치센서 필요). 10cm 후진 후
  LCD의 `DIFF`/`SPREAD` 값을 참고 기준으로 삼되, 두 값 모두 근사값이므로
  대략 `DIFF`가 0에 가깝고 `SPREAD`가 한 자리 수(`거리허용오차mm`=15,
  `컬럼편차참고mm`=10 안쪽)면 충분하다고 보면 된다 — 정확한 기준값을
  정해주는 게 아니라 참고용 숫자다.
- 줄자 또는 바닥 표시로 0, 10, 15, 20, 30cm 지점을 미리 표시해둔다.
- A 버튼 후진 테스트를 할 때는 실제로 움직인 거리를 줄자로 재고, 콘솔의
  `M15B,...` 줄과 함께 알려준다.
- 수신기는 위 "무선 디버그 수신기" 코드를 **새 프로젝트로** 별도
  마이크로비트에 올려서 USB로 PC에 연결한다(기존 패스스루 수신기와는
  프로토콜이 다르므로 재사용 불가).

## 실행 후 하드웨어 검증 체크리스트

- [ ] 부팅 직후 5x5 매트릭스에 대기 아이콘, LCD에 "PANEL DATA TEST /
      HEIGHT 145mm / B=PANEL 0-30CM / A=BACK 15CM / LOGO=TILT RUN:A=STOP"이
      표시되는가(로고 터치로 기울기 보정을 먼저 할 수 있다는 안내).
- [ ] **B 버튼**을 누르면 3, 2, 1 숫자가 순서대로 표시되며 본
      테스트가 시작되는가(콘솔에 `CALTEST START`).
- [ ] 진행 중 A 버튼을 누르면 모터가 즉시 멈추고 콘솔에 `ABORT step=N`이
      찍히는가.
- [ ] 각 스텝마다 콘솔에 `S`, `A`, `G` 로그가 찍히는가. 정상이라면 31스텝 기준
      `S` 31줄, `A` 31줄, `G` 248줄이 나온다.
- [ ] LiDAR가 미감지한 칸은 `4000` 대신 `0`으로 기록되거나 median 계산에서
      빠지는가. 유효값이 없는 컬럼만 `0`으로 남는가.
- [ ] LCD에 매 스텝 `STEP n/30`, `USON ...mm`이 실시간으로 갱신되는가
      (판정 문구 없이 측정값만 보이는지 확인 — `WIDTH OK` 같은 판단
      문구가 없어야 정상).
- [ ] 테스트 종료 시 콘솔에 `CALTEST DONE`이 찍히고 LCD에 "DONE / ALL
      STEPS SENT"가 표시되는가(SUM/통계 줄이 없어야 정상).
- [ ] **A 버튼**(시작됨이 false일 때)을 누르면 LCD에 "BACK 15CM
      TEST / MEASURE WITH RULER"가 표시되고, 콘솔에 `M15B START US...`와
      `M15B,before,after,delta`가 한 줄씩 찍히는가.
- [ ] A 버튼 후진 테스트 뒤 LCD에 `BACK 15CM DONE`, `US BEFORE`, `US AFTER`,
      `DELTA`, `MEASURE REAL DIST`가 표시되는가.
- [ ] A 버튼 후진 테스트의 실제 이동거리를 줄자로 재고, `M15B,...` 로그와
      함께 분석 요청에 포함할 수 있는가.
- [ ] 콘솔 전체 로그(스텝별 CSV + 필요하면 M15B 후진 테스트 CSV)를 그대로
      복사해 분석을 요청할 수 있는 상태인지
      확인한다.
- [ ] **로고를 터치**하면 로봇이 정확히 10cm 후진하는가(줄자로 대조).
      이때 다른 모드(B/A)가 진행 중이면 로고 터치가 무시되는가.
- [ ] 후진 후 LCD에 `TILT CAL`과 8개 raw 값, `DIFF ±Nmm`, `SPREAD Nmm`,
      `A=STOP`이 약 150ms 주기로 끊김 없이 갱신되는가.
- [ ] 라이더 기울기를 손으로 바꿔가며 `DIFF`가 0에 가까워지거나
      멀어지는 방향으로, `SPREAD`가 커지거나 작아지는 방향으로 눈에
      보이게 변하는가(평평하게 모서리를 볼 때 `SPREAD`가 작아지는지
      확인).
- [ ] **A 버튼**을 누르면 즉시 LCD가 대기 화면으로 돌아가는가(라디오
      콘솔에는 아무 로그도 남지 않아야 정상 — 이 모드는 LCD 전용).
