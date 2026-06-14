maqueenPlusV2.I2CInit()
maqueenPlusV2.setBrightness(100)

// Sequentially test all 10 emotional expression motions (10가지 감정 표현 모션 차례대로 테스트)
serial.writeLine("1. Happy (기쁨)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Happy)
basic.pause(2000)

serial.writeLine("2. Sad (슬픔)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Sad)
basic.pause(2000)

serial.writeLine("3. Angry (화남)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Angry)
basic.pause(2000)

serial.writeLine("4. Surprised (놀람)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Surprised)
basic.pause(2000)

serial.writeLine("5. Scared (두려움)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Scared)
basic.pause(2000)

serial.writeLine("6. Sleepy (졸림)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Sleepy)
basic.pause(2000)

serial.writeLine("7. Curious (호기심)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Curious)
basic.pause(2000)

serial.writeLine("8. Excited (신남/댄스)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Excited)
basic.pause(2000)

serial.writeLine("9. Proud (당당함)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Proud)
basic.pause(2000)

serial.writeLine("10. Confused (어리둥절)")
maqueenPlusV2.expressEmotion(maqueenPlusV2.MyEmotion.Confused)
basic.pause(2000)

serial.writeLine("All emotional expression tests finished!")
