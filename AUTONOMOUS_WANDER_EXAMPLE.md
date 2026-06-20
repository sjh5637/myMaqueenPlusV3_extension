# 자율 주행 장애물 회피 예제 (MakeCode JavaScript)

이 코드는 새로운 블록이 아닙니다. **MakeCode 에디터의 JavaScript 보기**(블록 ↔ JavaScript
전환 드롭다운에서 JavaScript 선택)에 그대로 복사해서 붙여넣는 용도의 예제 스크립트입니다.

이미 존재하는 `maqueenPlusV2`(Maqueen Plus V3 확장), `matrixLidarDistance`(매트릭스 라이다
거리 센서 확장, Maqueen Plus V3의 의존성으로 이미 같이 들어와 있음), `lcdDisplay`(DFRobot LCD
확장) 네임스페이스의 함수만 사용했으며, 세 확장 모두 MakeCode 프로젝트에 추가되어 있어야
동작합니다.

## 동작 방식 (탐색-판단-이동 사이클)

막연히 전진하다가 막히면 도는 방식이 아니라, 매 사이클마다 다음 순서로 동작합니다.

1. **`주변스캔()`**: 제자리에서 30도씩 12번 회전하며(총 360도) 매번
   `matrixLidarDistance.getObstacleDistance(Front)`로 정면 거리를 측정해 12방향 거리
   배열을 만듭니다. 스캔이 끝나면 원래 향하던 방향으로 정확히 돌아와 있습니다(30×12=360).
2. **`최적방향찾기()`**: 그 배열에서 가장 멀리(가장 트인) 방향의 인덱스를 고릅니다.
   모든 방향이 다 막혀 있으면(`최소유효거리mm` 미만) "막힘"으로 판단합니다.
3. **방향 전환**: 선택된 인덱스에 맞는 회전각(-180~180 중 더 짧은 쪽)을 계산해
   `pidControlAngle`로 그 방향을 보도록 회전합니다.
4. **`구간전진()`**: 한 번에 전체 거리를 가지 않고 `전진단위cm` 단위로 끊어서
   전진합니다. 각 구간 이동 전에 라이다로 정면을 다시 확인해서(스캔 후 새로 나타난 장애물
   대비) 막혀 있으면 그 자리에서 멈추고 다음 사이클로 넘어갑니다.
5. **PID 이동 중 막힘(스턱) 감지**: 각 구간은 `MyInterruption.Allowed`(논블로킹)로
   `pidControlDistance`를 호출한 뒤, 짧은 지연 후 `readRealTimeSpeed(Left/Right)`로
   실제 바퀴 속도를 읽습니다. 명령은 전진했는데 양쪽 바퀴 속도가 거의 0이면 "바퀴가 안
   보이는 장애물에 걸려 헛도는 상태"로 판단하고, `pidControlStop()` → 살짝 후진
   → 다음 사이클에서 다시 스캔하도록 즉시 빠져나옵니다.
6. LCD에는 현재 상태(SCANNING/MOVING/STUCK!.../NEW OBSTACLE/BLOCKED ALL)와 관련 수치
   (단계, 각도, 거리, 좌우 바퀴 속도)를 항상 표시합니다.

전체가 다 막혀 있을 때는 전진을 시도하지 않고 바로 살짝 후진한 뒤 재스캔합니다(같은 자리에서
앞으로/뒤로 왔다갔다 하며 멈춰버리는 것을 방지).

## 조정 가능한 값

| 변수 | 의미 |
|---|---|
| `스캔회전단위` | 스캔 시 회전 단위(도). `360 / 스캔회전단위`번 회전하며 측정 |
| `최소유효거리mm` | 이 거리(mm) 미만이면 그 방향은 "막힘"으로 간주 |
| `전진단위cm` | 한 구간 전진 거리(cm). 작을수록 안전하지만 느려짐 |
| `최대이동거리cm` | 한 사이클에서 최대로 전진할 거리(cm). 스캔 거리가 더 멀어도 이 값으로 제한 |
| `막힘확인대기ms` | 전진 명령 후 바퀴 속도를 확인하기까지 기다리는 시간(ms) |
| `막힘속도기준` | 이 속도(cm/s) 미만이면 "바퀴가 안 돈다(막힘)"로 판단 |
| `후진거리cm` | 막힘/전방위 차단 감지 시 후진할 거리(cm) |

라이다 센서는 60도 범위로 바닥을 비출 수 있어 `setObstacleDistance`로 설정하는 임계값이
200mm를 넘지 않도록 권장한다고 원본 확장 주석에 적혀 있습니다. 로봇/공간에 맞춰 위 값들을
튜닝하세요.

> `MyEnumMotor`, `MyEnumDir`, `MyInterruption`, `SpeedDirection`, `DirectionType2`,
> `ObstacleSide`, `Addr`, `Matrix`, `FontSize` 같은 열거형은 각각 `maqueenPlusV2`/
> `matrixLidarDistance`/`lcdDisplay` 네임스페이스 안에 선언되어 있어서, 블록이 아닌
> JavaScript 코드에서는 `maqueenPlusV2.MyEnumMotor.AllMotor`,
> `matrixLidarDistance.ObstacleSide.Front`, `lcdDisplay.FontSize.Small`처럼 네임스페이스
> 접두사를 반드시 붙여야 합니다. 빠뜨리면 "Cannot find name" 오류가 납니다. 이 열거형
> 이름들은 각 확장(`.ts`) 안에서 이미 정해진 이름이라 바꿀 수 없으며, 그 외 제가 만든
> 변수/함수 이름은 모두 한글로 작성했습니다.

> **LCD 한글 표시는 지원되지 않습니다.** `lcdDisplay.ts`의 `updateString` 함수가
> 문자열을 한 글자씩 `charCodeAt(0)`로 1바이트씩 I2C로 전송하는데, 한글 유니코드
> (0xAC00 이상)는 1바이트를 넘기 때문에 그대로 보내면 깨지거나 통신 오류가 날 수
> 있습니다. 그래서 화면 문구는 영어로 두고, 대신 "지금 무엇을 하는지"(둘러보는 중/
> 이동 중/막힘 감지 등)와 관련 수치(각도, 거리, 단계, 좌우 바퀴 속도)를 자세히
> 표시하도록 구성했습니다.

## 코드

```typescript
// ===== 설정값 (필요에 따라 조정하세요) =====
const 스캔회전단위 = 30                  // 스캔 회전 단위(도). 360을 나눠떨어지게 설정
const 스캔단계수 = 360 / 스캔회전단위
const 최소유효거리mm = 150               // 이 거리(mm) 미만이면 "막힘"으로 간주
const 전진단위cm = 15                    // 한 구간 전진 거리(cm)
const 최대이동거리cm = 60                // 한 사이클 최대 전진 거리(cm)
const 막힘확인대기ms = 300               // 전진 명령 후 바퀴 속도 확인까지 대기 시간(ms)
const 막힘속도기준 = 1                   // 이 속도(cm/s) 미만이면 "바퀴 안 돔(막힘)"
const 후진거리cm = 10                    // 막힘/전방위 차단 시 후진 거리(cm)

// ===== 초기화 =====
function 로봇초기화(): void {
    maqueenPlusV2.I2CInit()
    matrixLidarDistance.initialize(matrixLidarDistance.Addr.Addr1, matrixLidarDistance.Matrix.OBS)
    matrixLidarDistance.setObstacleDistance(200)
    lcdDisplay.lcdInitIIC()
    lcdDisplay.lcdClearAll()
}

// LCD 상태 표시를 한 곳에 모아 중복을 줄이고, 매번 "무엇을 하는 중인지"를 보여줌
// (한글은 LCD가 지원하지 않아 영어 문구 + 수치로 표시)
function 상태표시(첫줄: string,둘째줄: string, 색상: number): void {
    lcdDisplay.lcdClearAll()
    lcdDisplay.lcdDisplayText(첫줄, 1, 0, 0, lcdDisplay.FontSize.Small, 색상)
    lcdDisplay.lcdDisplayText(둘째줄, 2, 0, 20, lcdDisplay.FontSize.Small, lcdDisplay.lcdGetRgbColor(255, 255, 255))
}

// 정면 거리 한 번 읽기 (항상 getData()로 센서 데이터를 갱신한 뒤 읽음)
function 정면거리mm읽기(): number {
    matrixLidarDistance.getData()
    return matrixLidarDistance.getObstacleDistance(matrixLidarDistance.ObstacleSide.Front)
}

// 제자리에서 360도를 스캔회전단위씩 돌며 방향별 정면 거리를 측정
// 다 돌고 나면 원래 향하던 방향으로 정확히 돌아와 있음 (회전각 합 = 360도)
function 주변스캔(): number[] {
    let 거리목록: number[] = []
    for (let i = 0; i < 스캔단계수; i++) {
        let 거리 = 정면거리mm읽기()
        거리목록.push(거리)
        상태표시("SCANNING", "Step " + (i + 1) + "/" + 스캔단계수 + "  " + 거리 + "mm", lcdDisplay.lcdGetRgbColor(0, 200, 255))
        maqueenPlusV2.pidControlAngle(스캔회전단위, maqueenPlusV2.MyInterruption.NotAllowed)
    }
    return 거리목록
}

// 스캔 결과 중 가장 멀리(가장 트인) 방향의 인덱스를 선택. 전부 막혀 있으면 -1
function 최적방향찾기(거리목록: number[]): number {
    let 최적인덱스 = -1
    let 최적거리 = 최소유효거리mm
    for (let i = 0; i < 거리목록.length; i++) {
        // 0은 "감지 안 됨"(=매우 트임)으로 간주해 가장 높은 우선순위를 줌
        let 거리 = 거리목록[i] == 0 ? 9999 : 거리목록[i]
        if (거리 >= 최적거리) {
            최적거리 = 거리
            최적인덱스 = i
        }
    }
    return 최적인덱스
}

// 스캔 인덱스(0~스캔단계수-1)를 현재 방향 기준 회전각(-180~180)으로 변환
function 인덱스를각도로변환(인덱스: number): number {
    let 각도 = 인덱스 * 스캔회전단위
    if (각도 > 180) 각도 = 각도 - 360
    return 각도
}

// 전진단위cm씩 끊어서 전진. 도중에 새 장애물이나 "바퀴 막힘"을 감지하면
// 그 즉시 멈추고 결과를 돌려줌(메인 루프가 즉시 재스캔하도록 알려줌)
function 구간전진(총거리cm: number): string {
    let 남은거리 = 총거리cm
    while (남은거리 > 0) {
        let 정면거리 = 정면거리mm읽기()
        if (정면거리 != 0 && 정면거리 < 최소유효거리mm) {
            상태표시("NEW OBSTACLE", "Front " + 정면거리 + "mm", lcdDisplay.lcdGetRgbColor(255, 150, 0))
            return "장애물"
        }

        let 이동량 = Math.min(남은거리, 전진단위cm)
        상태표시("MOVING", 이동량 + "/" + 총거리cm + "cm  F:" + 정면거리 + "mm", lcdDisplay.lcdGetRgbColor(0, 255, 0))

        // 논블로킹으로 이동을 시작한 뒤, 짧게 기다렸다가 실제 바퀴 속도로 "막힘"을 감지
        maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCW, 이동량, maqueenPlusV2.MyInterruption.Allowed)
        basic.pause(막힘확인대기ms)

        let 왼쪽속도 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Left)
        let 오른쪽속도 = maqueenPlusV2.readRealTimeSpeed(maqueenPlusV2.DirectionType2.Right)
        if (왼쪽속도 < 막힘속도기준 && 오른쪽속도 < 막힘속도기준) {
            // 전진 명령을 줬는데 바퀴가 거의 안 돔 -> 보이지 않는 장애물에 걸려 헛도는 상태
            maqueenPlusV2.pidControlStop()
            상태표시("STUCK! BACKUP", "L:" + 왼쪽속도 + " R:" + 오른쪽속도 + "cm/s", lcdDisplay.lcdGetRgbColor(255, 0, 0))
            maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 후진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
            return "막힘"
        }

        // 정상적으로 도는 중이면 이 구간이 끝날 만큼 더 대기 후 다음 구간으로
        basic.pause(400)
        남은거리 -= 이동량
    }
    return "완료"
}

// ===== 메인 루프: 둘러보기 -> 판단 -> 이동 사이클 =====
로봇초기화()
상태표시("AUTO EXPLORE", "starting...", lcdDisplay.lcdGetRgbColor(0, 255, 0))
basic.pause(500)

basic.forever(function () {
    let 거리목록 = 주변스캔()
    let 최적인덱스 = 최적방향찾기(거리목록)

    if (최적인덱스 == -1) {
        // 사방이 다 막힘 -> 전진 시도하지 않고 후진 후 재스캔
        상태표시("BLOCKED ALL", "backing up " + 후진거리cm + "cm", lcdDisplay.lcdGetRgbColor(255, 0, 0))
        maqueenPlusV2.pidControlDistance(maqueenPlusV2.SpeedDirection.SpeedCCW, 후진거리cm, maqueenPlusV2.MyInterruption.NotAllowed)
        return
    }

    let 회전각 = 인덱스를각도로변환(최적인덱스)
    상태표시("BEST DIR " + 회전각 + "deg", 거리목록[최적인덱스] + "mm open", lcdDisplay.lcdGetRgbColor(0, 255, 0))
    maqueenPlusV2.pidControlAngle(회전각, maqueenPlusV2.MyInterruption.NotAllowed)

    // 트인 거리만큼 가되 한 사이클 최대 이동 거리(최대이동거리cm)로 제한, 약간의 여유(mm->cm, 마진)를 둠
    let 이동거리cm = Math.min(최대이동거리cm, Math.max(전진단위cm, (거리목록[최적인덱스] == 0 ? 최대이동거리cm * 10 : 거리목록[최적인덱스]) / 10 - 5))
    let 결과 = 구간전진(이동거리cm)

    if (결과 == "막힘" || 결과 == "장애물") {
        basic.pause(200) // 다음 사이클에서 바로 재스캔
    }
})
```
