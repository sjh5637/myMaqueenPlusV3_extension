# 정면 고정 장착 매트릭스 라이다 8열 회피/탈출 예제 (직접 속도 제어판)

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`와 라이다 데이터 레이어/회피·탈출 알고리즘은
동일합니다. 다른 점은 **평상시 전진/긴급 후진의 모터 제어 방식**입니다.

- 원본 파일은 `pidControlDistance()`를 씁니다. 이 함수는 엔코더 PID로 정밀하게
  목표 거리만큼 가지만, 내부 주행 속도(`speed`)가 `maqueenPlusV3.ts` 라이브러리
  안에 `2`로 고정돼 있어서 이 예제 파일에서는 속도를 조절할 방법이 없습니다.
- 이 파일은 평상시 전진/긴급 후진을 `controlMotor()`로 직접 제어합니다.
  `controlMotor()`는 속도(0~255)를 우리가 직접 줄 수 있어서, 더 느리게(또는
  빠르게) 튜닝하기 쉽습니다. 단, 엔코더 PID가 아니라서 "정확히 몇 cm"라는
  정밀 거리 제어는 못 하고, "충분히 트였으면 계속 가고, 막히면 즉시 멈춘다"는
  식으로 동작합니다(매 틱 40ms마다 다시 확인하므로 실질적으로는 더 촘촘하게
  반응합니다).
- **회전 탐색**(`회전탐색시작`/`회전탐색틱`)과 **360도 탈출 폴백**(`탈출360`)은
  정밀한 각도가 필요해서 원본과 동일하게 엔코더 PID(`pidControlAngle`)를
  그대로 씁니다 — "엔코더는 회전/탐색에만 쓰고, 직진/후진은 속도로 직접 제어"
  라는 설계입니다.

라이다 캐시/기준값/delta 추적/우선순위 5단계 구조는 원본과 완전히 동일하므로,
아래에서는 원본과 같은 코드는 그대로 두고 달라진 부분(상수, 전진/후진 관련
함수, 메인 루프의 DRIVE/EMERGENCY/BLOCKED 분기)만 설명을 덧붙였습니다.

```typescript
const LCD주소 = 0x2c
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라이다무효값mm = 4000
const 라이다CMD고정점 = 3
const 라이다STATUS성공 = 0x53
const 라이다STATUS실패 = 0x63
const 라이다진단타임아웃ms = 300

const 정지거리mm = 250
const 안전거리mm = 400
const 정면판정행시작 = 0
const 정면판정행끝 = 4
const 회전탐색판정행끝 = 3

// 직접 속도 제어 관련 — controlMotor()에 줄 속도(0~255). 실측(A버튼 테스트)에서
// 속도=35가 실제 ~2.7~3cm/s로 너무 느렸던 것을 반영해 전체 구간을 올렸다.
const 기본전진속도 = 100
const 최소전진속도 = 50
const 최대전진속도 = 150
// 한 번에 너무 크게 점프하지 않도록 증가는 1씩 천천히, 감소는 위험 회피처럼
// 빠르게(10씩) — 가속은 신중하게, 감속은 즉각적으로 반응한다는 기존 설계를 유지.
const 속도증가스텝 = 1
const 속도감소스텝 = 10
const 후진속도 = 60
const 후진시간ms = 400
const 직진보정사용 = true
const 직진보정간격ms = 300
const 직진보정게인 = 2
// 실측 A버튼 테스트 데이터(좌우 실시간 속도 차이가 0~0.4cm/s 수준)로는 12로도
// 충분했지만, 다른 노면/배터리 상태에서 더 큰 편차가 나올 수 있어 여유 있게 넓힌다.
const 직진보정최대 = 30
// 장애물 조향 보정 — 정면블록확정()이 멈추기 전에(정지거리mm+전진여유mm ≈ 370mm
// 근방), 그보다 먼 조향거리mm에서부터 좌/우 중 더 가까운 쪽 반대로 바퀴 속도를
// 미리 갈라서 자연스럽게 휘어가게 한다. 너무 멀리서부터 피하던 문제(480mm)를
// 줄여 막힘 판정 지점(~370mm)에 더 가깝게 당겼다 — 그래도 막힘보다는 먼
// 거리에서 시작해야 의미가 있으므로 370mm보다는 여유를 둔다. 완전히 못 피해서
// 결국 정면블록확정()이 막힘으로 확정하면, 그 다음은 기존 알고리즘(정지→
// 회전탐색→360도 탈출)이 그대로 이어받는다 — 이 조향 보정은 "막히기 전 미리
// 피하기" 단계만 담당한다.
const 조향거리mm = 400
const 조향최대보정 = 25
// 정면블록확정()이 "이번 틱에 전진을 허용해도 다음 정면블록확정() 재확인 전까지
// 안전한가"를 판단할 때 쓰는 고정 여유(mm). 거리 기반 PID와 달리 속도 제어는
// "이번에 몇 mm 갈지"를 직접 알 수 없어서, 루프 주기(40ms)+캐시 지연을 감안한
// 고정 버퍼로 대신한다. 속도를 올리면 이 값도 같이 키워야 안전하다(튜닝 필요).
const 전진여유mm = 120
const 직진테스트속도 = 35
const 직진테스트목표cm = 30
// 실측 결과 속도=35에서 실제 ~2.7~3cm/s밖에 안 나와 30cm 도달에 약 10~11초가
// 필요했는데, 기존 8000ms로는 못 채우고 TIMELIMIT(moved=23cm)로 끝났다 — 여유를
// 두고 15000ms로 늘린다.
const 직진테스트시간제한ms = 15000
const 직진테스트로그간격ms = 100

const 전진성공증가조건 = 3
const 실패연속한계 = 5
const 탐색점수상한mm = 1000
const 탈출최소점수 = 8000
const 정면막힘확인필요 = 2
const 정면막힘열확인필요 = 2

const 루프대기ms = 40
const LCD갱신간격ms = 500
let 디버그레벨 = 1   // 0=끄기, 1=하트비트/상태전환, 2=RAW/DELTA, 3=SCAN CYCLE까지
const 라디오그룹 = 77
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

let 전진속도 = 기본전진속도
let 전진성공연속 = 0
let 주행중 = false
let 실패연속 = 0
let 정면막힘연속 = 0
let 상태 = "BOOT"
let 마지막판단 = "INIT"
let 마지막탐색점수 = 0
let 전역최고점수 = -999999
let 전역최고절대각 = 0
let 마지막LCD시각 = 0
let 마지막하트비트시각 = 0
let 출발요청 = false
let 주행시작됨 = false
let 직진테스트요청 = false
let 직진테스트정지요청 = false
let 직진테스트중 = false
let 직진테스트모터중 = false
let 직진테스트시작시각 = 0
let 마지막직진테스트로그시각 = 0
let 직진테스트샘플번호 = 0
let 직진테스트이동cm = 0
let 직진테스트마지막틱시각 = 0
let 백그라운드스캔일시정지 = false

const 하트비트간격ms = 1000
let 로그전송중 = false

function 로그(내용: string): void {
    if (디버그레벨 < 1) return
    while (로그전송중) basic.pause(1)
    로그전송중 = true
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
    로그전송중 = false
}

// 디버그레벨 2에서만 보내는 상세 로그(RAW/DELTA 스냅샷 등) —
// 무선 송신 자체가 시간을 쓰므로 평소엔(레벨 1) 끄고 최적화/진단할 때만 켠다.
function 상세로그(내용: string): void {
    if (디버그레벨 < 2) return
    로그(내용)
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
    lcd줄(4, "SPD " + 전진속도 + " FAIL " + 실패연속, 0x008000)
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
    if (디버그레벨 >= 1) {
        radio.setGroup(라디오그룹)
        radio.setTransmitPower(7)
    }
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(라이다주소, matrixLidarDistance.Matrix.MAT)
    basic.pause(500)
    로그("BOOT FORWARD LIDAR DIRECTDRIVE")
    lcd지우기()
    lcd배경색(0xffffff)
    lcd줄(1, "FORWARD LIDAR READY", 0x000000)
    lcd줄(2, "B = START", 0x0000ff)
    lcd줄(3, "NO CALIBRATION NEEDED", 0x008000)
}

// 출발 직전(카운트다운 끝)에 8x8 64칸을 전부 한 번 읍어서 "평소 배경"으로
// 저장한다. row4~7은 바닥과 교차해 항상 가깝게 읍히지만(60도 수직 FOV를 8행으로
// 나누면 완전히 수평으로 달아도 아래쪽 행은 바닥을 본다), 그 자체를 버리지 않고
// "이 칸은 평소 이 정도 거리(바닥)였다"로 기억해둔 뒤, 실시간 스캔에서 그
// 거리와 거의 같으면 배경(바닥)으로, 뚜렷이 가까워지면 새로 들어온 장애물로
// 판단한다 — 8x8 전체를 다 쓰면서도 바닥 오탐을 피하고, 바닥 쪽에 실제로
// 뭔가 끼어들어도 실시간으로 잡아낸다.
let 기준값: number[] = []
let 기준값준비됨 = false
const 기준값여유mm = 60

let 캐시: number[] = []
let 캐시갱신시각: number[] = []
for (let i = 0; i < 64; i++) {
    캐시.push(0)
    캐시갱신시각.push(0)
}
let 마지막사이클ms = 0
let 스캔번호 = 0
let 마지막정면블록스캔번호 = -1

function 캐시최대나이ms(): number {
    let 지금 = input.runningTime()
    let 최대 = 0
    for (let i = 0; i < 64; i++) {
        let 나이 = 지금 - 캐시갱신시각[i]
        if (나이 > 최대) 최대 = 나이
    }
    return 최대
}

let 직전판정: number[] = []
let 델타: number[] = []
for (let i = 0; i < 64; i++) {
    직전판정.push(-1)
    델타.push(0)
}
const 긴급delta한계mm = 80
const 긴급최대거리mm = 500
const 진행확인시간ms = 1000
const 최소진행mm = 20
const 전진성공간격ms = 800
const 헛돌이감지사용 = false

function 기준값측정(): void {
    let 시작 = input.runningTime()
    기준값 = []
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            let idx = row * 8 + col
            let 값 = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
            기준값.push(값)
            캐시[idx] = 값
        }
    }
    let 완료 = input.runningTime()
    for (let i = 0; i < 64; i++) {
        캐시갱신시각[i] = 완료
    }
    기준값준비됨 = true
    마지막사이클ms = 0
    스캔번호 += 1
    정면막힘연속 = 0
    마지막정면블록스캔번호 = -1
    판정기록리셋()
    로그("BASELINE READY " + (완료 - 시작) + "ms")
    상세로그("BASELINE(row0-7|col0-7) " + 행렬64문자열(기준값))
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
    기준값측정()
    basic.clearScreen()
    로그("DRIVE START")
}

// raw 한 칸을 "장애물 판단용 값"으로 바꾼다: 0=확실히 열림(배경과 일치 포함),
// -1=모름(글리치), 양수=실제 장애물 거리. 기준(그 칸의 평소 배경 거리)이 없거나
// (보정 전, raw==0 글리치였던 칸) 기준 자체가 "확실한 감지없음"이었던 칸이면
// 지금 읍은 값을 그대로 신뢰한다. 기준이 실측 거리(대개 바닥)였던 칸은, 지금
// 값이 그 기준보다 기준값여유mm 이상 가까워졌을 때만 "새 장애물"로 인정한다.
// (raw가 정지거리mm보다 가까우면 기준값과 무관하게 항상 장애물로 보는 안전장치를
// 시도해본 적이 있는데, row7(바닥)이 회전해도 거리가 거의 안 바뀌어서 — 매번
// "장애물"로 잡혀 회전 탐색이 영원히 못 빠져나가는 심각한 회귀를 일으켰다.
// 그래서 기준값 비교만 쓴다. 카운트다운을 마침 벽 앞에서 누르면 그 벽이 평생
// "열림"으로 보이는 한계는 남아있지만, 트인 곳에서 보정하라는 사용 안내로
// 대응하는 게 바닥을 영원히 못 빠져나가는 것보다 낫다.)
function 셀판정(raw: number, 기준: number): number {
    if (raw >= 라이다무효값mm) return 0
    if (raw == 0) return -1
    if (기준 <= 0 || 기준 >= 라이다무효값mm) return raw
    if (raw >= 기준 - 기준값여유mm) return 0
    return raw
}

// 캐시[row*8+col]의 raw 값에 그 칸의 기준값을 적용해 판정한다. 백그라운드
// 스캐너가 이미 갱신해둔 캐시를 읍는 것이므로 이 함수 자체는 I2C를 건드리지 않는다.
function 캐시판정(col: number, row: number): number {
    let idx = row * 8 + col
    let raw = 캐시[idx]
    let 기준 = 기준값준비됨 ? 기준값[idx] : -1
    return 셀판정(raw, 기준)
}

function 원시캐시거리(col: number, row: number): number {
    let raw = 캐시[row * 8 + col]
    if (raw <= 0 || raw >= 라이다무효값mm) return 0
    return raw
}

function 열값읽기범위(col: number, 행시작: number, 행끝: number, 기준사용: boolean): number {
    let 최소 = -1
    let 센티널확인 = false
    for (let row = 행시작; row <= 행끝; row++) {
        let 값 = 기준사용 ? 캐시판정(col, row) : 원시캐시거리(col, row)
        if (값 == 0) {
            센티널확인 = true
        } else if (값 > 0) {
            if (최소 < 0 || 값 < 최소) 최소 = 값
        }
        // 값 == -1(글리치)은 무시 — 열림으로도 막힘으로도 셈하지 않음
    }
    if (최소 >= 0) return 최소
    if (센티널확인) return 0
    return -1
}

function 열값읍기(col: number, 행시작: number, 행끝: number): number {
    return 열값읽기범위(col, 행시작, 행끝, true)
}

// 정밀도레벨이 최고(정밀도레벨개수-1)면 위쪽 절반(row0~3)만 보되, 빠른모드맨아래행주기틱
// 마다 한 번은 전체(row0~7)를 본다 — 가까이 다가갈수록 낮은 장애물이 아래쪽 행에서만
// 보일 수 있어서, 빠른 모드에서도 주기적으로는 놓치지 않게 한다. 그 외 레벨은 항상
// 전체 행을 본다(천천히/꼼꼼).
function 열최소읍기(col: number): number {
    if (정밀도레벨 >= 정밀도레벨개수 - 1) {
        빠른모드틱카운터 += 1
        if (빠른모드틱카운터 % 빠른모드맨아래행주기틱 != 0) {
            return 열값읍기(col, 0, 3)
        }
    }
    return 열값읍기(col, 0, 7)
}

// 매 틱 호출해도 안전하다 — 실제 계산은 스캔번호가 바뀔 때만 1회 수행한다.
// 백그라운드 스캐너 한 바퀴(약 770~800ms)가 메인 루프 틱(40ms)보다 훨씬 느려서,
// 매 틱마다 "지금-이전"을 계산하면 캐시가 안 바뀐 약 19틱 동안은 delta가 항상
// 0이고, 캐시가 막 갱신된 단 1틱에서만 delta가 크게 튀었다가 그 즉시
// 직전판정이 새 값으로 덮여 다음 틱에 다시 0이 된다 — 그러면 "2틱 연속 확인"
// 같은 조건은 스캔 한 바퀴에 delta가 큰 틱이 단 1개뿐이라 사실상 영원히
// 만족할 수 없다(실측 로그에서 DELTA EMERGENCY CANDIDATE가 늘 1/2에서 끊기고
// 2/2로 못 가는 원인이 이것이었다). 스캔번호가 바뀔 때만 계산하면 delta가
// 다음 스캔까지(~780ms) 그대로 유지되어, 그 사이 여러 틱이 같은 값을 보고
// "위험 후보 확인"을 스캔 단위(정면블록확정()과 동일한 패턴)로 누적할 수 있다.
let 마지막델타스캔번호 = -1
function 델타갱신(): void {
    if (마지막델타스캔번호 == 스캔번호) return
    마지막델타스캔번호 = 스캔번호
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            let idx = row * 8 + col
            let 지금 = 캐시판정(col, row)
            let 이전 = 직전판정[idx]
            // 둘 다 실측 장애물 거리(양수)일 때만 의미 있는 변화량을 만든다.
            // 한쪽이라도 "확실히 열림(0)"이거나 "모름(-1)"이면 그 센티널을
            // 진짜 숫자 0처럼 빼버리는 순간 부호가 거꾸로 나온다 — 예를 들어
            // 장애물(실측 900대)이 사라져 열림(0)으로 바뀐 "안전해진" 경우가
            // 델타 = 900 - 0 = +900으로 계산되어 "급접근"으로 오인되고, 반대로
            // 열림(0)에서 갑자기 실측 장애물이 나타난 진짜 위험한 경우는 델타가
            // 음수가 되어 전혀 안 잡혔다. 그래서 0/-1이 섞인 전환은 delta로
            // 보지 않고 0(변화없음)으로 둔다 — "갑자기 가까워짐"은 실측 거리가
            // 있는 상태에서 실측 거리로 더 가까워질 때만 잡는다.
            델타[idx] = (이전 > 0 && 지금 > 0) ? (이전 - 지금) : 0
            직전판정[idx] = 지금
        }
    }
}

// 필터링 전 raw 캐시(전체64로그)와 그 raw에서 계산된 delta(64칸 전부)를 판단
// 직전에 그대로 로그로 보낸다 — row0~1만 보는 게 맞는 좁히기인지, 다른 행/열도
// 같이 봐야 하는지를 사용자가 실측 데이터로 직접 검증/조정할 수 있게 한다.
// 디버그레벨 2(상세)에서만 보낸다.
function 델타64로그(): void {
    상세로그("DELTA(row0-7|col0-7) " + 행렬64문자열(델타))
}

// 정면 중앙 4열(2~5) 중 한 칸이라도 한 틱 사이 긴급delta한계mm 이상 가까워지고,
// 동시에 "지금" 거리 자체가 긴급최대거리mm 이내일 때만 위험 후보로 본다. delta만
// 보고 절대 거리를 안 따졌을 때, 실측 로그에서 700~1500mm처럼 먼 거리에 있는
// 물체의 정상적인 ToF 센서 흔들림(먼 거리일수록 더 큼)만으로도 80mm 이상
// 차이가 자주 나서 — 진짜 가까운 장애물 없이도 긴급정지가 계속 발동했다(예:
// 1294mm -> 1199mm, 95mm 차이지만 둘 다 멀어서 전혀 위험하지 않은 변화).
// row0~1만 본다(row2~7은 제외) — 실측 BASELINE 로그에서 row0/1은 8열 전체가
// 일정한 값(노이즈 적음)인데, row2 아래로는 같은 칸이라도 스캔마다 크게 흔들렸다.
// 백그라운드 스캐너 한 바퀴(약 0.7~0.8초)가 메인 루프 틱(40ms)보다 훨씬 느려서,
// delta 비교가 사실상 "거의 1초 전 값과 지금 값"을 비교하는 셈이라 노이즈가
// 더 잘 드러난다. 이 좁히기/거리 조건이 맞는지는 아래 전체64로그()/델타64로그()
// 출력으로 직접 확인해 필요하면 조정한다.
// 추가로 정면블록확정()과 같은 식으로 "긴급확인필요(2)스캔 연속" 확인을 거친다 —
// 단 한 스캔짜리 튐(오작동)으로 즉시 발동하지 않고, 다음 스캔에도 같은 위험
// 후보가 다시 보여야 진짜 위험으로 확정한다. 후보가 안 보이면 그 즉시 카운터를
// 리셋한다. 마지막긴급스캔번호로 같은 스캔 안의 여러 틱에서 중복 증가하지
// 않게 막는다(델타갱신()이 스캔 단위로만 갱신되므로 한 스캔 안에서는 조건이
// 항상 같은 값이라, 증가를 스캔당 1회로만 제한해야 "2회 확인"이 의미가 있다).
let 긴급연속 = 0
let 마지막긴급스캔번호 = -1
const 긴급확인필요 = 2

function 판정기록리셋(): void {
    for (let i = 0; i < 64; i++) {
        직전판정[i] = -1
        델타[i] = 0
    }
    긴급연속 = 0
    마지막긴급스캔번호 = -1
}

function 정면긴급위험(): boolean {
    전체64로그()
    델타64로그()
    let 중앙열 = [2, 3, 4, 5]
    for (let i = 0; i < 중앙열.length; i++) {
        let col = 중앙열[i]
        for (let row = 0; row < 2; row++) {
            let idx = row * 8 + col
            let 지금 = 직전판정[idx]
            if (델타[idx] >= 긴급delta한계mm && 지금 > 0 && 지금 <= 긴급최대거리mm) {
                if (마지막긴급스캔번호 != 스캔번호) {
                    마지막긴급스캔번호 = 스캔번호
                    긴급연속 += 1
                    로그("DELTA EMERGENCY CANDIDATE " + 긴급연속 + "/" + 긴급확인필요
                        + " col" + col + " row" + row + " delta" + 델타[idx] + " now" + 지금 + " scan=" + 스캔번호)
                }
                return 긴급연속 >= 긴급확인필요
            }
        }
    }
    긴급연속 = 0
    return false
}

let 진행추적시작시각 = 0
let 진행추적시작거리 = -1
let 마지막전진성공확인시각 = 0
let 마지막직진보정시각 = 0

function 제한값(값: number, 최소값: number, 최대값: number): number {
    return Math.max(최소값, Math.min(최대값, 값))
}

// 한 열의 거리를 "조향 판단용 값"으로 바꾼다 — 열림(0)/모름(-1)은 "충분히 멀다"로
// 보고 조향거리mm보다 한 단계 더 먼 값으로 취급한다(차이 계산에서 0으로 들어가
// 양쪽이 똑같이 "안 가까움"으로 상쇄되게 하기 위함).
function 조향거리값(col: number): number {
    let 값 = 열최소읍기(col)
    if (값 <= 0) return 조향거리mm + 1
    return 값
}

// col2,3(왼쪽)과 col4,5(오른쪽) 중 더 가까운 쪽을 비교해서, 가까운 쪽 반대로
// 트는 보정값을 만든다. 양수=오른쪽이 더 가까움(왼쪽으로 틀어야 = 오른쪽
// 바퀴를 더 빠르게), 음수=왼쪽이 더 가까움(오른쪽으로 틀어야 = 왼쪽 바퀴를
// 더 빠르게). 직진보정()의 "보정" 변수와 같은 부호 규칙(왼쪽명령 = 속도-보정,
// 오른쪽명령 = 속도+보정)을 따른다. 양쪽 다 조향거리mm 이상 멀면 0(보정 없음).
function 장애물조향보정(): number {
    let 왼쪽 = Math.min(조향거리값(2), 조향거리값(3))
    let 오른쪽 = Math.min(조향거리값(4), 조향거리값(5))
    if (왼쪽 >= 조향거리mm && 오른쪽 >= 조향거리mm) return 0
    let 차이 = 오른쪽 - 왼쪽
    return Math.round(제한값((차이 / 조향거리mm) * 조향최대보정, -조향최대보정, 조향최대보정))
}

// 장애물 조향(장애물조향보정)과 직진 유지 보정(직진보정, readRealTimeSpeed 기반)은
// 동시에 더하지 않는다 — 장애물을 피해 휘는 중에는 "똑바로 가도록" 좌우 속도를
// 맞추는 보정이 오히려 휘는 동작을 약화시키거나 충돌한다. 장애물조향보정이
// 0이 아니면(피하는 중) 그 값만 적용하고, 0이면(트인 길) 평소처럼 직진보정만
// 적용한다 — 두 보정은 서로 다른 상황(직진/회피)에서만 켜지므로 항상 둘 중
// 하나만 작동한다.
function 직진모터명령(속도: number): void {
    let 장애물보정 = 장애물조향보정()
    if (장애물보정 != 0) {
        상세로그("STEER bias=" + 장애물보정 + " (+ = turn left, - = turn right)")
        let 왼쪽명령 = Math.round(제한값(속도 - 장애물보정, 0, 255))
        let 오른쪽명령 = Math.round(제한값(속도 + 장애물보정, 0, 255))
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 왼쪽명령)
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 오른쪽명령)
        return
    }
    if (!직진보정사용) {
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Forward, 속도)
        return
    }
    let 왼쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
    let 오른쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
    let 보정 = 0
    if (왼쪽실속 > 0 || 오른쪽실속 > 0) {
        보정 = 제한값((왼쪽실속 - 오른쪽실속) * 직진보정게인, -직진보정최대, 직진보정최대)
    }
    let 왼쪽명령 = Math.round(제한값(속도 - 보정, 0, 255))
    let 오른쪽명령 = Math.round(제한값(속도 + 보정, 0, 255))
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 왼쪽명령)
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 오른쪽명령)
}

function 직진보정틱(속도: number): void {
    if (input.runningTime() - 마지막직진보정시각 < 직진보정간격ms) return
    마지막직진보정시각 = input.runningTime()
    직진모터명령(속도)
}

// 벽이나 낮은 장애물에 막혀 모터는 전진 명령을 받고 있는데도 바퀴가 실제로
// 못 움직이는 경우(라이다 시야 밖이라 정면블록확정()/정면긴급위험()이 못 잡는
// 충돌)를 감지한다. readRealTimeSpeed()로 측정한 좌/우 실제 속도(엔코더 PID가
// 보는 값과 동일한 신호)가 둘 다 정지감지속도cms 이하인 상태가
// 정지감지시간ms 이상 이어지면 "꼼짝 못함"으로 본다. 한쪽이라도 그 이상으로
// 움직이면(정상 주행 또는 살짝이라도 전진 중) 그 즉시 타이머를 리셋한다.
const 정지감지속도cms = 1
const 정지감지시간ms = 600
let 정지감지시작시각 = -1

function 모터정지감지(): boolean {
    let 왼쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
    let 오른쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
    if (왼쪽실속 > 정지감지속도cms || 오른쪽실속 > 정지감지속도cms) {
        정지감지시작시각 = -1
        return false
    }
    if (정지감지시작시각 < 0) {
        정지감지시작시각 = input.runningTime()
        return false
    }
    if (input.runningTime() - 정지감지시작시각 >= 정지감지시간ms) {
        로그("MOTOR STALL DETECTED L=" + 왼쪽실속 + " R=" + 오른쪽실속
            + " for " + 정지감지시간ms + "ms")
        return true
    }
    return false
}

// col2~5(정면안전이 보는 폭) 중 가장 가까운 값을 본다 — col3 하나만 보면 실측
// 로그에서 col3가 유독 자주 흔들리는 열이라 진행 측정 자체가 노이즈에 약했다.
// 0(열림)인 칸은 무시하고, 실측 장애물이 있는 칸 중 최솟값을 기준으로 삼는다.
function 정면추적거리(): number {
    let 칸들 = [2, 3, 4, 5]
    let 최소 = -1
    for (let i = 0; i < 칸들.length; i++) {
        let 값 = 열값읽기범위(칸들[i], 정면판정행시작, 정면판정행끝, true)
        if (값 > 0 && (최소 < 0 || 값 < 최소)) 최소 = 값
    }
    return 최소
}

function 진행추적초기화(): void {
    진행추적시작시각 = input.runningTime()
    진행추적시작거리 = 정면추적거리()
}

// 전진 중일 때만 호출한다. 정면 중앙 4열 중 가장 가까운 거리가 진행확인시간ms
// 동안 최소진행mm 이상 바뀌지 않으면 "라이다로 안 보이는 것에 막혔거나 바퀴가
// 헛돌고 있다"로 판단한다. 추적할 기준 거리가 없으면(트인 공간, 4열 모두 0/-1)
// 그냥 새로 추적을 시작하고 false를 반환한다 — 열린 공간에서는 진행량을 측정할
// 기준이 없으므로 문제 삼지 않는다.
function 헛돌이감지(): boolean {
    if (진행추적시작거리 <= 0) {
        진행추적초기화()
        return false
    }
    if (input.runningTime() - 진행추적시작시각 < 진행확인시간ms) return false
    let 지금거리 = 정면추적거리()
    let 변화 = 지금거리 <= 0 ? 999999 : Math.abs(진행추적시작거리 - 지금거리)
    진행추적초기화()
    if (변화 < 최소진행mm) {
        로그("STUCK/SLIP detected: moved only " + 변화 + "mm in " + 진행확인시간ms + "ms")
        return true
    }
    return false
}

function 전체열스캔(): number[] {
    return 전체열스캔범위(0, 7, true)
}

function 전체열스캔범위(행시작: number, 행끝: number, 기준사용: boolean): number[] {
    let 결과: number[] = []
    for (let col = 0; col < 8; col++) {
        결과.push(열값읽기범위(col, 행시작, 행끝, 기준사용))
    }
    return 결과
}

function 칸안전(거리: number, 추가여유mm: number): boolean {
    if (거리 < 0) return false
    if (거리 == 0) return true
    return 거리 >= 정지거리mm + 추가여유mm
}

function 정면막힘열수(추가여유mm: number, 행끝: number, 기준사용: boolean): number {
    let 막힌열 = 0
    let 열들 = [2, 3, 4, 5]
    for (let i = 0; i < 열들.length; i++) {
        if (!칸안전(열값읽기범위(열들[i], 정면판정행시작, 행끝, 기준사용), 추가여유mm)) {
            막힌열 += 1
        }
    }
    return 막힌열
}

function 정면안전범위(추가여유mm: number, 행끝: number, 기준사용: boolean): boolean {
    return 정면막힘열수(추가여유mm, 행끝, 기준사용) < 정면막힘열확인필요
}

// col3,4(중앙 2열, ±7.5도)만 보면 가까운 거리에서는 로봇 차체 폭보다 좁은
// 영역만 확인하는 셈이라(예: 300mm 거리에서 2열 폭은 약 80mm뿐), col2~5
// 4열(±15도)로 넓혀 차체 폭에 더 가깝게 정면 안전을 확인한다. 라이다가 바닥을
// 살짝 보도록 숙여진 장착에서는 row6/7 바닥값이 200~330mm로 계속 잡히므로,
// 주행 안전 판단에는 row0~4까지만 쓴다. row5~7은 표시/디버그/점수에는 남긴다.
function 정면안전(추가여유mm: number): boolean {
    return 정면안전범위(추가여유mm, 정면판정행끝, true)
}

// 회전 중에는 출발 시점 기준값과 현재 장면이 같을 수 없다. 기준값 비교를 쓰면
// 회전으로 장면이 바뀐 것 자체가 장애물로 보이므로, 탐색 중에는 raw 상단 행만
// 보고 충분히 열린 방향인지 판단한다. 방향을 찾은 뒤 새 헤딩에서 기준값을 다시 잡는다.
function 회전탐색정면안전(): boolean {
    return 정면안전범위(0, 회전탐색판정행끝, false)
}

// 추가여유mm로 전진여유mm(고정값)을 넘긴다 — 속도 직접 제어라 "이번에 몇 mm
// 갈지"를 정확히 모르므로, 거리 기반 적응 스텝 대신 루프 주기/캐시 지연을
// 감안한 고정 버퍼를 쓴다.
function 정면블록확정(): boolean {
    let 막힌열 = 정면막힘열수(전진여유mm, 정면판정행끝, true)
    if (막힌열 < 정면막힘열확인필요) {
        if (정면막힘연속 > 0) 로그("FRONT CLEAR AGAIN (was " + 정면막힘연속 + ")")
        정면막힘연속 = 0
        마지막정면블록스캔번호 = -1
        return false
    }
    if (마지막정면블록스캔번호 == 스캔번호) {
        return false
    }
    마지막정면블록스캔번호 = 스캔번호
    정면막힘연속 += 1
    로그("FRONT BLOCKED CHECK " + 정면막힘연속 + "/" + 정면막힘확인필요
        + " cols=" + 막힌열 + " scan=" + 스캔번호)
    return 정면막힘연속 >= 정면막힘확인필요
}

let 회전탐색중 = false
let 회전탐색방향 = 1
let 회전탐색시작시각 = 0
let 회전탐색반복횟수 = 0
const 회전1회각도 = 170
const 회전1회예상ms = 4000
const 회전탐색최대반복 = 3
const 회전탐색확정추가각도 = 25

let 정밀도레벨 = 0
let 빠른모드틱카운터 = 0
const 정밀도레벨개수 = 3
const 정밀도증가조건 = 3
const 빠른모드맨아래행주기틱 = 5

// 정밀도 레벨과 전진속도를 같은 신호(연속 성공/실패)로 함께 조정한다 — 익숙한
// 공간에서는 속도를 점점 올리고(최대전진속도까지), 회피/탈출이 발생하면 속도를
// 깎는다(최소전진속도까지). 거리 기반 적응 스텝 대신 "속도"가 적응 대상이다.
function 정밀도증가확인(): void {
    if (input.runningTime() - 마지막전진성공확인시각 < 전진성공간격ms) return
    마지막전진성공확인시각 = input.runningTime()
    전진성공연속 += 1
    if (전진성공연속 >= 전진성공증가조건) {
        전진성공연속 = 0
        전진속도 = Math.min(최대전진속도, 전진속도 + 속도증가스텝)
        if (정밀도레벨 < 정밀도레벨개수 - 1) {
            정밀도레벨 += 1
            로그("PRECISION UP -> " + 정밀도레벨 + " speed=" + 전진속도)
        }
    }
}

function 정밀도소폭감소(): void {
    전진성공연속 = 0
    마지막전진성공확인시각 = input.runningTime()
    전진속도 = Math.max(최소전진속도, 전진속도 - 속도감소스텝)
    if (정밀도레벨 > 0) {
        정밀도레벨 -= 1
        로그("PRECISION DOWN -> " + 정밀도레벨 + " speed=" + 전진속도)
    }
}

function 정밀도리셋(): void {
    전진성공연속 = 0
    마지막전진성공확인시각 = input.runningTime()
    전진속도 = 최소전진속도
    if (정밀도레벨 != 0) {
        정밀도레벨 = 0
        로그("PRECISION RESET -> 0 speed=" + 전진속도)
    }
}

// pidControlAngle(.., Allowed)는 회전 명령만 던지고 즉시 반환한다(완료를 기다리지
// 않음) — 그래서 메인 루프가 회전 중에도 계속 돌면서 캐시를 확인할 수 있다.
// 회전 탐색은 정밀한 각도가 필요해 원본과 동일하게 엔코더 PID를 그대로 쓴다.
function 회전탐색시작(): void {
    회전탐색중 = true
    회전탐색방향 = Math.random() < 0.5 ? 1 : -1
    회전탐색반복횟수 = 0
    상태 = "SEARCH"
    마지막판단 = "ROTATE " + (회전탐색방향 > 0 ? "CW" : "CCW")
    로그("ROTATE SEARCH START dir=" + 회전탐색방향)
    maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전1회각도, maqueenPlusV2.MyInterruption.Allowed)
    회전탐색시작시각 = input.runningTime()
}

function 회전탐색방향확정(): boolean {
    maqueenPlusV2.pidControlStop()
    basic.pause(120)
    maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전탐색확정추가각도, maqueenPlusV2.MyInterruption.NotAllowed)
    basic.pause(200)
    if (!회전탐색정면안전()) {
        로그("ROTATE CANDIDATE LOST, continue")
        maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전1회각도, maqueenPlusV2.MyInterruption.Allowed)
        회전탐색시작시각 = input.runningTime()
        return false
    }
    기준값측정()
    진행추적초기화()
    회전탐색중 = false
    실패연속 = 0
    마지막판단 = "FOUND CONFIRMED"
    로그("ROTATE FOUND CONFIRMED +" + 회전탐색확정추가각도)
    return true
}

// 매 틱 호출한다. 충분한 공간을 찾으면 그 자리에서 즉시 멈추고(pidControlStop)
// 회전탐색중을 false로 만든다 — 다음 틱에 메인 루프가 평상시 전진으로 넘어간다.
// 한 번의 170도 회전이 끝났을 시간(회전1회예상ms)이 지났는데도 못 찾았으면 같은
// 방향으로 한 번 더 돌리고, 회전탐색최대반복(약 510도)을 넘기면 포기하고
// 회전탐색중을 false로 만든다(이 경우 실패연속 증가/탈출 판단은 메인 루프가
// 다음 정면블록확정() 체크에서 자연스럽게 처리한다).
function 회전탐색틱(): void {
    if (회전탐색정면안전()) {
        if (회전탐색방향확정()) return
        return
    }
    if (input.runningTime() - 회전탐색시작시각 >= 회전1회예상ms) {
        회전탐색반복횟수 += 1
        if (회전탐색반복횟수 >= 회전탐색최대반복) {
            maqueenPlusV2.pidControlStop()
            회전탐색중 = false
            마지막판단 = "ROTATE SEARCH EXHAUSTED"
            로그("ROTATE SEARCH EXHAUSTED after " + 회전탐색반복횟수 + " turns")
            return
        }
        maqueenPlusV2.pidControlAngle(회전탐색방향 * 회전1회각도, maqueenPlusV2.MyInterruption.Allowed)
        회전탐색시작시각 = input.runningTime()
    }
}

// 64개짜리 평면 배열(row*8+col 순서)을 row 단위로 "|" 구분, 한 줄 안에서는
// col0~7을 ","로 구분한 문자열로 만든다 — RAW 덤프/기준값 로그가 공유한다.
function 행렬64문자열(배열: number[]): string {
    let 결과 = ""
    for (let row = 0; row < 8; row++) {
        if (row > 0) 결과 += "|"
        for (let col = 0; col < 8; col++) {
            if (col > 0) 결과 += ","
            결과 += 배열[row * 8 + col]
        }
    }
    return 결과
}

// 좌/우 실시간 속도와 누적 이동거리를 함께 남긴다 — 다음 직진 테스트에서
// "왜 똑바로 안 가는지"(직진보정이 못 따라잡는 좌우 속도 편차인지, 그 외
// 원인인지)를 raw 8x8 덤프뿐 아니라 수치로도 바로 확인할 수 있게 한다.
function 직진테스트로그(왼쪽실속: number, 오른쪽실속: number): void {
    let 경과 = input.runningTime() - 직진테스트시작시각
    로그("TF," + 직진테스트샘플번호 + "," + 경과 + "," + 직진테스트속도
        + "," + 왼쪽실속 + "," + 오른쪽실속 + "," + Math.round(직진테스트이동cm)
        + "," + 캐시최대나이ms() + "," + 마지막사이클ms + "," + 행렬64문자열(캐시))
    직진테스트샘플번호 += 1
}

function 라이다고정점패킷문자열(x: number, y: number): string {
    let length = 2
    let sendBuffer = pins.createBuffer(6)
    sendBuffer[0] = 0x55
    sendBuffer[1] = ((length + 1) >> 8) & 0xff
    sendBuffer[2] = (length + 1) & 0xff
    sendBuffer[3] = 라이다CMD고정점
    sendBuffer[4] = x
    sendBuffer[5] = y
    pins.i2cWriteBuffer(라이다주소, sendBuffer)
    basic.pause(10)

    let 시작 = input.runningTime()
    while (input.runningTime() - 시작 < 라이다진단타임아웃ms) {
        let status = pins.i2cReadNumber(라이다주소, NumberFormat.Int8LE)
        if (status != 0xff) {
            if (status == 라이다STATUS성공 || status == 라이다STATUS실패) {
                let cmd = pins.i2cReadNumber(라이다주소, NumberFormat.Int8LE)
                let lenBuf = pins.i2cReadBuffer(라이다주소, 2)
                let len = lenBuf[1] << 8 | lenBuf[0]
                let out = "" + x + "," + y + "," + status + "," + cmd + "," + len
                if (cmd != 라이다CMD고정점 || len <= 0) return out
                let dataBuf = pins.i2cReadBuffer(라이다주소, len)
                let n = Math.min(len, 12)
                for (let i = 0; i < n; i++) {
                    out += "," + dataBuf[i]
                }
                return out
            }
        }
        basic.pause(1)
    }
    return "" + x + "," + y + ",TIMEOUT"
}

function 라이다패킷진단로그(): void {
    백그라운드스캔일시정지 = true
    basic.pause(50)
    로그("TP,fmt,x,y,status,cmd,len,data...")
    로그("TP," + 라이다고정점패킷문자열(3, 1))
    로그("TP," + 라이다고정점패킷문자열(4, 1))
    로그("TP," + 라이다고정점패킷문자열(3, 4))
    로그("TP," + 라이다고정점패킷문자열(4, 4))
    로그("TP," + 라이다고정점패킷문자열(3, 6))
    백그라운드스캔일시정지 = false
}

function 직진테스트시작(): void {
    직진테스트요청 = false
    직진테스트정지요청 = false
    직진테스트중 = true
    직진테스트모터중 = false
    직진테스트샘플번호 = 0
    주행중 = false
    회전탐색중 = false
    실패연속 = 0
    정면막힘연속 = 0
    상태 = "TESTFWD"
    마지막판단 = "TEST START"
    maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
    maqueenPlusV2.pidControlStop()
    로그("TESTFWD START speed=" + 직진테스트속도 + " target=" + 직진테스트목표cm
        + "cm limit=" + 직진테스트시간제한ms + "ms log=" + 직진테스트로그간격ms)
    기준값측정()
    직진테스트시작시각 = input.runningTime()
    마지막직진테스트로그시각 = 직진테스트시작시각 - 직진테스트로그간격ms
    직진테스트이동cm = 0
    직진테스트마지막틱시각 = 직진테스트시작시각
    직진모터명령(직진테스트속도)
    직진테스트모터중 = true
    basic.showIcon(IconNames.SmallDiamond)
}

function 직진테스트정지(이유: string): void {
    maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
    직진테스트중 = false
    직진테스트모터중 = false
    직진테스트정지요청 = false
    상태 = "BOOT"
    마지막판단 = "TEST DONE"
    로그("TESTFWD DONE " + 이유 + " samples=" + 직진테스트샘플번호
        + " elapsed=" + (input.runningTime() - 직진테스트시작시각)
        + " moved=" + Math.round(직진테스트이동cm) + "cm")
    basic.showIcon(IconNames.Target)
}

// 측정 전용 모드라 인코더 PID(pidControlDistance, 속도 고정=2)는 안 쓴다 — 대신
// readRealTimeSpeed()로 좌/우 실제 속도(cm/s)를 매 틱 적분해 이동거리를 누적하고,
// 직진테스트목표cm에 도달하면 멈춘다. 라이다로는 안 보이는 곳(예: 장애물 없는
// 빈 공간)에서 "몇 cm 가면 충분한지"를 직접 재는 용도이므로 시간 제한이 아니라
// 거리 도달이 정지 기준이다(시간제한ms는 막힘 등으로 거리에 못 도달했을 때를
// 대비한 안전 타임아웃일 뿐).
function 직진테스트틱(): void {
    let 지금 = input.runningTime()
    let 경과 = 지금 - 직진테스트시작시각
    상태 = "TESTFWD"
    마지막판단 = "TF " + Math.round(직진테스트이동cm) + "cm"
    if (!직진테스트모터중) {
        직진모터명령(직진테스트속도)
        직진테스트모터중 = true
    }
    직진보정틱(직진테스트속도)
    let 왼쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
    let 오른쪽실속 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
    let dt초 = (지금 - 직진테스트마지막틱시각) / 1000
    직진테스트마지막틱시각 = 지금
    직진테스트이동cm += ((왼쪽실속 + 오른쪽실속) / 2) * dt초
    if (지금 - 마지막직진테스트로그시각 >= 직진테스트로그간격ms) {
        마지막직진테스트로그시각 = 지금
        직진테스트로그(왼쪽실속, 오른쪽실속)
    }
    if (직진테스트정지요청) {
        직진테스트정지("BUTTON")
    } else if (직진테스트이동cm >= 직진테스트목표cm) {
        직진테스트정지("TARGET")
    } else if (경과 >= 직진테스트시간제한ms) {
        직진테스트정지("TIMELIMIT")
    }
}

// 백그라운드 스캐너가 갱신해둔 캐시를 그대로 로그로 보낸다(필터링 이전 raw 값).
// 64개 값 전부라 디버그레벨 2(상세)에서만 보낸다 — 막힘이 막 확정된 시점에
// 호출해서, 최적화/진단 시 "왜 막힘으로 판단했는지"를 raw 단계까지 볼 수 있게 한다.
function 전체64로그(): void {
    상세로그("RAW(row0-7|col0-7) " + 행렬64문자열(캐시))
}

function 점수용거리(원시거리: number): number {
    if (원시거리 < 0) return 0
    if (원시거리 == 0) return 탐색점수상한mm
    return Math.min(원시거리, 탐색점수상한mm)
}

function 탐색점수계산(기준사용: boolean): number {
    let 거리목록 = 기준사용 ? 전체열스캔() : 전체열스캔범위(0, 회전탐색판정행끝, false)
    let 점수 = 0
    for (let col = 0; col < 8; col++) {
        let 거리 = 점수용거리(거리목록[col])
        점수 += 거리 * 열가중치[col]
    }
    return 점수
}

// 진입절대각: 이 단계의 각도목록이 측정하는 각 후보각이 탈출360() 진입 헤딩(0) 기준
// 절대적으로 몇 도인지(현재는 모든 단계가 같은 진입 헤딩에서 시작하므로 0). 단계가
// 탈출최소점수를 못 넘기더라도 전역최고점수/전역최고절대각에 후보를 계속 누적해서,
// 4단계를 모두 거치고도 기준을 못 넘긴 경우 "그나마 가장 나은 방향"을 알 수 있게 한다.
// 360도 탈출도 정밀한 각도가 필요해 원본과 동일하게 엔코더 PID를 그대로 쓴다.
function 열각도순회탐색(각도목록: number[], 진입절대각: number): number {
    let 최고점수 = -999999
    let 최고각 = 각도목록[0]
    maqueenPlusV2.pidControlAngle(각도목록[0], maqueenPlusV2.MyInterruption.NotAllowed)
    for (let i = 0; i < 각도목록.length; i++) {
        let 후보각 = 각도목록[i]
        let 점수 = 탐색점수계산(false)
        if (점수 > 최고점수) {
            최고점수 = 점수
            최고각 = 후보각
        }
        if (점수 > 전역최고점수) {
            전역최고점수 = 점수
            전역최고절대각 = 진입절대각 + 후보각
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
    전역최고점수 = -999999
    전역최고절대각 = 0

    let 최고각 = 열각도순회탐색(탈출각도, 0)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-FINE"
    최고각 = 열각도순회탐색(탈출각도세밀, 0)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-BACK-R"
    최고각 = 열각도순회탐색(탈출각도세밀후방우, 0)
    if (마지막탐색점수 >= 탈출최소점수) return true
    maqueenPlusV2.pidControlAngle(-최고각, maqueenPlusV2.MyInterruption.NotAllowed)

    상태 = "ESCAPE-BACK-L"
    최고각 = 열각도순회탐색(탈출각도세밀후방좌, 0)
    if (마지막탐색점수 >= 탈출최소점수) return true

    // 4단계 모두 절대 기준(탈출최소점수)을 못 넘김 — 그래도 지금까지 본 것 중
    // 가장 점수가 높았던 방향으로 향한다(현재 헤딩은 마지막 단계가 끝난 위치인
    // "최고각"). 전역최고점수가 0 이하(사실상 사방이 막힘)일 때만 진짜로 포기한다.
    let 현재헤딩 = 최고각
    let 최종회전 = 전역최고절대각 - 현재헤딩
    // pidControlAngle은 -180~180 범위만 유효(그 이상은 1바이트로 보내져 값이 깨짐) —
    // 같은 절대 방향이라도 짧은 쪽으로 돌도록 ±360을 더해 범위 안으로 정규화한다.
    while (최종회전 > 180) 최종회전 -= 360
    while (최종회전 < -180) 최종회전 += 360
    마지막탐색점수 = 전역최고점수
    if (전역최고점수 <= 0) {
        로그("ALL 360 ESCAPE STAGES FAILED, BEST SCORE " + 전역최고점수 + " -> NO ESCAPE")
        return false
    }
    로그("ALL 360 STAGES BELOW THRESHOLD -> TAKE BEST " + 전역최고절대각 + " SCORE " + 전역최고점수)
    maqueenPlusV2.pidControlAngle(최종회전, maqueenPlusV2.MyInterruption.NotAllowed)
    return true
}

input.onButtonPressed(Button.A, function () {
    if (직진테스트중 || 직진테스트요청) {
        로그("BUTTON A TEST STOP")
        직진테스트정지요청 = true
        직진테스트요청 = false
    } else if (!주행시작됨) {
        로그("BUTTON A TEST START")
        직진테스트요청 = true
    } else {
        로그("BUTTON A IGNORED AUTONOMOUS")
    }
})

input.onButtonPressed(Button.AB, function () {
    if (!주행시작됨 && !직진테스트중 && !직진테스트요청) {
        로그("BUTTON AB TP DIAG")
        라이다패킷진단로그()
    } else {
        로그("BUTTON AB IGNORED BUSY")
    }
})

input.onButtonPressed(Button.B, function () {
    if (!주행시작됨 && !직진테스트중 && !직진테스트요청) {
        로그("BUTTON B PRESSED")
        출발요청 = true
    } else {
        로그("BUTTON B IGNORED BUSY")
    }
})

로봇초기화()

control.inBackground(function () {
    while (true) {
        if (백그라운드스캔일시정지) {
            basic.pause(20)
            continue
        }
        let 시작 = input.runningTime()
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                let idx = row * 8 + col
                캐시[idx] = matrixLidarDistance.matrixPointOutput(라이다주소, col, row)
                캐시갱신시각[idx] = input.runningTime()
            }
        }
        마지막사이클ms = input.runningTime() - 시작
        스캔번호 += 1
        if (디버그레벨 >= 3) 로그("SCAN CYCLE " + 마지막사이클ms + "ms")
    }
})

basic.forever(function () {
    if (디버그레벨 >= 1 && input.runningTime() - 마지막하트비트시각 >= 하트비트간격ms) {
        마지막하트비트시각 = input.runningTime()
        로그("HB state=" + 상태 + " dec=" + 마지막판단 + " speed=" + 전진속도
            + " failStreak=" + 실패연속 + " blockStreak=" + 정면막힘연속
            + " precision=" + 정밀도레벨 + " cacheAge=" + 캐시최대나이ms()
            + " cycleMs=" + 마지막사이클ms + " scan=" + 스캔번호 + " started=" + 주행시작됨)
    }

    if (직진테스트요청 && !주행시작됨) {
        직진테스트시작()
        basic.pause(루프대기ms)
        return
    }

    if (직진테스트중) {
        직진테스트틱()
        basic.pause(루프대기ms)
        return
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

    델타갱신()

    // 우선순위 1: 긴급 위험 — 회전 중이든 전진 중이든 최우선으로 처리. 전진/회전
    // 둘 다 멈춘 뒤, 모터 속도를 직접 제어해 정해진 시간만큼만 후진한다(엔코더
    // 거리 제어가 아니므로 거리 대신 시간으로 끊는다). 후진만 하고 끝내면 다음
    // 틱에 다시 똑같이 막혀서 "긴급후진, 긴급후진"만 반복할 수 있다 — 후진 직후
    // 바로 회전 탐색을 시작해서, 후진으로 확보한 공간에서 주변을 둘러보고
    // 실제로 갈 수 있는 방향을 데이터로 찾게 한다.
    if (!회전탐색중 && 정면긴급위험()) {
        if (주행중) {
            maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
            주행중 = false
        }
        if (회전탐색중) {
            maqueenPlusV2.pidControlStop()
            회전탐색중 = false
        }
        상태 = "EMERGENCY"
        마지막판단 = "EMERGENCY BACKOFF"
        로그("EMERGENCY BACKOFF speed=" + 후진속도 + " for " + 후진시간ms + "ms")
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Backward, 후진속도)
        basic.pause(후진시간ms)
        maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
        회전탐색시작()
        lcd표시(false)
        basic.pause(루프대기ms)
        return
    }

    // 우선순위 1.5: 물리적 정지 감지 — 라이다 시야 밖의 벽/낮은 장애물에 부딫혀
    // 정면블록확정()/정면긴급위험() 둘 다 안 잡았는데도 실제로는 바퀴가 못
    // 움직이는 경우. 전진 중일 때만 의미가 있다(회전탐색/긴급후진 중에는 다른
    // 경로가 이미 그 움직임을 책임진다). EMERGENCY와 같은 방식으로 짧게 후진한
    // 뒤 회전 탐색을 시작해 빠져나갈 방향을 다시 찾는다.
    if (주행중 && 모터정지감지()) {
        maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
        주행중 = false
        정지감지시작시각 = -1
        상태 = "STALL"
        마지막판단 = "STALL BACKOFF"
        로그("STALL BACKOFF speed=" + 후진속도 + " for " + 후진시간ms + "ms")
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Backward, 후진속도)
        basic.pause(후진시간ms)
        maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
        회전탐색시작()
        lcd표시(false)
        basic.pause(루프대기ms)
        return
    }

    // 우선순위 2: 회전 탐색 중이면 매 틱 확인(찾으면 즉시 멈추고, 소진되면
    // 회전탐색중이 false가 되어 아래 평상시 판단으로 자연스럽게 넘어간다)
    if (회전탐색중) {
        회전탐색틱()
        lcd표시(false)
        basic.pause(루프대기ms)
        return
    }

    // 우선순위 3: 평상시 전진/막힘 판단. controlMotor()는 명령을 내리면 바로
    // 반환하고 모터는 계속 그 속도로 돈다 — 그래서 이미 주행중이면 매 틱마다
    // 다시 명령을 내릴 필요가 없다(한 번만 걸고, 안전하지 않을 때만 멈춘다).
    if (!정면블록확정()) {
        if (정면막힘연속 > 0) {
            상태 = "CHECK"
            마지막판단 = "RECHECK " + 정면막힘연속
        } else {
            상태 = "DRIVE"
            마지막판단 = "FWD speed" + 전진속도
            if (!주행중) {
                직진모터명령(전진속도)
                주행중 = true
            } else {
                직진보정틱(전진속도)
            }
            if (헛돌이감지사용 && 헛돌이감지()) {
                마지막판단 = "STUCK/SLIP"
                로그("STUCK/SLIP DETECTED while driving")
                // 다음 틱에 즉시 "막힘 확정" 분기로 들어가게 강제한다(정면블록확정()의
                // 내부 카운터를 직접 채움) — 라이다로는 안 보이는 것에 막혔을 때도
                // 막힘 경로(우선순위 4)로 자연스럽게 이어지게 하기 위함.
                정면막힘연속 = 정면막힘확인필요
            } else {
                정밀도증가확인()
            }
        }
    } else {
        // 우선순위 4: 막힘 확정 — 직진 모터를 멈추고 회전 탐색 시작, 반복 실패하면 5단계로
        if (주행중) {
            maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
            주행중 = false
        }
        정면막힘연속 = 0
        상태 = "BLOCKED"
        실패연속 += 1
        마지막판단 = "BLOCKED F" + 실패연속
        로그("FRONT BLOCKED F" + 실패연속)
        전체64로그()
        if (실패연속 >= 실패연속한계) {
            // 우선순위 5: 최종 폴백 — 기존 360도 굵게->세밀 탐색 재사용
            정밀도리셋()
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
            basic.pause(200)
            기준값측정()
            진행추적초기화()
            실패연속 = 0
        } else {
            정밀도소폭감소()
            회전탐색시작()
        }
    }

    lcd표시(false)
    basic.pause(루프대기ms)
})
```

## 무선(라디오) 디버그 콘솔

`AUTONOMOUS_FORWARD_LIDAR_EXAMPLE.md`와 동일합니다(같은 채널 77, 같은 수신기
코드를 그대로 재사용할 수 있습니다).

```typescript
// ===== 무선 디버그 수신기 (별도의 마이크로비트, USB로 PC에 연결) =====
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

## 기본 조정값

| 변수 | 기본값 | 의미 |
|---|---:|---|
| `정지거리mm` | 250 | 중앙 4열(col2~5)이 이 거리 미만이면 즉시 정지 |
| `안전거리mm` | 400 | LED/탈출 점수 계산에서 "열렸다"고 보는 기준거리 |
| `정면판정행시작` / `정면판정행끝` | 0 / 4 | 전진 가능 판단에 쓰는 행 범위. 바닥을 강하게 보는 row5~7은 제외 |
| `회전탐색판정행끝` | 3 | 회전 탐색 중 열린 방향 판단에 쓰는 상단 행 범위 |
| `기본전진속도` | 100 | `controlMotor()`에 주는 시작 속도(0~255). 실측 속도가 너무 느렸던 35~50대를 올림 |
| `최소전진속도` / `최대전진속도` | 50 / 150 | 정밀도 레벨에 따라 가변하는 속도 범위 |
| `속도증가스텝` / `속도감소스텝` | 1 / 10 | 연속 성공/실패 시 속도를 늘리거나 줄이는 양(가속은 1씩 천천히, 감속은 10씩 즉각) |
| `후진속도` / `후진시간ms` | 60 / 400 | 긴급 후진/정지 후진 시 속도와 지속 시간(엔코더 거리 제어가 아니라 시간으로 끊음) |
| `직진보정사용` / `직진보정간격ms` | true / 300 | 좌우 실시간 바퀴 속도를 읽어 빠른 쪽을 낮추고 느린 쪽을 올리는 직진 보정 |
| `직진보정게인` / `직진보정최대` | 2 / 30 | 좌우 속도 차이를 모터 명령에 반영하는 강도와 최대 보정량(범위를 넓힘) |
| `조향거리mm` | 400 | 정면블록확정() 막힘 판정(~370mm)보다 먼 거리부터, 좌/우 중 가까운 쪽 반대로 미리 휘기 시작(너무 멀리서부터 피하던 것을 좁힘) |
| `조향최대보정` | 25 | 장애물 조향 보정의 최대 좌우 속도 차이 |
| `정지감지속도cms` / `정지감지시간ms` | 1 / 600 | 좌우 실측 속도가 둘 다 이 값 이하로 이 시간 이상 이어지면 "꼼짝 못함"으로 보고 후진+회전 탐색 시작 |
| `전진여유mm` | 120 | 직진 허용 판단 시 더하는 고정 안전 버퍼(루프 주기/캐시 지연 감안, 속도 올리면 같이 키워야 함) |
| `직진테스트속도` / `직진테스트목표cm` | 35 / 30 | A 버튼 raw 수집 테스트의 직진 속도와 목표 이동거리(도달하면 정지) |
| `직진테스트시간제한ms` | 15000 | 목표 거리에 못 도달했을 때(막힘 등)의 안전 타임아웃(실측 속도가 느려 8000ms는 부족했음) |
| `직진테스트로그간격ms` | 100 | A 버튼 raw 수집 테스트에서 `TF` 로그를 남기는 간격 |
| `실패연속한계` | 5 | 막힘 연속 시 회전 탐색→최종 360도 탈출 전환 기준 |
| `정면막힘확인필요` / `정면막힘열확인필요` | 2 / 2 | 서로 다른 스캔 프레임에서, 중앙 4열 중 2열 이상 막혀야 정면 막힘 확정 |
| `탐색점수상한mm` | 1000 | 점수 계산 시 거리값 상한 |
| `열가중치` | `[1, 1.5, 2, 3, 3, 2, 1.5, 1]` | 탐색 점수 계산 시 중앙 열에 더 큰 가중치 |
| `탈출최소점수` | 8000 | 탈출 탐색에서 이 점수 이상이면 그 방향을 채택 |
| `라이다무효값mm` | 4000 | 이상이면 "감지 없음"으로 0 처리 |
| `기준값여유mm` | 60 | 칸이 시작 시점 배경(바닥 등)보다 이만큼 가까워야 장애물로 인정 |
| `긴급delta한계mm` | 80 | 정면 칸이 한 틱 사이 이만큼 가까워지면 절대 거리와 무관하게 긴급 후진 후보 |
| `진행확인시간ms` / `최소진행mm` | 1000 / 20 | 이 시간 동안 최소 이만큼 안 바뀌면 헛돌이/막힘으로 판단 |
| `헛돌이감지사용` | false | 라이다 거리 변화량만으로 실제 주행 여부를 판단하는 기능. 빈 공간에서 오판이 많아 기본 꺼짐 |
| `전진성공간격ms` | 800 | 이 시간 이상 안전 주행이 이어져야 성공 카운트를 1회 올림 |
| `회전1회각도` / `회전1회예상ms` | 170 / 4000 | 회전 탐색 1회 호출 각도와 예상 소요시간(추정값, 튜닝 가능) |
| `회전탐색확정추가각도` | 25 | 열린 방향을 처음 발견한 뒤 출구 중앙 쪽으로 더 돌려 재확인하는 각도 |
| `회전탐색최대반복` | 3 | 같은 방향으로 최대 이 횟수(약 510도)까지 돌아도 못 찾으면 포기 |
| `정밀도레벨개수` / `정밀도증가조건` | 3 / 3 | 정밀도 레벨 단계 수 / 연속 성공 시 레벨 올리는 기준 |
| `빠른모드맨아래행주기틱` | 5 | 최고 정밀도 레벨에서도 5번에 1번은 맨 아래 행까지 확인 |

회전 탐색 중에는 출발 시점 `기준값`을 쓰지 않습니다. 회전하면 장면이 바뀌므로
기준값 비교를 계속 쓰면 빈 공간도 새 장애물로 보일 수 있습니다. 그래서 회전 탐색은
raw 상단 행(row0~3)만 보고 열린 방향을 찾고, 방향을 찾은 직후 그 새 헤딩에서
`기준값측정()`을 다시 실행합니다. 또한 회전 중에는 delta 긴급후진을 적용하지 않습니다.

`디버그레벨=2` 이상은 주행 알고리즘을 느리게 만들 수 있습니다. RAW/DELTA 한 줄이 매우
길어서 라디오 조각 전송 중 루프가 늦어지고, `디버그레벨=3`의 `SCAN CYCLE`은 백그라운드
스캔마다 로그를 보내므로 실제 주행 테스트에는 쓰지 않는 것이 좋습니다. 주행 확인은
기본값인 `디버그레벨=1`로 합니다.

## A 버튼 직진 raw 수집 테스트

A 버튼은 자율주행과 분리된 직진 데이터 수집 모드입니다. B 버튼 자율주행을 시작하기
전에 A를 누르면 `TESTFWD START` 후 현재 방향에서 기준값을 한 번 잡고, 곧바로 속도
`직진테스트속도`로 직진을 시작합니다. 인코더 PID(`pidControlDistance`)는 속도가
내부적으로 2로 고정돼 있어 측정 목적에 안 맞으므로 쓰지 않고, 대신
`readRealTimeSpeed()`로 좌/우 실제 속도(cm/s)를 매 틱 적분해 이동거리를 직접
추적합니다. `직진테스트목표cm`(30cm)에 도달하면 자동으로 멈추고(`TESTFWD DONE
TARGET`), 막혀서 도달하지 못하면 `직진테스트시간제한ms`(8000ms) 후 안전하게
멈춥니다(`TESTFWD DONE TIMELIMIT`). A를 다시 누르면 즉시 멈춥니다(`TESTFWD DONE
BUTTON`).

A+B는 별도 패킷 진단 모드입니다. `TP` 로그는 I2C 응답 확인용이라 느릴 수 있으므로,
일반 A 직진 테스트에서는 자동으로 실행하지 않습니다.

로그 형식은 다음과 같습니다.

```text
TP,fmt,x,y,status,cmd,len,data...
TP,x,y,status,cmd,len,data0,data1,...
TF,샘플번호,경과ms,속도,좌측실측속도,우측실측속도,누적이동cm,cacheAge,cycleMs,row0col0..7|row1col0..7|...|row7col0..7
```

`좌측실측속도`/`우측실측속도`(cm/s)가 한쪽으로 계속 쏠려 있으면(`직진보정게인`/
`직진보정최대`로 못 따라잡을 만큼 차이가 크면) 직진 중 한쪽으로 휘는 원인이 바로
이 편차일 가능성이 높습니다 — 다음 측정 결과에서 이 두 값을 우선 확인합니다.

`TP`는 DFRobot 래퍼의 `CMD_FIXED_POINT` 응답 패킷을 그대로 확인하는 진단 로그입니다.
`len`이 `2`이면 현재 펌웨어 응답에는 거리 2바이트만 있고, VL53L5CX의 `target_status`는
이 경로로 전달되지 않는 것으로 봐야 합니다. `len`이 `3` 이상이고 `data2` 이후에
5/6/9 같은 값이 안정적으로 보이면 신뢰도 바이트 후보로 추가 분석할 수 있습니다.

`TF`는 필터 전 raw 8x8 캐시입니다. 테스트할 때는 장애물 없는 공간에서 A를 눌러
직진시키고, `TESTFWD START`부터 `TESTFWD DONE`까지의 `TP`/`TF` 줄들을 붙여주면 됩니다.

## 하드웨어 체크리스트

라이다를 수평·정면으로 장착한 상태에서 다음을 확인한다:

1. 트인 공간에서 `B` 시작 후 평소 주행 속도가 원본 파일보다 느린지(HB 로그의
   `speed` 값 확인), 시간이 지날수록 `precision`/`speed`가 점진적으로 올라가는지.
2. 옆에서 갑자기 물체를 가까이 들이댔을 때(회전 탐색 중이든 직진 중이든) 즉시
   모터를 멈추고 정해진 시간만큼 후진하는지(`EMERGENCY BACKOFF` 로그 확인).
3. 유리판처럼 라이다로 잘 안 보이는 장애물 앞에서 일정 시간 진행이 없으면
   `STUCK/SLIP DETECTED` 로그가 뜨고 다른 방향을 시도하는지.
4. 한쪽이 좁게 막힌 상황에서 회전 탐색이 충분한 공간을 찾는 순간 회전 중간에라도
   바로 멈추고(`ROTATE SEARCH FOUND` 로그) 전진으로 전환하는지.
5. 좁은 복도/모서리에서 회전 탐색이 반복 실패해(`실패연속한계`회) 최종 360도
   탐색(`ESCAPE TRIGGER`)으로 넘어가는지.
6. 로봇 사방을 완전히 막은 상태에서 최종 360도 탐색도 실패해 `NO ESCAPE`가 뜨는지.
7. `기본전진속도`/`최대전진속도`를 바꿔보면서 실제 체감 속도와 `전진여유mm`이
   충분한지(너무 빠르게 했는데 여유가 부족하면 정면블록확정 전에 부딫힐 수 있음).
8. 라이다 시야 밖의 낮은 장애물/벽에 정면으로 바짝 붙여 바퀴가 못 움직이게 한
   뒤, `정지감지시간ms` 안에 `MOTOR STALL DETECTED` -> `STALL BACKOFF` 로그가
   뜨고 후진 후 회전 탐색으로 이어지는지 확인한다.
