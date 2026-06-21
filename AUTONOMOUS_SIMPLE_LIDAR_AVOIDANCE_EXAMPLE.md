# 간단 라이다 전용 자율주행 예제

이 예제는 초음파 센서를 쓰지 않습니다. 8x8 Matrix LiDAR 값만 보고 전진, 완만한 회피 조향, 정지 후 회전을 합니다.

기존 `AUTONOMOUS_FORWARD_LIDAR_EXAMPLE_DIRECTDRIVE.md`에서 문제가 됐던 긴 라디오 로그, 기준값/델타 비교, 백그라운드 64칸 스캔, 긴 360도 탐색을 모두 뺐습니다. 033/122/841처럼 실행 중 재시작이 의심되는 상황을 줄이기 위해 루프 안에서 하는 일을 작게 유지하는 버전입니다.

## 동작 순서

1. `B` 버튼을 누르면 시작/정지 토글.
2. 매 루프마다 LiDAR의 일부 행만 읽어 각 열의 가장 가까운 유효 거리만 계산.
3. 가운데 열이 가까우면 속도를 낮추고, 왼쪽/오른쪽 가까운 정도 차이로 자연스럽게 한쪽 바퀴 속도를 더 줘서 피함.
4. 가운데가 너무 가까운 상태가 2번 연속이면 정지, 짧게 후진, 왼쪽/오른쪽 열린 점수를 비교해서 더 열린 방향으로 회전.
5. 같은 방향 회피가 반복되면 반대 방향을 우선하고, 반복 막힘이면 회전 시간을 늘려 빠져나감.
6. 다시 전진.

## 코드

```typescript
const 라이다주소 = matrixLidarDistance.Addr.Addr4
const 라이다무효값mm = 4000

// 현재 테스트 데이터 기준: 바닥을 조금 보는 각도라 너무 아래 행은 바닥 영향이 큽니다.
// 바닥 오검출이 많으면 판정행끝을 3으로 낮추세요.
const 판정행시작 = 0
const 판정행끝 = 4

const 정지거리mm = 240
const 감속거리mm = 420
const 열린거리상한mm = 1200

const 시작전진속도 = 45
const 저속전진속도 = 45
const 최고전진속도 = 80
const 회전속도 = 55
const 후진속도 = 45
const 조향최대보정 = 26

const 루프대기ms = 60
const 후진시간ms = 260
const 기본회전시간ms = 340
const 큰회전시간ms = 540
const 막힘연속필요 = 2
const 같은방향회전한계 = 2
const 좌우점수차이한계 = 120

let 주행중 = false
let 열거리 = [0, 0, 0, 0, 0, 0, 0, 0]
let 현재속도 = 시작전진속도
let 막힘연속 = 0
let 실패연속 = 0
let 마지막회전방향 = 0
let 같은방향회전수 = 0

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
    maqueenPlusV2.controlMotorStop(maqueenPlusV2.MyEnumMotor.AllMotor)
}

function 전진명령(left: number, right: number): void {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 제한값(left, 0, 최고전진속도))
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 제한값(right, 0, 최고전진속도))
}

function 후진짧게(): void {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Backward, 후진속도)
    basic.pause(후진시간ms)
    정지()
    basic.pause(80)
}

function 좌회전(시간ms: number): void {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Backward, 회전속도)
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 회전속도)
    basic.pause(시간ms)
    정지()
}

function 우회전(시간ms: number): void {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 회전속도)
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Backward, 회전속도)
    basic.pause(시간ms)
    정지()
}

function 회피회전(): void {
    정지()
    basic.showIcon(IconNames.No)
    후진짧게()
    전체장면읽기()

    let leftScore = 열린점수(0, 2)
    let rightScore = 열린점수(5, 7)
    let 방향 = 0
    if (rightScore > leftScore + 좌우점수차이한계) {
        방향 = 1
    } else if (leftScore > rightScore + 좌우점수차이한계) {
        방향 = -1
    } else if (마지막회전방향 != 0) {
        방향 = 0 - 마지막회전방향
    } else {
        방향 = 1
    }

    if (방향 == 마지막회전방향) {
        같은방향회전수 += 1
    } else {
        같은방향회전수 = 1
    }
    마지막회전방향 = 방향

    let turnTime = 같은방향회전수 > 같은방향회전한계 || 실패연속 >= 3 ? 큰회전시간ms : 기본회전시간ms
    if (방향 > 0) {
        우회전(turnTime)
    } else {
        좌회전(turnTime)
    }
}

function 자연회피전진(): void {
    let centerNear = 범위최소거리(2, 5)
    let base = 현재속도
    if (centerNear > 0 && centerNear < 감속거리mm) {
        base = 저속전진속도
    } else if (현재속도 < 최고전진속도) {
        현재속도 += 1
    }

    let leftNear = 범위최소거리(1, 3)
    let rightNear = 범위최소거리(4, 6)
    if (leftNear == 0) leftNear = 감속거리mm
    if (rightNear == 0) rightNear = 감속거리mm

    // 왼쪽이 더 가까우면 오른쪽으로, 오른쪽이 더 가까우면 왼쪽으로 완만하게 휩니다.
    let steer = 제한값(Math.round((leftNear - rightNear) * 조향최대보정 / 감속거리mm), -조향최대보정, 조향최대보정)
    전진명령(base - steer, base + steer)
    basic.showArrow(ArrowNames.North)
}

input.onButtonPressed(Button.B, function () {
    주행중 = !(주행중)
    if (주행중) {
        현재속도 = 시작전진속도
        막힘연속 = 0
        실패연속 = 0
        마지막회전방향 = 0
        같은방향회전수 = 0
        basic.showIcon(IconNames.Yes)
    } else {
        정지()
        basic.showIcon(IconNames.Target)
    }
})

basic.forever(function () {
    if (!주행중) {
        basic.pause(100)
        return
    }

    핵심장면읽기()

    if (정면막힘확정()) {
        현재속도 = 시작전진속도
        실패연속 += 1
        회피회전()
    } else {
        if (실패연속 > 0) 실패연속 -= 1
        자연회피전진()
    }

    basic.pause(루프대기ms)
})

basic.showIcon(IconNames.Target)
```

## 조정 기준

| 값 | 기본값 | 조정할 때 |
|---|---:|---|
| `판정행끝` | 4 | 바닥 때문에 자주 막힌다고 판단하면 3으로 낮춤 |
| `정지거리mm` | 240 | 너무 가까이 붙으면 280~320으로 올림 |
| `감속거리mm` | 420 | 더 일찍 부드럽게 피하고 싶으면 500~600으로 올림 |
| `시작전진속도` | 45 | 출발이 안 되면 50, 너무 빠르면 40 |
| `최고전진속도` | 80 | 너무 빠르면 65~70 |
| `기본회전시간ms` | 340 | 회전을 너무 조금 하면 400 근처로 올림 |
| `큰회전시간ms` | 540 | 반복 막힘에서 더 크게 돌아야 하면 650 근처로 올림 |
| `좌우점수차이한계` | 120 | 좌우가 비슷할 때 최근 실패 반대 방향을 더 쉽게 쓰려면 값을 올림 |
