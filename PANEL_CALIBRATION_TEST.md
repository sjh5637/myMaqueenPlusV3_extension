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
```
