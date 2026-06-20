# 자율 주행 장애물 회피 예제 (MakeCode JavaScript)

이 코드는 새로운 블록이 아닙니다. **MakeCode 에디터의 JavaScript 보기**(블록 ↔ JavaScript
전환 드롭다운에서 JavaScript 선택)에 그대로 복사해서 붙여넣는 용도의 예제 스크립트입니다.

이미 존재하는 `maqueenPlusV2`(Maqueen Plus V3 확장) 네임스페이스와 `lcdDisplay`(DFRobot LCD
확장) 네임스페이스의 함수만 사용했으며, 두 확장 모두 MakeCode 프로젝트에 추가되어 있어야
동작합니다.

## 동작 방식

- `basic.forever()` 루프가 100ms마다 초음파 거리를 측정합니다 (`TRIG = P13`, `ECHO = P14`).
- 거리가 충분하면(`SAFE_DISTANCE` 초과) `controlMotor`로 계속 전진합니다.
- 장애물이 감지되면 `controlMotorStop`으로 즉시 정지한 뒤, `pidControlAngle(...,
  MyInterruption.NotAllowed)`로 정확한 각도만큼 회전을 마칠 때까지 기다립니다(블로킹 호출).
- 같은 방향으로만 계속 돌다가 벽 모서리에 갇히는 것을 막기 위해 좌/우 회전을 교대합니다.
- LCD에는 현재 상태("Moving Forward"/"Obstacle! Avoiding")와 실시간 거리값을 표시합니다.

## 조정 가능한 값

| 변수 | 의미 |
|---|---|
| `SAFE_DISTANCE` | 이 거리(cm)보다 가까우면 장애물로 판단 |
| `FORWARD_SPEED` | 전진 속도 (0~255) |
| `TURN_ANGLE` | 회피 시 회전 각도 (도) |
| `LOOP_DELAY` | 거리 측정 주기 (ms) |

로봇/공간에 맞춰 테스트하며 튜닝하면 됩니다. I2C 주소나 LCD 핀 설정은 각 확장의 기본값을
그대로 사용했습니다.

## 코드

```typescript
// ===== 설정값 (필요에 따라 조정하세요) =====
const TRIG_PIN = DigitalPin.P13
const ECHO_PIN = DigitalPin.P14
const SAFE_DISTANCE = 20      // 이 거리(cm)보다 가까우면 장애물로 판단
const FORWARD_SPEED = 150     // 전진 속도 (0~255)
const TURN_ANGLE = 60         // 회피 시 회전 각도 (도)
const LOOP_DELAY = 100        // 거리 측정 주기 (ms)

let lastTurnLeft = true       // 같은 방향으로만 도는 것을 방지하기 위한 교대 회전용 플래그

// ===== 초기화 =====
maqueenPlusV2.I2CInit()
lcdDisplay.lcdInitIIC()
lcdDisplay.lcdClearAll()
lcdDisplay.lcdDisplayText("Auto Wander Start", 1, 0, 0, FontSize.Small, lcdDisplay.lcdGetRgbColor(0, 255, 0))
basic.pause(500)
lcdDisplay.lcdClearAll()

// ===== 메인 루프 =====
basic.forever(function () {
    let distance = maqueenPlusV2.readUltrasonic(TRIG_PIN, ECHO_PIN)

    if (distance > SAFE_DISTANCE || distance == 0) {
        // 0은 측정 실패/범위 밖인 경우가 많으므로 전진으로 간주
        maqueenPlusV2.controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Forward, FORWARD_SPEED)

        lcdDisplay.lcdClearAll()
        lcdDisplay.lcdDisplayText("Moving Forward", 1, 0, 0, FontSize.Small, lcdDisplay.lcdGetRgbColor(0, 255, 0))
        lcdDisplay.lcdDisplayText("Dist: " + distance + "cm", 2, 0, 20, FontSize.Small, lcdDisplay.lcdGetRgbColor(255, 255, 255))
    } else {
        // 장애물 감지 -> 정지 후 회전 회피
        maqueenPlusV2.controlMotorStop(MyEnumMotor.AllMotor)

        lcdDisplay.lcdClearAll()
        lcdDisplay.lcdDisplayText("Obstacle! Avoiding", 1, 0, 0, FontSize.Small, lcdDisplay.lcdGetRgbColor(255, 0, 0))
        lcdDisplay.lcdDisplayText("Dist: " + distance + "cm", 2, 0, 20, FontSize.Small, lcdDisplay.lcdGetRgbColor(255, 255, 255))

        let angle = lastTurnLeft ? -TURN_ANGLE : TURN_ANGLE
        lastTurnLeft = !lastTurnLeft

        maqueenPlusV2.pidControlAngle(angle, MyInterruption.NotAllowed)
    }

    basic.pause(LOOP_DELAY)
})
```
