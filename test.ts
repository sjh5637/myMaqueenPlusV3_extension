maqueenPlusV2.I2CInit()
maqueenPlusV2.setBrightness(100)

// 1. Test Siren animation with custom colors: Pink (분홍) and Cyan (청록)
serial.writeLine("Starting Siren animation (Pink & Cyan)")
maqueenPlusV2.startSiren(DigitalPin.P15, maqueenPlusV2.NeoPixelColors.Pink, maqueenPlusV2.NeoPixelColors.Cyan, 200)
basic.pause(5000)

// 2. Test Blinker animation (Hazard) with Gold (금색) color
serial.writeLine("Starting Hazard Blinker (Gold)")
maqueenPlusV2.startBlinker(DigitalPin.P15, maqueenPlusV2.DirectionType.All, maqueenPlusV2.NeoPixelColors.Gold, 300)
basic.pause(5000)

// 3. Test Breathing animation with Lavender (라벤더) color
serial.writeLine("Starting Breathing effect (Lavender)")
maqueenPlusV2.startBreathing(DigitalPin.P15, maqueenPlusV2.NeoPixelColors.Lavender, 4)
basic.pause(5000)

// 4. Stop all animations
serial.writeLine("Stopping all animations")
maqueenPlusV2.stopAnimations(DigitalPin.P15)
