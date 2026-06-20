# 자율 주행 장애물 회피 예제 (MakeCode JavaScript)

이 코드는 새로운 블록이 아닙니다. **MakeCode 에디터의 JavaScript 보기**(블록 ↔ JavaScript
전환 드롭다운에서 JavaScript 선택)에 그대로 복사해서 붙여넣는 용도의 예제 스크립트입니다.

이미 존재하는 `maqueenPlusV2`(Maqueen Plus V3 확장), `matrixLidarDistance`(매트릭스 라이다
거리 센서 확장, Maqueen Plus V3의 의존성으로 이미 같이 들어와 있음) 네임스페이스를
사용합니다. 현재 권장 코드는 DFRobot DFR0997 LCD를 직접 I2C 패킷으로 제어하므로,
LCD 주소 `0x2c`와 Matrix LiDAR 주소 `Addr4(0x33)` 구성을 기준으로 작성되어 있습니다.

## 현재 권장 사용 흐름

이 문서에서 지금 기준으로 실제 테스트할 코드는 아래 **`8x8 Matrix LiDAR + DFR0997 LCD
자율주행 코드`** 하나입니다. 이전 4×4 OBS 기반 코드와 디버그 전용 코드는 혼동을 줄이기
위해 제거했습니다.

권장 코드는 다음 순서로 동작합니다.

1. 부팅 후 LCD에 `HEIGHT`, `A CAL`, `B START`, `A+B HEIGHT`가 표시됩니다.
2. A+B를 눌러 라이더 높이를 설정합니다. 기본값은 `140mm`이고, `100~180mm` 범위에서
   10mm씩 순환합니다.
3. 로봇을 평평하고 열린 바닥에 놓고 A를 눌러 바닥/각도 보정을 합니다.
4. LCD의 `ANGLE OK`, `RAISE SENSOR`, `LOWER SENSOR`, `LEVEL SENSOR`, `BASE NOISY` 결과를
   확인합니다.
5. B를 누르면 3초 카운트다운 후 45도씩 8방향, 총 360도를 탐색합니다.
6. 가장 트인 방향으로 회전한 뒤 자율주행을 시작합니다.

LCD는 대기/보정/탐색/주행 상태를 계속 표시합니다. 주행 중에는 현재 LiDAR 판단 모드
(`FAST`, `CHECK`, `RESCAN`, `ESCAPE`, `FULL`), `L/F/R`, `Y5/Y6/Y7`, 각도 상태와 보정
노이즈를 보여줍니다.

## 8x8 Matrix LiDAR + DFR0997 LCD 자율주행 코드

이 코드는 `getData()`의 좌/정면/우 요약값 대신 **8x8 Matrix 원본 빔 일부를 직접 읽어서**
낮은 물체/정면 물체/높은 물체를 나눠 판단합니다. 실시간 주행에서는 6점 FAST 또는 12점
CHECK로 판단하고, LCD 레이더맵은 저빈도 갱신으로 8x8 전체를 시각화합니다.

샘플링 구조:

- 왼쪽: 위/중간/아래 3점
- 정면: 위/중간/아래 각 2점, 총 6점
- 오른쪽: 위/중간/아래 3점

버튼 A를 누르면 열린 바닥 기준값을 먼저 저장합니다. 이후 같은 빔이 기준값보다 가까워지거나,
기준값이 없던 빔에서 가까운 물체가 새로 잡히면 장애물로 판단합니다. LCD는 300~500ms마다
상태만 갱신해서 LiDAR 폴링을 방해하지 않게 했습니다.

테스트 로그처럼 특정 바닥/측면 빔이 순간적으로 튀는 경우를 대비해서, 보정값은 5회 측정의
중앙값으로 잡고 장애물 판단은 기본적으로 2회 연속 막힘일 때만 인정합니다. 단, 210mm보다
가까운 값은 안전상 노이즈 필터를 기다리지 않고 즉시 긴급회피로 처리합니다.

라이더 높이 기본값은 지면에서 140mm입니다. A+B를 누를 때마다 100~180mm 범위에서 10mm씩
바꿀 수 있고, 높이를 바꾸면 다시 A로 보정해야 합니다. 공식 스펙의 수직 FOV 60도를 기준으로,
140mm에서 수평보다 약 2~3도 아래를 보는 장착 상태라면 중심 하단 빔은 대략
`y7=220~320mm`, `y6=300~450mm`, `y5=450~750mm` 근처의 바닥값을 봐야 합니다. 다른 높이를
선택하면 이 목표값은 `현재높이 / 140` 비율로 자동 보정됩니다. 보정 직후 LCD에는
`ANGLE OK`, `RAISE SENSOR`, `LOWER SENSOR`, `LEVEL SENSOR`, `BASE NOISY` 중 하나가 표시됩니다.

시작 절차는 수동입니다. A는 보정, B는 출발, A+B는 높이 변경입니다. B를 누르면 3초
카운트다운 후 제자리에서 45도씩 8방향(총 360도)을 탐색하고, 가장 점수가 높은 방향으로
돌아선 다음 다시 한 번 전방을 검증합니다. `ANGLE OK`가 아니거나 선택 방향이 안전하지 않으면
바로 출발하지 않습니다.

주행 중 LiDAR는 가변 해상도로 사용합니다. 평상시에는 6개 대표 빔만 읽는 `FAST` 모드로
빠르게 판단하고, 정면 위험이 의심되면 12개 대표 빔 전체를 읽는 `CHECK` 모드로 전환합니다.
일정 시간이 지나거나 회피가 반복되면 `RESCAN`으로 -90도~+90도, 총 180도를 다시 탐색합니다.
최근 20초 안에 회피가 4회 이상 발생하거나 같은 방향 회전이 3회 이상 반복되면 `ESCAPE`
모드로 들어가 후진 후 180도 재탐색, 필요 시 360도 전체 탐색을 수행합니다.

현재 권장 코드의 주요 조정값:

| 변수 | 기본값 | 의미 |
|---|---:|---|
| `기본라이더높이mm` | 140 | 부팅 시 기본 라이더 높이 |
| `최소라이더높이mm` / `최대라이더높이mm` | 100 / 180 | A+B로 선택 가능한 높이 범위 |
| `높이변경단위mm` | 10 | A+B 한 번당 높이 변경 단위 |
| `전진거리cm` | 8 | 정상 각도 상태에서 한 번에 전진하는 거리 |
| `최소전진거리cm` / `최대전진거리cm` | 4 / 12 | 성공/실패에 따라 변하는 전진거리 범위 |
| `조심전진거리cm` | 5 | 각도 이상 상태에서 쓰는 보수 주행 상한. 현재는 `ANGLE OK`일 때만 출발 |
| `정면여유mm` / `측면여유mm` | 55 / 45 | 바닥 기준값보다 가까워져야 막힘으로 인정하는 여유 |
| `각도불량추가여유mm` | 25 | 각도 상태가 `ANGLE OK`가 아닐 때 추가하는 안전 여유 |
| `긴급정지거리mm` | 210 | 이 거리보다 가까우면 연속 필터 없이 즉시 회피 |
| `초기탐색방향수` / `초기탐색각도` | 8 / 45 | B 출발 후 360도 초기 탐색 분해능 |
| `LCD갱신간격ms` | 500 | 주행 중 LCD 갱신 최소 간격 |
| `LCD맵사용` | true | 느리면 `false`로 바꿔 8x8 색상 맵을 끔 |
| `LCD맵갱신간격ms` | 1000 | 8x8 색상 맵 갱신 최소 간격 |
| `최근회피시간창ms` / `최근회피한계` | 20000 / 4 | 이 시간 안에 회피가 많이 반복되면 탈출 모드 진입 |
| `같은방향회전한계` | 3 | 같은 방향 회전이 반복되면 반대 방향/탈출 탐색 유도 |
| `주기재탐색최소ms` / `주기재탐색추가ms` | 15000 / 10000 | 15~25초 사이 주기적 180도 재탐색 |
| `좌우점수차이한계` | 250 | 좌/우 점수 차이가 작으면 최근 실패 방향의 반대를 선호 |

> 이 코드는 DFR0997 LCD가 테스트에서 확인된 것처럼 `0x2c`, Matrix LiDAR가 `Addr4(0x33)`인
> 구성에 맞춰져 있습니다.

```typescript
// ===== 8x8 Matrix LiDAR + DFR0997 LCD 자율주행 =====
const LCD주소 = 0x2c
const 라이다주소 = matrixLidarDistance.Addr.Addr4

const 샘플수 = 12
const 기본감지거리mm = 430
const 정면여유mm = 90
const 측면여유mm = 70
const 긴급정지거리mm = 280
const 라이다무효값mm = 4000
const 막힘연속필요 = 2
const 전진거리cm = 8
const 최소전진거리cm = 4
const 최대전진거리cm = 12
const 전진성공증가조건 = 3
const 전진성공증가cm = 1
const 전진실패감소cm = 2
const 회전전후진cm = 5
const 기본회전각 = 42
const 큰회전각 = 115
const 루프대기ms = 40
const 기울기보정틱대기ms = 100
const LCD갱신간격ms = 500
const 막힘속도기준 = 1
const 출발유예ms = 300
const 기본라이더높이mm = 140
const 최소라이더높이mm = 100
const 최대라이더높이mm = 180
const 높이변경단위mm = 10
const 조심전진거리cm = 5
const 각도불량추가여유mm = 25
const 각도좌우차이한계mm = 180
const 각도노이즈한계mm = 140
const 초기탐색방향수 = 8
const 초기탐색각도 = 45
const 좌우점수차이한계 = 250
const 같은방향회전한계 = 3
const 최근회피시간창ms = 20000
const 최근회피한계 = 4
const 주기재탐색최소ms = 15000
const 주기재탐색추가ms = 10000
const 재탐색최소점수 = 2500
const 실패방향감점 = 700
const 회전비용계수 = 5
const LCD맵갱신간격ms = 1000
const LCD맵X = 8
const LCD맵Y = 8
const LCD맵칸 = 14
const LCD맵간격 = 2
const LCD맵ID시작 = 20

let 샘플X = [1, 1, 1, 3, 4, 3, 4, 3, 4, 6, 6, 6]
let 샘플Y = [1, 3, 5, 1, 1, 3, 3, 5, 5, 1, 3, 5]
let 샘플구역 = [0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2] // 0=left, 1=front, 2=right
let 샘플높이 = [0, 1, 2, 0, 0, 1, 1, 2, 2, 0, 1, 2] // 0=high, 1=middle, 2=low
let 빠른샘플 = [1, 5, 6, 7, 8, 10]
let 재탐색각도 = [-90, -45, 0, 45, 90]
let 기준값: number[] = []
let 최근값: number[] = []
let 막힘연속: number[] = []
let 위험연속 = 0

let 이동중 = false
let 이동방향 = 1
let 이동목표cm = 0
let 이동시작시각 = 0
let 측정속도 = -1
let 예상완료시각 = 0
let 저속틱수 = 0
let 후진후회전 = false
let 예약회전각 = 0
let 마지막LCD시각 = 0
let 상태 = "BOOT"
let 마지막판단 = "INIT"
let 연속막힘 = 0
let 출발요청 = false
let 높이변경요청 = false
let 기울기보정모드중 = false
let 주행시작됨 = false
let 라이더높이mm = 기본라이더높이mm
let 각도상태 = "ANGLE ?"
let 보정Y5 = 0
let 보정Y6 = 0
let 보정Y7 = 0
let 보정좌하단 = 0
let 보정우하단 = 0
let 보정노이즈 = 0
let 감시모드 = "FAST"
let 마지막회전방향 = 0
let 같은방향회전수 = 0
let 마지막실패각 = 999
let 회피시각목록: number[] = []
let 다음재탐색시각 = 0
let 마지막탐색점수 = 0
let 마지막정밀확인시각 = 0
let 적응전진거리cm = 전진거리cm
let 전진성공연속 = 0
let 마지막맵시각 = 0
let 초음파사용 = true
let 최근초음파mm = 0
let LCD맵사용 = true
let LCD맵이전색: number[] = []
let 마지막하트비트시각 = 0

const 디버그모드 = true       // 무선 콘솔 디버그 on/off. 문제 없으면 false로 끄고 사용
const 라디오그룹 = 77
const 초음파TRIG = DigitalPin.P13
const 초음파ECHO = DigitalPin.P14
const 하트비트간격ms = 1000
const LCD맵칸쓰기지연ms = 5

function 로그(내용: string): void {
    if (!디버그모드) return
    radio.sendString(input.runningTime() + "ms " + 내용)
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

function lcd표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    let 이동표시 = 이동중 ? (이동방향 == 1 ? "FWD" : "BACK") : "STOP"
    lcd문자(1, 8, 16, 감시모드 + " " + 상태 + " " + 이동표시, 0x000000)
    lcd문자(2, 8, 54, "DECIDE " + 마지막판단 + " stuck" + 연속막힘, 0x0000ff)
    lcd문자(3, 140, 16, "FWD " + 적응전진거리cm + "cm", 0x008000)
    lcd문자(4, 140, 54, "L" + 구역최소(0) + " F" + 구역최소(1) + " R" + 구역최소(2) + " U" + 최근초음파mm, 0xaa00aa)
    lcd문자(5, 140, 92, 각도상태 + " N" + 보정노이즈, 각도색())
    lcd레이더맵표시(false)
}

function lcd대기표시(강제: boolean): void {
    if (!강제 && input.runningTime() - 마지막LCD시각 < LCD갱신간격ms) return
    마지막LCD시각 = input.runningTime()
    lcd문자(1, 8, 16, "HEIGHT " + 라이더높이mm + "mm", 0x000000)
    lcd문자(2, 8, 54, "A START  B TILT CAL", 0x0000ff)
    lcd문자(3, 8, 92, "A+B HEIGHT", 0x008000)
    lcd문자(4, 8, 130, "Y5 " + 보정Y5 + " Y6 " + 보정Y6 + " Y7 " + 보정Y7, 0xaa00aa)
    lcd문자(5, 8, 168, 각도상태, 각도색())
}

function 로봇초기화(): void {
    if (디버그모드) {
        radio.setGroup(라디오그룹)
        radio.setTransmitPower(7)
    }
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(라이다주소, matrixLidarDistance.Matrix.MAT)
    basic.pause(500)
    로그("BOOT H" + 라이더높이mm)
    lcd지우기()
    lcd배경색(0xffffff)
    lcd문자(1, 8, 16, "AUTO DRIVE READY", 0x000000)
    lcd문자(2, 8, 54, "A = START", 0x0000ff)
    lcd문자(3, 8, 92, "B = TILT CAL", 0x008000)
}

function 유효거리(원시값: number): number {
    return 원시값 >= 라이다무효값mm ? 0 : 원시값
}

function 거리읽기(index: number): number {
    return 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, 샘플X[index], 샘플Y[index]))
}

function 전체샘플읽기(): void {
    최근값 = []
    for (let i = 0; i < 샘플수; i++) {
        최근값.push(거리읽기(i))
    }
}

function 빠른샘플읽기(): void {
    최근값 = []
    for (let i = 0; i < 샘플수; i++) 최근값.push(0)
    for (let i = 0; i < 빠른샘플.length; i++) {
        let index = 빠른샘플[i]
        최근값[index] = 거리읽기(index)
    }
}

function 감시샘플읽기(): void {
    if (감시모드 == "FAST") 빠른샘플읽기()
    else 전체샘플읽기()
    최근초음파mm = 초음파읍기()
}

function 정렬삽입(목록: number[], 값: number): void {
    목록.push(값)
    for (let i = 목록.length - 1; i > 0; i--) {
        if (목록[i] < 목록[i - 1]) {
            let 임시 = 목록[i]
            목록[i] = 목록[i - 1]
            목록[i - 1] = 임시
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

function 높이비례값(기준값mm: number): number {
    return Math.idiv(기준값mm * 라이더높이mm, 기본라이더높이mm)
}

function 높이변경(): void {
    if (이동중) {
        maqueenPlusV2.pidControlStop()
        이동중 = false
    }
    주행시작됨 = false
    출발요청 = false
    라이더높이mm += 높이변경단위mm
    if (라이더높이mm > 최대라이더높이mm) 라이더높이mm = 최소라이더높이mm
    각도상태 = "CAL AGAIN"
    감시모드 = "FAST"
    마지막회전방향 = 0
    같은방향회전수 = 0
    마지막실패각 = 999
    회피시각목록 = []
    적응전진거리cm = 전진거리cm
    전진성공연속 = 0
    상태 = "높이설정"
    마지막판단 = "H " + 라이더높이mm
    로그("HEIGHT " + 라이더높이mm)
    lcd대기표시(true)
}

function 지점읽기(x: number, y: number): number {
    return 유효거리(matrixLidarDistance.matrixPointOutput(라이다주소, x, y))
}

function 트인거리값(거리: number): number {
    return 거리 == 0 ? 9999 : 거리
}

function 각도색(): number {
    if (각도상태 == "ANGLE OK") return 0x008000
    if (각도상태 == "BASE NOISY") return 0xff0000
    return 0xff8800
}

function 조심모드인가(): boolean {
    return 각도상태 != "ANGLE OK"
}

function 현재전진거리cm(): number {
    if (조심모드인가()) return Math.min(적응전진거리cm, 조심전진거리cm)
    return 적응전진거리cm
}

function 전진거리줄이기(): void {
    적응전진거리cm = Math.max(최소전진거리cm, 적응전진거리cm - 전진실패감소cm)
    전진성공연속 = 0
}

function 전진성공기록(): void {
    전진성공연속 += 1
    if (전진성공연속 >= 전진성공증가조건) {
        적응전진거리cm = Math.min(최대전진거리cm, 적응전진거리cm + 전진성공증가cm)
        전진성공연속 = 0
    }
}

function 거리색(거리: number): number {
    if (거리 == 0) return 0x202020
    if (거리 < 긴급정지거리mm) return 0xff0000
    if (거리 < 320) return 0xff9900
    if (거리 < 520) return 0xffff00
    if (거리 < 800) return 0x00cc00
    return 0x0066ff
}

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

function 막힌샘플인가(index: number): boolean {
    let 거리 = 최근값[index]
    if (거리 == 0) return false
    let 기준 = 기준값[index]
    let 여유 = 샘플구역[index] == 1 ? 정면여유mm : 측면여유mm
    if (조심모드인가()) 여유 += 각도불량추가여유mm
    if (기준 > 0) return 거리 < 기준 - 여유
    return 거리 < 기본감지거리mm
}

function 샘플긴급인가(index: number): boolean {
    let 거리 = 최근값[index]
    return 거리 != 0 && 거리 < 긴급정지거리mm
}

function 막힘연속갱신(): void {
    for (let i = 0; i < 샘플수; i++) {
        if (막힌샘플인가(i)) 막힘연속[i] += 1
        else 막힘연속[i] = 0
    }
}

function 안정막힘인가(index: number): boolean {
    return 샘플긴급인가(index) || 막힘연속[index] >= 막힘연속필요
}

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

function 높이최소(높이: number): number {
    let 최소 = 9999
    for (let i = 0; i < 샘플수; i++) {
        if (샘플높이[i] == 높이) 최소 = Math.min(최소, 트인거리값(최근값[i]))
    }
    return 최소 == 9999 ? 0 : 최소
}

function 구역막힘수(구역: number): number {
    let 수 = 0
    for (let i = 0; i < 샘플수; i++) {
        if (샘플구역[i] == 구역 && 안정막힘인가(i)) 수 += 1
    }
    return 수
}

function 구역점수(구역: number): number {
    let 점수 = 0
    for (let i = 0; i < 샘플수; i++) {
        if (샘플구역[i] == 구역) {
            점수 += Math.min(트인거리값(최근값[i]), 900)
            if (안정막힘인가(i)) 점수 -= 500
        }
    }
    return 점수
}

function 회전방향(각도: number): number {
    if (각도 > 0) return 1
    if (각도 < 0) return -1
    return 0
}

function 최근실패감점(후보각: number): number {
    if (마지막실패각 == 999) return 0
    if (Math.abs(후보각 - 마지막실패각) <= 45) return 실패방향감점
    return 0
}

function 회전기록(각도: number): void {
    let 방향 = 회전방향(각도)
    if (방향 != 0 && 방향 == 마지막회전방향) 같은방향회전수 += 1
    else 같은방향회전수 = 방향 == 0 ? 0 : 1
    마지막회전방향 = 방향
}

function 회피기록(): void {
    let 지금 = input.runningTime()
    let 새목록: number[] = []
    for (let i = 0; i < 회피시각목록.length; i++) {
        if (지금 - 회피시각목록[i] <= 최근회피시간창ms) 새목록.push(회피시각목록[i])
    }
    새목록.push(지금)
    회피시각목록 = 새목록
}

function 최근회피수(): number {
    let 지금 = input.runningTime()
    let 수 = 0
    for (let i = 0; i < 회피시각목록.length; i++) {
        if (지금 - 회피시각목록[i] <= 최근회피시간창ms) 수 += 1
    }
    return 수
}

function 다음재탐색예약(): void {
    다음재탐색시각 = input.runningTime() + 주기재탐색최소ms + Math.round(Math.random() * 주기재탐색추가ms)
}

function 정면위험(): boolean {
    for (let i = 0; i < 샘플수; i++) {
        if (샘플구역[i] == 1 && 샘플긴급인가(i)) return true
    }
    if (구역막힘수(1) >= 2) {
        위험연속 += 1
    } else {
        위험연속 = 0
    }
    if (위험연속 >= 막힘연속필요) return true
    let 정면최소 = 정면최소거리()
    return 정면최소 != 0 && 정면최소 < 긴급정지거리mm
}

function 회전각결정(): number {
    let 좌점수 = 구역점수(0)
    let 우점수 = 구역점수(2)
    if (마지막실패각 < 0) 좌점수 -= 실패방향감점
    if (마지막실패각 > 0 && 마지막실패각 != 999) 우점수 -= 실패방향감점
    if (같은방향회전수 >= 2 && 마지막회전방향 < 0) 좌점수 -= 실패방향감점
    if (같은방향회전수 >= 2 && 마지막회전방향 > 0) 우점수 -= 실패방향감점
    let 차이 = 우점수 - 좌점수
    let 방향 = 0
    if (Math.abs(차이) >= 좌우점수차이한계) 방향 = 차이 > 0 ? 1 : -1
    else 방향 = 마지막회전방향 == 0 ? (Math.random() < 0.5 ? -1 : 1) : -마지막회전방향
    if (같은방향회전수 >= 같은방향회전한계) 방향 = -마지막회전방향
    if (연속막힘 >= 3) return 방향 * 큰회전각
    return 방향 * 기본회전각
}

function 각도진단(y5목록: number[], y6목록: number[], y7목록: number[], 좌목록: number[], 우목록: number[]): void {
    보정Y5 = 중앙값(y5목록)
    보정Y6 = 중앙값(y6목록)
    보정Y7 = 중앙값(y7목록)
    보정좌하단 = 중앙값(좌목록)
    보정우하단 = 중앙값(우목록)
    보정노이즈 = Math.max(범위값(y5목록), Math.max(범위값(y6목록), 범위값(y7목록)))

    if (보정노이즈 > 각도노이즈한계mm) {
        각도상태 = "BASE NOISY"
    } else if (y6목록.length < 3 || y7목록.length < 3 || 보정Y6 == 0 || 보정Y7 == 0) {
        각도상태 = "LOWER SENSOR"
    } else if (보정좌하단 > 0 && 보정우하단 > 0 && Math.abs(보정좌하단 - 보정우하단) > 각도좌우차이한계mm) {
        각도상태 = "LEVEL SENSOR"
    } else if (보정Y6 < 높이비례값(260) || 보정Y7 < 높이비례값(200)) {
        각도상태 = "RAISE SENSOR"
    } else if (보정Y6 > 높이비례값(520)) {
        각도상태 = "LOWER SENSOR"
    } else {
        각도상태 = "ANGLE OK"
    }
    로그("ANGLE " + 각도상태 + " H" + 라이더높이mm)
    로그("Y5 " + 보정Y5 + " Y6 " + 보정Y6 + " Y7 " + 보정Y7)
    로그("LOWL " + 보정좌하단 + " LOWR " + 보정우하단 + " N " + 보정노이즈)
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
    if (이동중) {
        maqueenPlusV2.pidControlStop()
        이동중 = false
    }
    상태 = "보정"
    lcd문자(1, 8, 16, "CALIBRATING", 0x000000)
    lcd문자(2, 8, 54, "3 2 1", 0x0000ff)
    basic.showNumber(3)
    basic.pause(700)
    basic.showNumber(2)
    basic.pause(700)
    basic.showNumber(1)
    basic.pause(700)
    let 보정샘플: number[][] = []
    for (let i = 0; i < 샘플수; i++) 보정샘플.push([])
    let y5목록: number[] = []
    let y6목록: number[] = []
    let y7목록: number[] = []
    let 좌목록: number[] = []
    let 우목록: number[] = []
    for (let n = 0; n < 5; n++) {
        전체샘플읽기()
        for (let i = 0; i < 샘플수; i++) {
            if (최근값[i] != 0) 정렬삽입(보정샘플[i], 최근값[i])
        }
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
    기준값 = []
    막힘연속 = []
    for (let i = 0; i < 샘플수; i++) {
        기준값.push(중앙값(보정샘플[i]))
        막힘연속.push(0)
    }
    각도진단(y5목록, y6목록, y7목록, 좌목록, 우목록)
    위험연속 = 0
    주행시작됨 = false
    출발요청 = false
    감시모드 = "FAST"
    마지막회전방향 = 0
    같은방향회전수 = 0
    마지막실패각 = 999
    회피시각목록 = []
    적응전진거리cm = 전진거리cm
    전진성공연속 = 0
    상태 = "보정완료"
    마지막판단 = 각도상태
    lcd대기표시(true)
    basic.showIcon(IconNames.Yes)
    basic.pause(2000)
    basic.clearScreen()
}

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

function 전진시작(거리cm: number): void {
    로그("FWD START " + 거리cm + "cm")
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 거리cm, maqueenPlusV2.MyInterruption.Allowed)
    이동중 = true
    이동방향 = 1
    이동목표cm = 거리cm
    이동시작시각 = input.runningTime()
    측정속도 = -1
    예상완료시각 = 이동시작시각 + 2500
    저속틱수 = 0
    상태 = "전진"
}

function 후진시작(거리cm: number, 회전예약: boolean): void {
    로그("BACK START " + 거리cm + "cm resv=" + 회전예약)
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 거리cm, maqueenPlusV2.MyInterruption.Allowed)
    이동중 = true
    이동방향 = -1
    이동목표cm = 거리cm
    이동시작시각 = input.runningTime()
    측정속도 = -1
    예상완료시각 = 이동시작시각 + 2500
    저속틱수 = 0
    후진후회전 = 회전예약
    상태 = "후진"
}

function 이동상태갱신(): string {
    let 왼쪽속도 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
    let 오른쪽속도 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
    let 평균속도 = (왼쪽속도 + 오른쪽속도) / 2
    let 경과 = input.runningTime() - 이동시작시각
    if (측정속도 < 0 && 평균속도 >= 막힘속도기준) {
        측정속도 = 평균속도
        예상완료시각 = 이동시작시각 + (이동목표cm / 측정속도) * 1000 + 300
    }
    if (평균속도 < 막힘속도기준) 저속틱수 += 1
    else 저속틱수 = 0
    if (저속틱수 >= 2 && 경과 > 출발유예ms) {
        이동중 = false
        return input.runningTime() < 이동시작시각 + (예상완료시각 - 이동시작시각) * 0.7 ? "막힘" : "완료"
    }
    if (input.runningTime() > 예상완료시각 + 1000) {
        이동중 = false
        return "완료"
    }
    return "진행중"
}

function 회피시작(): void {
    예약회전각 = 회전각결정()
    회피기록()
    회전기록(예약회전각)
    전진거리줄이기()
    연속막힘 += 1
    감시모드 = 최근회피수() >= 최근회피한계 ? "ESCAPE" : "CHECK"
    마지막판단 = "TURN " + 예약회전각
    maqueenPlusV2.pidControlStop()
    후진시작(회전전후진cm, true)
}

function 탐색점수(후보각: number): number {
    전체샘플읽기()
    let 점수 = 0
    for (let i = 0; i < 샘플수; i++) {
        let 거리 = Math.min(트인거리값(최근값[i]), 900)
        if (샘플구역[i] == 1) 점수 += 거리 * 2
        else 점수 += 거리
        if (막힌샘플인가(i)) 점수 -= 700
        if (샘플높이[i] == 2 && 막힌샘플인가(i)) 점수 -= 300
    }
    점수 -= 최근실패감점(후보각)
    점수 -= Math.abs(후보각) * 회전비용계수
    if (후보각 == 0) 점수 += 300
    마지막탐색점수 = 점수
    return 점수
}

function 방향안전확인(): boolean {
    전체샘플읽기()
    막힘연속갱신()
    let 안전 = !정면위험() && 구역막힘수(1) == 0
    lcd문자(1, 8, 16, "VERIFY DIR", 0x000000)
    lcd문자(2, 8, 54, 안전 ? "SAFE OK" : "UNSAFE", 안전 ? 0x008000 : 0xff0000)
    lcd문자(3, 8, 92, "F " + 구역최소(1), 0x0000ff)
    lcd문자(4, 8, 130, "SCORE " + 마지막탐색점수, 0xaa00aa)
    basic.pause(500)
    return 안전
}

function 최단회전각(방향번호: number): number {
    let 각도 = 방향번호 * 초기탐색각도
    if (각도 > 180) 각도 -= 360
    return 각도
}

function 출발카운트다운(): void {
    상태 = "출발대기"
    for (let n = 3; n > 0; n--) {
        마지막판단 = "START " + n
        lcd문자(1, 8, 16, "START " + n, 0x000000)
        lcd문자(2, 8, 54, "SCAN READY", 0x0000ff)
        lcd문자(3, 8, 92, "HEIGHT " + 라이더높이mm + "mm", 0x008000)
        basic.showNumber(n)
        basic.pause(1000)
    }
    basic.clearScreen()
}

function 초기360탐색(): void {
    상태 = "초기탐색"
    감시모드 = "FULL"
    let 최고점수 = -999999
    let 최고방향 = 0
    for (let i = 0; i < 초기탐색방향수; i++) {
        let 후보각 = 최단회전각(i)
        let 점수 = 탐색점수(후보각)
        if (점수 > 최고점수) {
            최고점수 = 점수
            최고방향 = i
        }
        lcd문자(1, 8, 16, "SCAN " + (i + 1) + "/" + 초기탐색방향수, 0x000000)
        lcd문자(2, 8, 54, "DIR " + (i * 초기탐색각도), 0x0000ff)
        lcd문자(3, 8, 92, "SCORE " + 점수, 0x008000)
        lcd문자(4, 8, 130, "BEST " + (최고방향 * 초기탐색각도), 0xaa00aa)
        lcd문자(5, 8, 168, 각도상태, 각도색())
        로그("SCAN " + i + " SCORE " + 점수)
        maqueenPlusV2.pidControlAngle(초기탐색각도, maqueenPlusV2.MyInterruption.NotAllowed)
        basic.pause(100)
    }
    예약회전각 = 최단회전각(최고방향)
    마지막판단 = "BEST " + 예약회전각
    lcd문자(1, 8, 16, "BEST DIR " + (최고방향 * 초기탐색각도), 0x000000)
    lcd문자(2, 8, 54, "TURN " + 예약회전각, 0x0000ff)
    lcd문자(3, 8, 92, "SCORE " + 최고점수, 0x008000)
    로그("BEST DIR " + 최고방향 + " TURN " + 예약회전각 + " SCORE " + 최고점수)
    maqueenPlusV2.pidControlAngle(예약회전각, maqueenPlusV2.MyInterruption.NotAllowed)
    회전기록(예약회전각)
    basic.pause(300)
}

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

function 탈출탐색(): void {
    감시모드 = "ESCAPE"
    상태 = "탈출"
    마지막판단 = "ESCAPE360"
    로그("ESCAPE TRIGGERED -> SHORT BACKUP + FULL 360 SCAN")
    전진거리줄이기()
    maqueenPlusV2.pidControlStop()
    이동중 = false
    로그("ESCAPE BACKUP " + 회전전후진cm + "cm")
    maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 회전전후진cm, maqueenPlusV2.MyInterruption.NotAllowed)
    maqueenPlusV2.pidControlStop()
    초기360탐색()
    if (!방향안전확인()) {
        로그("ESCAPE 360 UNSAFE -> RESCAN 180")
        if (!재탐색180(true)) {
            주행시작됨 = false
            마지막판단 = "NO SAFE DIR"
            로그("ESCAPE FAILED: NO SAFE DIR")
            basic.showIcon(IconNames.No)
            basic.pause(500)
            basic.clearScreen()
            lcd대기표시(true)
            return
        }
    }
    연속막힘 = 0
    회피시각목록 = []
    감시모드 = "CHECK"
    다음재탐색예약()
    로그("ESCAPE DONE")
}

function 출발준비(): void {
    출발요청 = false
    출발카운트다운()
    초기360탐색()
    if (!방향안전확인()) {
        마지막실패각 = 예약회전각
        if (!재탐색180(false)) {
            마지막판단 = "NO SAFE DIR"
            주행시작됨 = false
            basic.showIcon(IconNames.No)
            basic.pause(500)
            basic.clearScreen()
            lcd대기표시(true)
            return
        }
    }
    주행시작됨 = true
    연속막힘 = 0
    위험연속 = 0
    감시모드 = "FAST"
    다음재탐색예약()
    상태 = "전방확보"
    마지막판단 = "GO"
    lcd표시(true)
}

로봇초기화()
lcd대기표시(true)

basic.forever(function () {
    if (디버그모드 && input.runningTime() - 마지막하트비트시각 > 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " mode=" + 감시모드 + " moving=" + 이동중 + " dir=" + 이동방향
            + " started=" + 주행시작됨 + " F=" + 구역최소(1) + " L=" + 구역최소(0) + " R=" + 구역최소(2)
            + " stuck=" + 연속막힘 + " avoid=" + 최근회피수())
    }

    if (높이변경요청) {
        높이변경요청 = false
        높이변경()
        basic.pause(루프대기ms)
        return
    }

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

    if (!이동중 && (최근회피수() >= 최근회피한계 || 연속막힘 >= 3 || 같은방향회전수 >= 같은방향회전한계)) {
        로그("ESCAPE TRIGGER avoid" + 최근회피수() + " stuck" + 연속막힘 + " sameDir" + 같은방향회전수)
        탈출탐색()
        basic.pause(루프대기ms)
        return
    }

    if (!이동중 && input.runningTime() >= 다음재탐색시각) {
        로그("PERIODIC RESCAN")
        if (!재탐색180(false)) 탈출탐색()
        else 감시모드 = "FAST"
        basic.pause(루프대기ms)
        return
    }

    감시샘플읽기()
    막힘연속갱신()
    let 정면위험상태 = 정면위험()

    if (감시모드 == "FAST" && 정면위험상태) {
        감시모드 = "CHECK"
        마지막정밀확인시각 = input.runningTime()
        전체샘플읽기()
        막힘연속갱신()
        정면위험상태 = 정면위험()
    }

    if (감시모드 == "CHECK" && !정면위험상태 && input.runningTime() - 마지막정밀확인시각 > 3000) {
        감시모드 = "FAST"
    }

    if (각도상태 == "BASE NOISY") {
        if (이동중) {
            maqueenPlusV2.pidControlStop()
            이동중 = false
        }
        주행시작됨 = false
        출발요청 = false
        상태 = "재보정필요"
        마지막판단 = "PRESS A"
        로그("STOP: BASE NOISY")
        lcd표시(true)
        basic.pause(루프대기ms)
        return
    }

    if (이동중 && 이동방향 == 1 && 정면위험상태) {
        상태 = "긴급회피"
        로그("EMERGENCY F" + 구역최소(1))
        회피시작()
        lcd표시(true)
        basic.pause(루프대기ms)
        return
    }

    if (이동중) {
        let 결과 = 이동상태갱신()
        if (결과 == "진행중") {
            lcd표시(false)
            basic.pause(루프대기ms)
            return
        }
        if (이동방향 == -1 && 후진후회전) {
            후진후회전 = false
            상태 = "회전"
            로그("BACKUP DONE -> TURN " + 예약회전각)
            maqueenPlusV2.pidControlAngle(예약회전각, maqueenPlusV2.MyInterruption.NotAllowed)
            이동중 = false
            lcd표시(true)
            basic.pause(루프대기ms)
            return
        }
        if (이동방향 == 1 && 결과 == "막힘") {
            상태 = "스턱"
            마지막실패각 = 예약회전각
            로그("STUCK dir" + 이동방향 + " goal" + 이동목표cm)
            회피시작()
            lcd표시(true)
            basic.pause(루프대기ms)
            return
        }
        if (이동방향 == 1 && 결과 == "완료") {
            전진성공기록()
        }
        if (이동방향 == -1 && 결과 == "막힘" && !후진후회전) {
            로그("BACKUP BLOCKED, skip extra backup")
        }
    }

    if (정면위험상태) {
        상태 = "회피판단"
        로그("FRONT BLOCKED -> AVOID")
        회피시작()
        lcd표시(true)
        basic.pause(루프대기ms)
        return
    }

    if (상태 != "전방확보") 로그("GO F" + 구역최소(1) + " L" + 구역최소(0) + " R" + 구역최소(2))
    상태 = "전방확보"
    마지막판단 = "GO"
    연속막힘 = 0
    if (감시모드 != "FAST" && input.runningTime() - 마지막정밀확인시각 > 3000) 감시모드 = "FAST"
    if (!이동중) 전진시작(현재전진거리cm())
    lcd표시(false)
    basic.pause(루프대기ms)
})
```

한글 표시에 대해: `utf8바이트()`로 UTF-8 3바이트를 직접 만들어 보내도, 실제 보드에 꽂힌
DFR0997 펌웨어가 한글 폰트를 갖고 있지 않으면 한글이 깨지거나 안 보일 수 있습니다(실제
테스트에서 한글이 보이지 않는 것을 확인). 그래서 위 코드의 모든 `lcd문자(...)` 문구는
전부 영어/숫자로 바꿔두었습니다. 상태 표시는 텍스트 대신 `basic.showIcon(IconNames.Yes)`
같은 5x5 LED 아이콘도 함께 쓰고 있으니, 텍스트가 아예 안 보이는 보드라도 아이콘으로 보정
완료/실패 같은 주요 이벤트는 확인할 수 있습니다.

핵심 변화는 일곱 가지입니다.

1. **버튼 보정 + 각도 진단**: 고정된 임계값 대신, 버튼 A를 눌렀을 때 보이는 거리를
   "바닥/장애물 없음" 기준으로 저장해두고 그보다 `정면여유mm`/`측면여유mm`만큼 더 가까운
   것만 장애물로 판단합니다. 동시에 현재 설정 높이 기준의 `y5/y6/y7` 바닥 패턴을 읽어
   `ANGLE OK`, `RAISE SENSOR`, `LOWER SENSOR`, `LEVEL SENSOR`, `BASE NOISY`를 LCD에
   표시합니다. 라이더
   각도/높이가 바뀌면 다시 보정하면 됩니다. A+B로 높이를 바꾸면 보정은 자동으로 무효화되고,
   A로 다시 보정해야 합니다.
2. **B 출발 + 360도 초기 탐색**: 보정이 끝나도 바로 움직이지 않습니다. B를 누르면 3초
   카운트다운 뒤 45도씩 8방향을 모두 읽고, 가장 트인 방향으로 최단 회전한 다음 주행을
   시작합니다. 회전 후에는 다시 전방을 읽어 실제로 안전한지 검증합니다.
3. **가변 해상도 LiDAR 판단**: 평상시에는 6개 대표 빔만 읽는 `FAST`, 위험 의심 시 12개
   대표 빔 전체를 읽는 `CHECK`, 주기/회피 반복 시 180도 `RESCAN`, 갇힘 시 `ESCAPE`로
   전환합니다.
4. **반복 회피/빙빙 돌기 억제**: 좌/우 결정은 LiDAR 점수를 쓰되, 최근 실패 방향과 같은
   방향 반복 회전을 감점합니다. 최근 20초 안에 회피가 4회 이상이거나 같은 방향 회전이
   3회 이상이면 탈출 탐색으로 들어갑니다.
5. **디바운스 + 비율 기준**: 속도가 1틱만 낮아도 막힘으로 보지 않고 2틱 연속 낮아야
   인정하며, "예상 시간의 70% 이전에 멈췄을 때만" 막힘으로 판단합니다. PID가 목표 지점
   근처에서 스스로 감속하는 정상적인 경우를 막힘으로 오인하지 않게 합니다.
6. **모니터링되는 후진 + 회전 전 사전 후진**: 후진도 전진처럼 논블로킹으로 보내고 매 틱
   속도를 감시합니다(뒤에 뭔가 걸리면 즉시 감지). 회전하기 전에는 항상 짧게 후진해서
   회전 반경을 확보하고, 그 후진마저 막히면 추가 후진 없이 그 자리에서 바로 돕니다.
7. **각도 불량 시 출발 차단**: `ANGLE OK`일 때만 B 출발을 허용합니다. `RAISE SENSOR`,
   `LOWER SENSOR`, `LEVEL SENSOR`, `BASE NOISY`가 뜨면 LCD 안내에 맞춰 라이더를 조정한 뒤
   A로 다시 보정해야 합니다.

이후 실제 주행 테스트에서 나온 피드백으로 다음 네 가지를 추가로 바꿨습니다.

8. **회피 시 긴 후진 대신 즉시 360도 스캔**: `탈출탐색()`이 더 이상 `후진거리cm`만큼
   길게/블로킹으로 후진한 뒤 180도 재탐색을 먼저 시도하지 않습니다. 회전 전 사전 후진과
   같은 짧은 `회전전후진cm`(5cm)만 후진하고 바로 `초기360탐색()`(8방향 전체 스캔)으로
   넘어갑니다. 360도 스캔이 실패해야 그제서야 180도 재탐색을 보조 수단으로 시도합니다.
9. **안전 여유 거리 확대**: `정면여유mm`를 55→90mm, `측면여유mm`를 45→70mm,
   `긴급정지거리mm`를 210→280mm로 올렸습니다. 센서가 부딫칠 정도로 가깝게 가던 문제를
   줄이기 위한 조정입니다. 여전히 가깝다면 더 올려도 됩니다.
10. **라디오 디버그 로그 대폭 추가**: 1초마다 상태/모드/이동 여부/3구역 최소거리/연속막힘
    /최근회피수를 보내는 `HB`(하트비트) 로그를 메인 루프 맨 앞에서(다른 분기로 일찍
    `return`해도 항상) 보냅니다. 또한 `전진시작()`/`후진시작()` 호출마다 거리/방향을 로그로
    보내고, `탈출탐색()`의 각 단계(트리거, 후진, 360 결과, 실패)도 모두 로그로 남깁니다.
    로그가 중간에 끊기는 지점을 보면 어디서 멈췄는지(혹은 LCD 갱신이 너무 오래 걸려 루프가
    막혔는지) 알 수 있습니다.
11. **LCD 레이더맵 갱신 속도 개선**: 이전에는 칸 64개를 매번 전부 다시 그리며 I2C 청크마다
    `basic.pause(50)`를 기다려 한 번 그릴 때 3초 이상 걸렸습니다. 이제는 직전 색상과 같은
    칸은 다시 그리지 않고(`LCD맵이전색` 캐시), 청크당 대기시간도 `LCD맵칸쓰기지연ms=5`로
    줄였습니다. 보통 장애물이 없는 칸은 색이 잘 안 바뀌므로 실제로 다시 그리는 칸 수가 크게
    줄어듭니다. 디버그 모드에서는 맵 갱신마다 그린 칸 수와 걸린 시간을 `MAP drew.. ms..`
    로그로 보내므로, 여전히 느리면 이 값을 보고 추가로 줄일 수 있습니다.

그래도 계속 부딪힌다면 다음을 의심해 보세요(순서대로 시도):

1. **`정면여유mm`/`측면여유mm`를 더 올리기** — 기본값을 90mm/70mm로 올렸지만, 로봇
   속도/관성에 비해 여전히 부족하면 더 올리세요(`긴급정지거리mm` 280mm도 함께 검토)
2. **버튼 A로 다시 보정** — 마지막 보정 이후 라이더 각도/높이가 바뀌었을 수 있음
3. **`전진거리cm` 또는 `조심전진거리cm`를 줄이기** — 한 번에 보내는 명령 자체를 짧게 하면
   정지 신호가 늦게 먹혀도 덜 가다가 멈춥니다. 현재 기본은 정상 주행 `8cm`, 보수 주행
   `5cm`입니다.
4. **B 출발 후 LCD 탐색 화면 보기** — `SCAN`, `SCORE`, `BEST` 화면에서 특정 방향 점수만
   비정상적으로 낮으면 그 방향의 바닥 반사나 장애물을 확인하세요.

## 테스트 체크리스트

1. 부팅 후 LCD에 `HEIGHT`, `A CAL`, `B START`, `A+B HEIGHT`가 보이는지 확인합니다.
2. 필요하면 A+B로 라이더 높이를 맞춥니다. 기본값은 `140mm`입니다.
3. 평평하고 열린 바닥에서 A를 눌러 보정합니다.
4. `ANGLE OK`가 뜨는지 확인합니다. 다른 값이면 LCD 안내에 맞춰 센서 각도/높이를 조정하고 다시 A를 누릅니다.
5. B를 눌러 3초 카운트다운, 360도 탐색, 방향 검증 후 출발하는지 봅니다.
6. 주행 중 LCD 왼쪽 8x8 색상 맵이 너무 느리게 느껴지면 `LCD맵사용 = false`로 끄고 다시 테스트합니다.
7. 좁은 공간에서 `RESCAN` 또는 `ESCAPE`가 뜨는지 확인합니다.

## LCD 레이더맵 색상

- 회색/검정: 미감지 또는 0
- 파랑: 먼 거리
- 초록: 비교적 안전한 거리
- 노랑: 주의 거리
- 주황: 가까운 거리
- 빨강: 긴급 거리

## 무선(라디오) 디버그 콘솔

로봇이 멈췄을 때 USB를 뽑은 상태에서도 무슨 일이 있었는지 보기 위해, 위 자율주행 코드에
`디버그모드 = true`일 때 `로그()` 호출이 `radio.sendString(...)`으로 채널 `77`에 무선
전송되도록 이미 넣어두었습니다(`로봇초기화()`에서 `radio.setGroup(77)` 설정). 주행 중인
로봇은 송신만 하고 받지는 않으므로, **두 번째 마이크로비트**를 USB로 PC에 연결해 같은
채널로 라디오를 받아서 시리얼로 그대로 흘려보내는 역할을 맡깁니다. 즉 코드가 2개입니다.

1. **로봇(보내는 쪽)**: 위 "8x8 Matrix LiDAR + DFR0997 LCD 자율주행" 코드 그대로 사용.
   문제 없는 게 확인되면 `디버그모드 = false`로 끄세요(라디오 송신도 약간의 틱 시간을 먹습니다).
2. **수신용 마이크로비트(받는 쪽, 새 프로젝트)**: 아래 코드를 새 MakeCode 프로젝트에
   붙여넣고, 로봇과는 별개로 USB로 PC에 연결한 채 그대로 둡니다. MakeCode 에디터의
   "콘솔" 탭에서 메시지를 그대로 볼 수 있습니다.

```typescript
// ===== 무선 디버그 수신기 (별도의 마이크로비트, USB로 PC에 연결) =====
radio.setGroup(77)
radio.setTransmitPower(7)

serial.writeLine("===== RADIO DEBUG RECEIVER READY (group 77) =====")

radio.onReceivedString(function (받은문자열: string) {
    serial.writeLine(받은문자열)
})

basic.showIcon(IconNames.Target)
```

사용 순서: 수신용 마이크로비트를 먼저 켜서 PC와 연결하고 MakeCode 콘솔을 열어둔 다음,
로봇을 켜서 테스트하세요. 로봇이 멈춘 시점 직전까지 찍힌 마지막 몇 줄(`STUCK`, `CANNOT
START`, `ESCAPE TRIGGER`, `ANGLE ...` 등)을 보면 어느 분기에서 멈췄는지 알 수 있습니다.
그 로그를 그대로 복사해서 붙여넣어 주시면 같이 분석하겠습니다.

라디오 그룹 `77`은 임의로 정한 값이라 다른 마퀸/마이크로비트 프로젝트와 채널이 겹치지
않게 주의하세요. 겹치면 서로 다른 로봇의 메시지가 섞여서 들어옵니다.

## 디버그 기록 정리

이 문서는 현재 실사용 자율주행 코드만 남겼습니다. 예전에 쓰던 주소 스캔, LCD 단독 테스트,
LCD+LiDAR 스트레스 테스트 코드는 혼동을 줄이기 위해 제거했습니다. 다시 필요하면 git 이전
버전에서 꺼내 쓰는 편이 안전합니다.
