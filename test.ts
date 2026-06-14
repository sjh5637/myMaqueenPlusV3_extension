maqueenPlusV2.I2CInit()
maqueenPlusV2.setBrightness(100)

// 1. Test individual onboard NeoPixel controls using the new dropdown block
serial.writeLine("Testing individual onboard RGB LED dropdowns")
maqueenPlusV2.setOnboardRGB(DigitalPin.P15, maqueenPlusV2.NeoPixelIndex.LED1, maqueenPlusV2.NeoPixelColors.Pink)       // 앞쪽 왼쪽: 분홍
maqueenPlusV2.setOnboardRGB(DigitalPin.P15, maqueenPlusV2.NeoPixelIndex.LED2, maqueenPlusV2.NeoPixelColors.Cyan)       // 뒤쪽 왼쪽: 청록
maqueenPlusV2.setOnboardRGB(DigitalPin.P15, maqueenPlusV2.NeoPixelIndex.LED3, maqueenPlusV2.NeoPixelColors.Gold)       // 뒤쪽 오른쪽: 금색
maqueenPlusV2.setOnboardRGB(DigitalPin.P15, maqueenPlusV2.NeoPixelIndex.LED4, maqueenPlusV2.NeoPixelColors.Lavender)   // 앞쪽 오른쪽: 라벤더
basic.pause(4000)

// 2. Test Siren animation (Pink & Cyan)
serial.writeLine("Starting Siren animation")
maqueenPlusV2.startSiren(DigitalPin.P15, maqueenPlusV2.NeoPixelColors.Pink, maqueenPlusV2.NeoPixelColors.Cyan, 200)
basic.pause(4000)

// 3. Test Blinker animation (Hazard) with Gold color
serial.writeLine("Starting Hazard Blinker")
maqueenPlusV2.startBlinker(DigitalPin.P15, maqueenPlusV2.DirectionType.All, maqueenPlusV2.NeoPixelColors.Gold, 300)
basic.pause(4000)

// 4. Stop all animations
serial.writeLine("Stopping all animations")
maqueenPlusV2.stopAnimations(DigitalPin.P15)
