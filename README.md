# Maqueen Plus V2

> [!NOTE]
> **Fork & Customization Notice**
> * English: This repository is copied/modified from the original [DFRobot/pxt-DFRobot_MaqueenPlus_v20](https://github.com/DFRobot/pxt-DFRobot_MaqueenPlus_v20) extension to support custom blocks and specific features.
> * 한국어: 본 저장소는 오리지널 [DFRobot/pxt-DFRobot_MaqueenPlus_v20](https://github.com/DFRobot/pxt-DFRobot_MaqueenPlus_v20) 확장을 복사하여 작성자가 원하는 블록 및 기능을 추가/수정하기 위해 재구성한 프로젝트입니다.

## Introduction

This is the latest version of Maqueen Plus, a programming robot for STEAM education. Optimized with more expansion ports, larger capacity power supply and larger body, the Maqueen Plus V2.0 can be perfectly compatible with more peripheral components like HuskyLens AI camera and Maqueen Mechanic kits, which makes it an accessible STEAM robot teaching tool for primary and secondary students. Besides, it can be not only suitable for classroom teaching, but also can be used for after-school extended exercises and robot competitions. Besides all the functions of Maqueen Lite, it offers richer and more flexible functions and stronger performance. Whether you have ever used Maqueen series products or not, you'll find it very easy to get started.

[Purchase link](https://www.dfrobot.com/product-2026.html)

[Tutorial Links](https://wiki.dfrobot.com/SKU_MBT0021-EN_Maqueen_Plus_STEAM_Programming_Educational_Robot#target_0)

## 🤖 Hardware Comparison (Maqueen Plus V2 vs V3 하드웨어 비교)

This library supports both Maqueen Plus V2 and V3. Below is a comparison of their hardware specifications. Please note that several advanced blocks (such as Matrix LiDAR, Light sensors, Encoders, and PID controls) are **V3-exclusive (V3 전용)**:

본 라이브러리는 마퀸플러스 V2 및 V3를 모두 지원합니다. 아래는 두 모델의 하드웨어 비교표이며, **매트릭스 라이다(LiDAR), 조도 센서, 모터 엔코더 및 PID 제어** 등의 블록은 **V3 모델에서만 작동하는 V3 전용 기능**입니다:

| Feature (기능) | Maqueen Plus V2 | Maqueen Plus V3 | Note (비고) |
| :--- | :--- | :--- | :--- |
| **Ultrasonic Distance / LiDAR** | Basic Ultrasonic (초음파 센서) | **Matrix LiDAR (매트릭스 라이다)** | **V3 전용** (ToF 레이저 거리 측정) |
| **Car Headlights** | Monochromatic LED ×2 | **RGB LED Lights ×2** | **V3 전용** (차량 헤드라이트 색상 가변) |
| **Light Sensor (조도 센서)** | × | **✔ (Left/Right ×2)** | **V3 전용** (주변 밝기 감지 0~1023) |
| **Motor Encoder & PID** | × | **✔ (Encoders ×2 & PID Control)** | **V3 전용** (정밀 거리/각도 제어 가능) |
| **Line-tracking Processing** | Software-based (마이크로비트) | **Hardware built-in (칩 자체 연산)** | **V3 전용** (자율 교차로 판단 및 주행) |
| **Motor Interface** | Fixed (일체형) | **Detachable (탈착식 N20 모터)** | V3 하드웨어 개선 |
| **Unihiker K10 Support** | × | **✔ Supported** | V3 확장성 개선 |

## 🎨 Customized & Added Features (추가 및 변경 기능)

This customized version expands the original library with more color choices and rich LED animations.  
본 커스텀 버전에 새롭게 추가/확장된 색상 및 백그라운드 LED 애니메이션 블록 정보입니다.

### 1. Expanded RGB Color Palette & Onboard RGB Control (확장된 RGB 색상 및 편리한 온보드 RGB 제어)
* **Expanded Colors (색상 확장)**: We added **13 new vibrant colors** to the NeoPixel RGB color list. (NeoPixel RGB 색상 선택 상자에 아래 **13가지의 다채로운 색상**이 추가되었습니다):
  * `Pink` (분홍), `Magenta` (자홍), `Cyan` (청록), `Gold` (금색), `Lavender` (라벤더), `Mint` (민트), `SkyBlue` (하늘색), `OrangeRed` (다홍색), `LimeGreen` (라임색), `Teal` (진청록), `Turquoise` (터쿼이즈), `HotPink` (핫핑크), `DeepPurple` (진보라)
* **Easy Onboard LED Selection (편리한 온보드 LED 개별 제어)**: Added a beginner-friendly dropdown block to control each of the 4 onboard NeoPixel RGB LEDs or all at once without typing numbers (숫자 입력 없이 4개의 온보드 NeoPixel LED를 각각 또는 전체로 선택할 수 있는 드롭다운 블록이 새롭게 추가되었습니다):
  * Block: `SET PIN %pin onboard RGB LED %index show color %rgb`
  * Dropdown options: `1 (Left Front)` (앞쪽 왼쪽), `2 (Left Rear)` (뒤쪽 왼쪽), `3 (Right Rear)` (뒤쪽 오른쪽), `4 (Right Front)` (앞쪽 오른쪽), `All` (전체)
  ```blocks
  maqueenPlusV2.setOnboardRGB(DigitalPin.P15, maqueenPlusV2.NeoPixelIndex.LED1, maqueenPlusV2.NeoPixelColors.Pink)
  ```

### 2. New Background LED Animation Blocks (새로운 LED 애니메이션 블록)
These animations run asynchronously in the background so they won't block other robot movements or sensor checks:
로봇의 다른 동작이나 센서 판단을 방해하지 않고 백그라운드에서 실행되는 4가지 연출 블록입니다:

* **Siren Effect (사이렌 효과 시작)**
  * Alternates between two customizable colors for both headlights (Left/Right LED) and NeoPixel strip.
  * 지정한 두 가지 색상 조합으로 앞면 LED와 네오픽셀이 교대로 깜빡이는 사이렌 연출을 시작합니다.
  ```blocks
  maqueenPlusV2.startSiren(DigitalPin.P15, maqueenPlusV2.NeoPixelColors.Pink, maqueenPlusV2.NeoPixelColors.Cyan, 200)
  ```

* **Blinker Effect (깜빡이 효과 시작)**
  * Blinks selected headlights (Left/Right/All) and NeoPixels in a chosen color at custom intervals.
  * 좌측/우측/전체 깜빡이를 지정한 색상과 간격(ms)으로 깜빡입니다.
  ```blocks
  maqueenPlusV2.startBlinker(DigitalPin.P15, maqueenPlusV2.DirectionType.Left, maqueenPlusV2.NeoPixelColors.Gold, 500)
  ```

* **Breathing Effect (숨쉬기 효과 시작)**
  * Smoothly fades the brightness of the chosen color up and down at custom speeds (1~5).
  * 설정한 색상의 밝기가 서서히 밝아지고 어두워지는 은은한 연출을 시작합니다.
  ```blocks
  maqueenPlusV2.startBreathing(DigitalPin.P15, maqueenPlusV2.NeoPixelColors.Lavender, 3)
  ```

* **Stop Animations (모든 애니메이션 중지)**
  * Stops all active background LED animations and turns off all lights.
  * 현재 실행 중인 모든 백그라운드 LED 애니메이션을 중단하고 불을 끕니다.
  ```blocks
  maqueenPlusV2.stopAnimations(DigitalPin.P15)
  ```

### 3. Organized Toolbox Subcategories (정리된 툴박스 그룹 분류)
To make programming easier and the toolbox cleaner, all blocks are now organized into labeled subcategories (groups) inside MakeCode:
블록들을 더 쉽게 찾고 툴박스를 깔끔하게 정돈할 수 있도록, 마퀸플러스의 모든 블록이 다음과 같이 그룹별로 세션이 나누어 분류되었습니다:
* **Setup (기본 설정)**: Initialization and version checking blocks. / 초기화 및 버전 확인 블록
* **Motor (모터 제어)**: Movement and motor speed/direction controls. / 주행 방향 및 속도 제어 블록
* **LED (LED 제어)**: Front left/right headlight switches. / 앞면 LED 헤드라이트 제어 블록
* **Sensors (센서 감지)**: Line-tracking digital/ADC states and ultrasonic sensors. / 라인 센서 및 초음파 감지 블록
* **NeoPixel (네오픽셀 RGB)**: Custom colors, brightness, ranges, and rainbow animations. / Neopixel 제어 및 색상 설정 블록
* **V3 (V3 전용 기능)**: Underglow, PID, encoders, crossroads/T-junction modes for V3. / V3 메인보드 전용 고급 정밀 제어 블록
* **Effects (애니메이션 효과)**: Newly added custom siren, blinker, and breathing animation controls. / 새롭게 추가된 백그라운드 효과 연출 블록

## Basic usage

* forward

```blocks

maqueenPlusV2.I2CInit()
basic.forever(function () {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Forward, 100)
})

```

* Backward

```blocks

maqueenPlusV2.I2CInit()
basic.forever(function on_forever() {
    maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Backward, 100)
})

```

* Blinking LED

```blocks

maqueenPlusV2.I2CInit()
music.startMelody(music.builtInMelody(Melodies.Dadadadum), MelodyOptions.Forever)
maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Forward, 255)
basic.forever(function () {
    maqueenPlusV2.setIndexColor(maqueenPlusV2.ledRange(0, 3), maqueenPlusV2.NeoPixelColors.Red)
    basic.pause(1000)
    maqueenPlusV2.setIndexColor(maqueenPlusV2.ledRange(0, 3), maqueenPlusV2.NeoPixelColors.Blue)
    basic.pause(1000)
})

```

* Light Sensing Robot

```blocks

maqueenPlusV2.I2CInit()
basic.forever(function () {
    basic.showNumber(input.lightLevel())
})

```

* Ultrasonic

```blocks

maqueenPlusV2.I2CInit()
basic.forever(function () {
    basic.showNumber(maqueenPlusV2.readUltrasonic(DigitalPin.P13, DigitalPin.P14))
})

```

* Line-tracking Robot

```blocks

maqueenPlusV2.I2CInit()
basic.forever(function () {
    if (maqueenPlusV2.readLineSensorState(maqueenPlusV2.MyEnumLineSensor.SensorM) == 1) {
        maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.AllMotor, maqueenPlusV2.MyEnumDir.Forward, 100)
    } else {
        if (maqueenPlusV2.readLineSensorState(maqueenPlusV2.MyEnumLineSensor.SensorL1) == 0 && maqueenPlusV2.readLineSensorState(maqueenPlusV2.MyEnumLineSensor.SensorR1) == 1) {
            maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 160)
            maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 30)
        }
        if (maqueenPlusV2.readLineSensorState(maqueenPlusV2.MyEnumLineSensor.SensorL1) == 1 && maqueenPlusV2.readLineSensorState(maqueenPlusV2.MyEnumLineSensor.SensorR1) == 0) {
            maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.RightMotor, maqueenPlusV2.MyEnumDir.Forward, 160)
            maqueenPlusV2.controlMotor(maqueenPlusV2.MyEnumMotor.LeftMotor, maqueenPlusV2.MyEnumDir.Forward, 30)
        }
    }
})

```
## License

MIT

Copyright (c) 2020, microbit/micropython Chinese community

## Supported targets

* for PXT/microbit


```package
maqueenPlusV2=github:DFRobot/pxt-DFRobot_MaqueenPlus_v20
```
