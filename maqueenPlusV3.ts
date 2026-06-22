
const enum PatrolSpeed {
    //% block="1"
    Speed1 = 1,
    //% block="2"
    Speed2 = 2,
    //% block="3"
    Speed3 = 3,
    //% block="4"
    Speed4 = 4,
    //% block="5"
    Speed5 = 5,
}

/**
 * Custom graphic block
 */
//% weight=100 color=#0fbc11 icon="\uf067" block="MaqueenPlusV3"
//% groups="['Setup', 'Motor', 'LED', 'Sensors', 'NeoPixel', 'V3', 'Effects', 'NewRaceTimer', 'Class01Setup', 'Class02Drive', 'Class03LineSafety', 'Class04RaceTimer', 'Class05Emotion']"
//% subcategories="['New Features', 'Class']"
namespace maqueenPlusV2 {

    //Motor selection enumeration
    export enum MyEnumMotor {
        //% block="left motor"
        LeftMotor,
        //% block="right motor"
        RightMotor,
        //% block="all motor"
        AllMotor,
    };

    //PID interruption
    export enum MyInterruption {
        //% block="Allow interruption"
        Allowed,
        //% block="No interruptions allowed"
        NotAllowed,
    };

    //Motor direction enumeration selection
    export enum MyEnumDir {
        //% block="rotate forward"
        Forward,
        //% block="backward"
        Backward,
    };

    //LED light selection enumeration
    export enum MyEnumLed {
        //% block="left led light"
        LeftLed,
        //% block="right led light"
        RightLed,
        //% block="all led light"
        AllLed,
    };

    //LED light switch enumeration selection
    export enum MyEnumSwitch {
        //% block="close"
        Close,
        //% block="open"
        Open,
    };

    //Line sensor selection
    export enum MyEnumLineSensor {
        //% block="L2"
        SensorL2,
        //% block="L1"
        SensorL1,
        //% block="M"
        SensorM,
        //% block="R1"
        SensorR1,
        //% block="R2"
        SensorR2,
    };
    /**
     * Well known colors for a NeoPixel strip
     */
    export enum NeoPixelColors {
        //% block=red
        Red = 0xFF0000,
        //% block=orange
        Orange = 0xFFA500,
        //% block=yellow
        Yellow = 0xFFFF00,
        //% block=green
        Green = 0x00FF00,
        //% block=blue
        Blue = 0x0000FF,
        //% block=indigo
        Indigo = 0x4b0082,
        //% block=violet
        Violet = 0x8a2be2,
        //% block=purple
        Purple = 0xFF00FF,
        //% block=white
        White = 0xFFFFFF,
        //% block=black
        Black = 0x000000,
        //% block=pink
        Pink = 0xFFC0CB,
        //% block=magenta
        Magenta = 0xFF00FF,
        //% block=cyan
        Cyan = 0x00FFFF,
        //% block=gold
        Gold = 0xFFD700,
        //% block=lavender
        Lavender = 0xE6E6FA,
        //% block=mint
        Mint = 0x3EB489,
        //% block=skyblue
        SkyBlue = 0x87CEEB,
        //% block=orangered
        OrangeRed = 0xFF4500,
        //% block=limegreen
        LimeGreen = 0x32CD32,
        //% block=teal
        Teal = 0x008080,
        //% block=turquoise
        Turquoise = 0x40E0D0,
        //% block=hotpink
        HotPink = 0xFF69B4,
        //% block=deeppurple
        DeepPurple = 0x6000FF
    }
    
    export enum CarLightColors {
        //% block=red
        Red = 1,
        //% block=green
        Green = 2,
        //% block=yellow
        Yellow = 3,
        //% block=blue
        Blue = 4,
        //% block=purple
        Purple = 5,
        //% block=cyan
        Cyan = 6,
        //% block=white
        White = 7,
        //% block=black
        Black = 0
    }

    const I2CADDR = 0x10;
    const ADC0_REGISTER = 0X1E;
    const ADC1_REGISTER = 0X20;
    const ADC2_REGISTER = 0X22;
    const ADC3_REGISTER = 0X24;
    const ADC4_REGISTER = 0X26;
    const LEFT_LED_REGISTER = 0X0B;
    const RIGHT_LED_REGISTER = 0X0C;
    const LEFT_MOTOR_REGISTER = 0X00;
    const RIGHT_MOTOR_REGISTER = 0X02;
    const LINE_STATE_REGISTER = 0X1D;
    const VERSION_CNT_REGISTER = 0X32;
    const VERSION_DATA_REGISTER = 0X33;
    
    let neopixel_buf = pins.createBuffer(16 * 3);
    for (let i = 0; i < 16 * 3; i++) {
        neopixel_buf[i] = 0
    }
    let _brightness = 255

    // Line safety monitor state variables
    const LINE_DEVIATED_EVENT_SOURCE = 3101;
    const LINE_DEVIATED_EVENT_VALUE = 1;
    let safetyMonitorActive = false;

    /**
     *  Init I2C until success
     */

    //% weight=100
    //% block="initialize via I2C until success"
    //% group="Setup"
    export function I2CInit(): void {
        let Version_v = 0;
        //V3 systemReset
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 0x49;
        allBuffer[1] = 1;
        pins.i2cWriteBuffer(I2CADDR, allBuffer); 
        basic.pause(100);//waiting  reset

        pins.i2cWriteNumber(I2CADDR, 0x32, NumberFormat.Int8LE);
        Version_v = pins.i2cReadNumber(I2CADDR, NumberFormat.Int8LE);
        while (Version_v == 0) {
            basic.showLeds(`
                # . . . #
                . # . # .
                . . # . .
                . # . # .
                # . . . #
                `, 10)
            basic.pause(500)
            basic.clearScreen()
            pins.i2cWriteNumber(0x10, 0x32, NumberFormat.Int8LE);
            Version_v = pins.i2cReadNumber(I2CADDR, NumberFormat.Int8LE);
        }
        basic.showLeds(`
                . . . . .
                . . . . #
                . . . # .
                # . # . .
                . # . . .
                `, 10)
        basic.pause(500)
        basic.clearScreen()
    }

    /**
     * Control motor module running
     * @param emotor Motor selection enumeration
     * @param edir   Motor direction selection enumeration
     * @param speed  Motor speed control, eg:100
     */

    //% blockId=controlMotor
    //% block="set %emotor direction %edir speed %speed"
    //% speed.min=0 speed.max=255
    //% weight=99
    //% group="Motor"
    export function controlMotor(emotor:MyEnumMotor, edir:MyEnumDir, speed:number):void{
        switch(emotor){
            case MyEnumMotor.LeftMotor:
                let leftBuffer = pins.createBuffer(3);
                leftBuffer[0] = LEFT_MOTOR_REGISTER;
                leftBuffer[1] = edir;
                leftBuffer[2] = speed;
                pins.i2cWriteBuffer(I2CADDR, leftBuffer);
            break;
            case MyEnumMotor.RightMotor:
                let rightBuffer = pins.createBuffer(3);
                rightBuffer[0] = RIGHT_MOTOR_REGISTER;
                rightBuffer[1] = edir;
                rightBuffer[2] = speed;
                pins.i2cWriteBuffer(I2CADDR, rightBuffer);
            break;
            default:
                let allBuffer = pins.createBuffer(5);
                allBuffer[0] = LEFT_MOTOR_REGISTER;
                allBuffer[1] = edir;
                allBuffer[2] = speed;
                allBuffer[3] = edir;
                allBuffer[4] = speed;
                pins.i2cWriteBuffer(I2CADDR, allBuffer)
            break;   
        }
    }

    /**
     * Control the motor module to stop running
     * @param emotor Motor selection enumeration
     */

    //% blockId=controlMotorStop
    //% block="set %emotor stop"
    //% weight=98
    //% group="Motor"
    export function controlMotorStop(emotor:MyEnumMotor):void{
        switch (emotor) {
            case MyEnumMotor.LeftMotor:
                let leftBuffer = pins.createBuffer(3);
                leftBuffer[0] = LEFT_MOTOR_REGISTER;
                leftBuffer[1] = 0;
                leftBuffer[2] = 0;
                pins.i2cWriteBuffer(I2CADDR, leftBuffer);
                break;
            case MyEnumMotor.RightMotor:
                let rightBuffer = pins.createBuffer(3);
                rightBuffer[0] = RIGHT_MOTOR_REGISTER;
                rightBuffer[1] = 0;
                rightBuffer[2] = 0;
                pins.i2cWriteBuffer(I2CADDR, rightBuffer);
                break;
            default:
                let allBuffer = pins.createBuffer(5);
                allBuffer[0] = LEFT_MOTOR_REGISTER;
                allBuffer[1] = 0;
                allBuffer[2] = 0;
                allBuffer[3] = 0;
                allBuffer[4] = 0;
                pins.i2cWriteBuffer(I2CADDR, allBuffer)
                break;
        }
    }

    let autoBalanceActive = false;

    /**
     * 좌/우 바퀴의 실시간 속도(cm/s)를 계속 읽어서 두 모터의 속도를 자동으로 보정하며 직진/후진합니다.
     * 바퀴 마찰이나 배터리 차이로 한쪽으로 휘는 문제를 줄여줍니다.
     * Drive straight by continuously reading left/right wheel speed and auto-correcting motor PWM so both wheels match.
     * @param edir Direction (Forward/Backward)
     * @param speed base motor speed (0-255), eg:100
     */
    //% blockId=startAutoBalanceDrive
    //% block="auto-balance drive %edir base speed %speed"
    //% speed.min=0 speed.max=255
    //% weight=97
    //% subcategory="New Features"
    //% group="Motor"
    export function startAutoBalanceDrive(edir: MyEnumDir, speed: number): void {
        autoBalanceActive = true;
        let leftSpeed = speed;
        let rightSpeed = speed;
        controlMotor(MyEnumMotor.LeftMotor, edir, leftSpeed);
        controlMotor(MyEnumMotor.RightMotor, edir, rightSpeed);
        control.inBackground(function () {
            const GAIN = 3;
            while (autoBalanceActive) {
                let speeds = readBothWheelSpeeds();
                let diff = speeds[0] - speeds[1];
                leftSpeed = clampMotorSpeed(leftSpeed - diff * GAIN);
                rightSpeed = clampMotorSpeed(rightSpeed + diff * GAIN);
                controlMotor(MyEnumMotor.LeftMotor, edir, Math.round(leftSpeed));
                controlMotor(MyEnumMotor.RightMotor, edir, Math.round(rightSpeed));
                basic.pause(50);
            }
        });
    }

    function clampMotorSpeed(v: number): number {
        if (v < 0) return 0;
        if (v > 255) return 255;
        return v;
    }

    /**
     * 자동 속도 보정 주행을 멈추고 모터를 정지합니다.
     * Stop the auto-balance drive and stop the motors.
     */
    //% blockId=stopAutoBalanceDrive
    //% block="stop auto-balance drive"
    //% weight=96
    //% subcategory="New Features"
    //% group="Motor"
    export function stopAutoBalanceDrive(): void {
        autoBalanceActive = false;
        controlMotorStop(MyEnumMotor.AllMotor);
    }

    /**
     * Control left and right LED light switch module
     * @param eled LED lamp selection
     * @param eSwitch Control LED light on or off
     */

    //% blockId=controlLED
    //% block="control %eled %eSwitch"
    //% weight=97
    //% group="LED"
    export function controlLED(eled:MyEnumLed, eSwitch:MyEnumSwitch):void{
        switch(eled){
            case MyEnumLed.LeftLed:
                let leftLedControlBuffer = pins.createBuffer(2);
                leftLedControlBuffer[0] = LEFT_LED_REGISTER;
                leftLedControlBuffer[1] = eSwitch;
                pins.i2cWriteBuffer(I2CADDR, leftLedControlBuffer);
            break;
            case MyEnumLed.RightLed:
                let rightLedControlBuffer = pins.createBuffer(2);
                rightLedControlBuffer[0] = RIGHT_LED_REGISTER;
                rightLedControlBuffer[1] = eSwitch;
                pins.i2cWriteBuffer(I2CADDR, rightLedControlBuffer);
            break;
            default:
                let allLedControlBuffer = pins.createBuffer(3);
                allLedControlBuffer[0] = LEFT_LED_REGISTER;
                allLedControlBuffer[1] = eSwitch;
                allLedControlBuffer[2] = eSwitch;
                pins.i2cWriteBuffer(I2CADDR, allLedControlBuffer);
            break;
        }
    }

    /**
     * 5개 라인 센서의 상태가 모두 들어있는 원시 비트마스크를 I2C로 한 번만 읽어옵니다.
     * (L2=0x10, L1=0x08, M=0x04, R1=0x02, R2=0x01)
     * Read the raw bitmask containing all 5 line sensor states in a single I2C transaction.
     */
    function readLineSensorBits(): number {
        pins.i2cWriteNumber(I2CADDR, LINE_STATE_REGISTER, NumberFormat.Int8LE);
        return pins.i2cReadNumber(I2CADDR, NumberFormat.Int8LE);
    }

    /**
     * Get the state of the patrol sensor
     * @param eline Select the inspection sensor enumeration
     */

    //% blockId=readLineSensorState
    //% block="read line sensor %eline state"
    //% weight=96
    //% group="Sensors"
    export function readLineSensorState(eline:MyEnumLineSensor):number{
        let data = readLineSensorBits();
        let state;
        switch(eline){
            case MyEnumLineSensor.SensorL1: 
                state = (data & 0x08) == 0x08 ? 1 : 0; 
            break;
            case MyEnumLineSensor.SensorM: 
                state = (data & 0x04) == 0x04 ? 1 : 0; 
            break;
            case MyEnumLineSensor.SensorR1: 
                state = (data & 0x02) == 0x02 ? 1 : 0; 
            break;
            case MyEnumLineSensor.SensorL2: 
                state = (data & 0x10) == 0X10 ? 1 : 0; 
            break;
            default:
                state = (data & 0x01) == 0x01 ? 1 : 0;
            break;
        }
        return state;
    }
    
    /**
     * The ADC data of the patrol sensor is obtained
     * @param eline Select the inspection sensor enumeration
     */

    //% blockId=readLineSensorData
    //% block="read line sensor %eline  ADC data"
    //% weight=95
    //% group="Sensors"
    export function readLineSensorData(eline:MyEnumLineSensor):number{
        let data;
        switch(eline){
            case MyEnumLineSensor.SensorR2:
                pins.i2cWriteNumber(I2CADDR, ADC0_REGISTER, NumberFormat.Int8LE);
                let adc0Buffer = pins.i2cReadBuffer(I2CADDR, 2);
                data = adc0Buffer[1] << 8 | adc0Buffer[0]
            break;
            case MyEnumLineSensor.SensorR1:
                pins.i2cWriteNumber(I2CADDR, ADC1_REGISTER, NumberFormat.Int8LE);
                let adc1Buffer = pins.i2cReadBuffer(I2CADDR, 2);
                data = adc1Buffer[1] << 8 | adc1Buffer[0];
            break;
            case MyEnumLineSensor.SensorM:
                pins.i2cWriteNumber(I2CADDR, ADC2_REGISTER, NumberFormat.Int8LE);
                let adc2Buffer = pins.i2cReadBuffer(I2CADDR, 2);
                data = adc2Buffer[1] << 8 | adc2Buffer[0];
            break;
            case MyEnumLineSensor.SensorL1:
                pins.i2cWriteNumber(I2CADDR, ADC3_REGISTER, NumberFormat.Int8LE);
                let adc3Buffer = pins.i2cReadBuffer(I2CADDR, 2);
                data = adc3Buffer[1] << 8 | adc3Buffer[0];
            break;
            default:
                pins.i2cWriteNumber(I2CADDR, ADC4_REGISTER, NumberFormat.Int8LE);
                let adc4Buffer = pins.i2cReadBuffer(I2CADDR, 2);
                data = adc4Buffer[1] << 8 | adc4Buffer[0];
            break;

        }
        return data;
    }
    function mydelayUs(unit: number):void{
        let i
        while((--unit)>0){
            for (i = 0; i < 1; i++) {
            } 
        }
    }
    /**
     * Acquiring ultrasonic data
     * @param trig trig pin selection enumeration, eg:DigitalPin.P13
     * @param echo echo pin selection enumeration, eg:DigitalPin.P14
     * @note fit sr04/urm10   The difference between the two is that the echo sending time is different. 
     * The sr04 sends the echo only after receiving the echo. When urm10 is triggered, it sends echo and stops after the echo
     */
    //% blockId=readUltrasonic
    //% block="set ultrasonic sensor TRIG pin %trig ECHO pin %echo read data unit:cm"
    //% weight=94
    //% group="Sensors"
    export function readUltrasonic(trig:DigitalPin, echo:DigitalPin):number{
        let data;
        pins.digitalWritePin(trig, 1);
        mydelayUs(10);
        pins.digitalWritePin(trig, 0)
        data = pins.pulseIn(echo, PulseValue.High, 1000 * 58);
        if(data==0) //repeat
        {
            pins.digitalWritePin(trig, 1);
            mydelayUs(10);
            pins.digitalWritePin(trig, 0);
            data = pins.pulseIn(echo, PulseValue.High, 1000 * 58)
        }
        //59.259 / ((331.5 + 0.6 * (float)(10)) * 100 / 1000000.0) // The ultrasonic velocity (cm/us) compensated by temperature
        data = data / 59.259;

        if (data <= 0)
            return 0;
        if (data > 300)
            return 300;
        return Math.round(data);
    }

    /**
     * Getting the version number
     */
    
    //% blockId=readVersion
    //% block="read version"
    //% weight=30
    //% advanced=true
    //% group="Setup"
    export function readVersion():string{
        let version;
        pins.i2cWriteNumber(I2CADDR, VERSION_CNT_REGISTER, NumberFormat.Int8LE);
        version = pins.i2cReadNumber(I2CADDR, NumberFormat.Int8LE);
        pins.i2cWriteNumber(I2CADDR, VERSION_DATA_REGISTER, NumberFormat.Int8LE);
         version= pins.i2cReadBuffer(I2CADDR, version);
        let versionString = version.toString();
        return versionString
    }
    
   

    /** 
    * Set the three primary color:red, green, and blue
    * @param r  , eg: 100
    * @param g  , eg: 100
    * @param b  , eg: 100
    */

    //% weight=60
    //% blockId=rgb
    //% r.min=0 r.max=255
    //% g.min=0 g.max=255
    //% b.min=0 b.max=255
    //% block="red|%r green|%g blue|%b"
    //% group="NeoPixel"
    export function rgb(r: number, g: number, b: number): number {
        return (r << 16) + (g << 8) + (b);
    }

    /**
     * The LED positions where you wish to begin and end
     * @param from  , eg: 0
     * @param to  , eg: 3
     */

    //% weight=60
    //% blockId=ledRange
    //% from.min=0 from.max=3
    //% to.min=0 to.max=3
    //% block="range from |%from with|%to leds"
    //% group="NeoPixel"
    export function ledRange(from: number, to: number): number {
        return ((from) << 16) + (2 << 8) + (to);
    }
    /**
     * Gets the RGB value of a known color
    */
    //% weight=2 blockGap=8
    //% blockId="neopixel_colors" block="%color"
    //% advanced=true
    //% group="NeoPixel"
    export function colors(color: NeoPixelColors): number {
        return color;
    }
    export enum NeoPixelIndex {
        //% block="1 (Left Front)"
        LED1 = 0,
        //% block="2 (Left Rear)"
        LED2 = 1,
        //% block="3 (Right Rear)"
        LED3 = 2,
        //% block="4 (Right Front)"
        LED4 = 3,
        //% block="All"
        All = 4
    }

    /**
     * Set the color of a specific onboard NeoPixel LED
     * @param pin pin to control the leds
     * @param index onboard LED index selection
     * @param rgb selected color
     */
    //% weight=65
    //% blockId=setOnboardRGB
    //% pin.defl=DigitalPin.P15
    //% block="SET PIN|%pin onboard RGB LED|%index show color|%rgb=neopixel_colors"
    //% group="NeoPixel"
    export function setOnboardRGB(pin: DigitalPin, index: NeoPixelIndex, rgb: number) {
        if (index === NeoPixelIndex.All) {
            showColor(pin, rgb);
        } else {
            setIndexColor(pin, index as number, rgb);
        }
    }

    /**
     * Set the color of the specified LEDs
     * @param pin , pin to control the leds 
     * @param index  , eg: DigitalPin.P15
     * @param rgb , color
     */
    //% weight=60
    //% blockId=setIndexColor
    //% index.min=0 index.max=3
    //% pin.defl=DigitalPin.P15
    //% block="SET PIN|%pin RGB light |%index show color|%rgb=neopixel_colors"
    //% group="NeoPixel"
    export function setIndexColor(pin:DigitalPin,index: number, rgb: number) {
        let f = index;
        let t = index;
        let r = (rgb >> 16) * (_brightness / 255);
        let g = ((rgb >> 8) & 0xFF) * (_brightness / 255);
        let b = ((rgb) & 0xFF) * (_brightness / 255);

        if (index > 15) {
            if (((index >> 8) & 0xFF) == 0x02) {
                f = index  >> 16;
                t = index  & 0xff;
            } else {
                f = 0;
                t = -1;
            }
        }
        for (let i = f; i <= t; i++) {
            neopixel_buf[i * 3 + 0] = Math.round(g)
            neopixel_buf[i * 3 + 1] = Math.round(r)
            neopixel_buf[i * 3 + 2] = Math.round(b)
        }
        ws2812b.sendBuffer(neopixel_buf, pin)

    }

    /**
     * Set the color of all RGB LEDs
     * eg: DigitalPin.P15
     * 
     * @param pin
     * @param rgb
     * 
     */

    //% weight=60
    //% blockId=showColor
    //% pin.defl=DigitalPin.P15
    //% block=" SET PIN|%pin RGB show color|%rgb=neopixel_colors"
    //% group="NeoPixel"
    export function showColor(pin:DigitalPin,rgb: number) {
        let r = (rgb >> 16) * (_brightness / 255);
        let g = ((rgb >> 8) & 0xFF) * (_brightness / 255);
        let b = ((rgb) & 0xFF) * (_brightness / 255);
        for (let i = 0; i < 16 * 3; i++) {
            if ((i % 3) == 0)
                neopixel_buf[i] = Math.round(g)
            if ((i % 3) == 1)
                neopixel_buf[i] = Math.round(r)
            if ((i % 3) == 2)
                neopixel_buf[i] = Math.round(b)
        }
        ws2812b.sendBuffer(neopixel_buf, pin)
    }

    /**
     * Set the brightness of RGB LED
     * @param brightness  , eg: 100
     */

    //% weight=70
    //% blockId=setBrightness
    //% brightness.min=0 brightness.max=255
    //% block="set RGB brightness to |%brightness"
    //% group="NeoPixel"
    export function setBrightness(brightness: number) {
        _brightness = brightness;
    }

    /**
     * Turn off all RGB LEDs
     * eg: DigitalPin.P15
     * 
     * @param pin, pin to control the leds
     */

    //% weight=40
    //% blockId=ledBlank
    //% pin.defl=DigitalPin.P15
    //% block="Set pin|%pin clear all RGB"
    //% group="NeoPixel"
    export function ledBlank(pin: DigitalPin) {
       showColor(pin,0)
    }

    /**
     * RGB LEDs display rainbow colors
     * @param pin , led control pin
     * @param startHue, start value
     * @param endHuem end value 
     */

    //% weight=50
    //% pin.defl=DigitalPin.P15
    //% startHue.defl=1
    //% endHue.defl=360
    //% startHue.min=0 startHue.max=360
    //% endHue.min=0 endHue.max=360
    //% blockId=led_rainbow block="SET PIN|%pin set RGB show rainbow color from|%startHue to|%endHue"
    //% group="NeoPixel"
    export function ledRainbow(pin:DigitalPin,startHue: number, endHue: number) {
        startHue = startHue >> 0;
        endHue = endHue >> 0;
        const saturation = 100;
        const luminance = 50;
        let steps = 3 + 1;
        const direction = HueInterpolationDirection.Clockwise;

        //hue
        const h1 = startHue;
        const h2 = endHue;
        const hDistCW = ((h2 + 360) - h1) % 360;
        const hStepCW = Math.idiv((hDistCW * 100), steps);
        const hDistCCW = ((h1 + 360) - h2) % 360;
        const hStepCCW = Math.idiv(-(hDistCCW * 100), steps);
        let hStep: number;
        if (direction === HueInterpolationDirection.Clockwise) {
            hStep = hStepCW;
        } else if (direction === HueInterpolationDirection.CounterClockwise) {
            hStep = hStepCCW;
        } else {
            hStep = hDistCW < hDistCCW ? hStepCW : hStepCCW;
        }
        const h1_100 = h1 * 100; //we multiply by 100 so we keep more accurate results while doing interpolation

        //sat
        const s1 = saturation;
        const s2 = saturation;
        const sDist = s2 - s1;
        const sStep = Math.idiv(sDist, steps);
        const s1_100 = s1 * 100;

        //lum
        const l1 = luminance;
        const l2 = luminance;
        const lDist = l2 - l1;
        const lStep = Math.idiv(lDist, steps);
        const l1_100 = l1 * 100

        //interpolate
        if (steps === 1) {
            writeBuff(0, hsl(h1 + hStep, s1 + sStep, l1 + lStep))
        } else {
            writeBuff(0, hsl(startHue, saturation, luminance));
            for (let i = 1; i < steps - 1; i++) {
                const h = Math.idiv((h1_100 + i * hStep), 100) + 360;
                const s = Math.idiv((s1_100 + i * sStep), 100);
                const l = Math.idiv((l1_100 + i * lStep), 100);
                writeBuff(0 + i, hsl(h, s, l));
            }
            writeBuff(3, hsl(endHue, saturation, luminance));
        }
        ws2812b.sendBuffer(neopixel_buf, pin)
    }

    export enum HueInterpolationDirection {
        Clockwise,
        CounterClockwise,
        Shortest
    }

    function writeBuff(index: number, rgb: number) {
        let r = (rgb >> 16) * (_brightness / 255);
        let g = ((rgb >> 8) & 0xFF) * (_brightness / 255);
        let b = ((rgb) & 0xFF) * (_brightness / 255);
        neopixel_buf[index * 3 + 0] = Math.round(g)
        neopixel_buf[index * 3 + 1] = Math.round(r)
        neopixel_buf[index * 3 + 2] = Math.round(b)
    }

    function hsl(h: number, s: number, l: number): number {
        h = Math.round(h);
        s = Math.round(s);
        l = Math.round(l);

        h = h % 360;
        s = Math.clamp(0, 99, s);
        l = Math.clamp(0, 99, l);
        let c = Math.idiv((((100 - Math.abs(2 * l - 100)) * s) << 8), 10000); //chroma, [0,255]
        let h1 = Math.idiv(h, 60);//[0,6]
        let h2 = Math.idiv((h - h1 * 60) * 256, 60);//[0,255]
        let temp = Math.abs((((h1 % 2) << 8) + h2) - 256);
        let x = (c * (256 - (temp))) >> 8;//[0,255], second largest component of this color
        let r$: number = 0;
        let g$: number = 0;
        let b$: number = 0;
        if (h1 == 0) {
            r$ = c; g$ = x; b$ = 0;
        } else if (h1 == 1) {
            r$ = x; g$ = c; b$ = 0;
        } else if (h1 == 2) {
            r$ = 0; g$ = c; b$ = x;
        } else if (h1 == 3) {
            r$ = 0; g$ = x; b$ = c;
        } else if (h1 == 4) {
            r$ = x; g$ = 0; b$ = c;
        } else if (h1 == 5) {
            r$ = c; g$ = 0; b$ = x;
        }
        let m = Math.idiv((Math.idiv((l * 2 << 8), 100) - c), 2);
        let r = r$ + m;
        let g = g$ + m;
        let b = b$ + m;

        return (r << 16) + (g << 8) + b;
    }

    /* maqueen PlusV3 */

    export enum MotorType {
        //% block="Motor133"
        Motor133 = 1,
        //% block="Motor266"
        Motor266 = 2,
    }

    export enum Intersection {
        //% block="Straight"
        Straight = 3,
        //% block="Left"
        Left = 1,
        //% block="Right"
        Right = 2,
        //% block="Stop"
        Stop = 4,
    }

    export enum Trord {
        //% block="Left"
        Left = 1,
        //% block="Right"
        Right = 2,
        //% block="Stop"
        Stop = 4,
    }

    export enum LeftOrStraight {
        //% block="Straight"
        Straight = 3,
        //% block="Left"
        Left = 1,
        //% block="Stop"
        Stop = 4,
    }

    export enum RightOrStraight {
        //% block="Straight"
        Straight = 3,
        //% block="Right"
        Right = 2,
        //% block="Stop"
        Stop = 4,
    }

    export enum Patrolling {
        //% block="ON"
        ON = 1,
        //% block="OFF"
        OFF = 2,
    }

    export enum DirectionType {
        //% block="Left"
        Left = 1,
        //% block="Right"
        Right = 2,
        //% block="All"
        All = 3,
    }
    export enum DirectionType2 {
        //% block="Left"
        Left = 1,
        //% block="Right"
        Right = 2,
    }

    export enum SpeedDirection {
        //% block="CW"
        SpeedCW = 1,
        //% block="CCW"
        SpeedCCW = 2,
    }


    /**
     * return the corresponding PatrolSpeed number
     */
    //% blockId="PatrolSpeed_conv" block="%item"
    //% weight=2 blockHidden=true
    export function getPatrolSpeed(item: PatrolSpeed): number {
        return item as number;
    }


    /**
     * Maqueen Plus V3의 내장 라인 트레이싱 주행 속도를 설정합니다. (1단계 ~ 5단계)
     * Set the line-following speed of Maqueen Plus V3. (Level 1 - 5)
     * @param speed Patrol speed level
     */

    //% blockId=setPatrolSpeed
    //% block="Line Following Settings Speed %speed=PatrolSpeed_conv"
    //% weight=24
    //% group="V3"
    //% advanced=true
    export function setPatrolSpeed(speed: number) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 63;
        allBuffer[1] = speed;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * Set motor type
     * @param type to type ,eg: MotorType.Motor133
     */

    //% blockId=setMotorType
    //% block="set up motor type %type"
    //% weight=23
    //% group="V3"
    //% advanced=true
    //% deprecated=true
    export function setMotorType(type: MotorType) {

    }

    /**
     * 마퀸플러스 V3가 십자 교차로를 감지했을 때의 이동 방향을 설정합니다.
     * Set the movement direction when Maqueen Plus V3 detects a crossroad intersection.
     * @param mode Intersection action (Straight, Left, Right, Stop)
     */
    //% blockId=setIntersectionRunMode
    //% block="At Crossroads %mode"
    //% weight=22
    //% group="V3"
    //% advanced=true
    export function setIntersectionRunMode(mode: Intersection) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 69;
        allBuffer[1] = mode;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 마퀸플러스 V3가 T자 교차로를 감지했을 때의 이동 방향을 설정합니다.
     * Set the movement direction when Maqueen Plus V3 detects a T-junction.
     * @param mode T-junction action (Left, Right, Stop)
     */

    //% blockId=setTRordRunMode
    //% block="At T-junction %mode"
    //% weight=21
    //% group="V3"
    //% advanced=true
    export function setTRordRunMode(mode: Trord) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 70;
        allBuffer[1] = mode;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 마퀸플러스 V3가 좌회전/직진 삼거리를 감지했을 때의 이동 방향을 설정합니다.
     * Set the movement direction when Maqueen Plus V3 detects a Left-Turn or Straight intersection.
     * @param mode Action (Straight, Left, Stop)
     */

    //% blockId=setLeftOrStraightRunMode
    //% block="At Left Turn and Straight Intersection %mode"
    //% weight=20
    //% group="V3"
    //% advanced=true
    export function setLeftOrStraightRunMode(mode: LeftOrStraight) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 71;
        allBuffer[1] = mode;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 마퀸플러스 V3가 우회전/직진 삼거리를 감지했을 때의 이동 방향을 설정합니다.
     * Set the movement direction when Maqueen Plus V3 detects a Right-Turn or Straight intersection.
     * @param mode Action (Straight, Right, Stop)
     */

    //% blockId=setRightOrStraightRunMode
    //% block="At Right Turn and Straight Intersection %mode"
    //% weight=19
    //% group="V3"
    //% advanced=true
    export function setRightOrStraightRunMode(mode: RightOrStraight) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 72;
        allBuffer[1] = mode;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 마퀸플러스 V3의 자동 라인 트레이싱 기능을 시작(ON)하거나 중지(OFF)합니다.
     * Turn the built-in line patrolling function ON or OFF for Maqueen Plus V3.
     * @param patrol Patrolling state
     */

    //% blockId=patrolling
    //% block="Line patrolling %patrol"
    //% weight=18
    //% group="V3"
    //% advanced=true
    export function patrolling(patrol: Patrolling) {
        let allBuffer = pins.createBuffer(2);
        if (patrol == Patrolling.ON)
            allBuffer[1] = 0x04|0x01;
        else
            allBuffer[1] = 0x08;
        allBuffer[0] = 60;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 마퀸플러스 V3가 감지한 교차로 상태 값을 가져옵니다. (1: 사거리, 2: T자 교차로, 3: 좌회전/직진, 4: 우회전/직진)
     * Read the currently detected intersection status code from Maqueen Plus V3.
     */

    //% blockId=intersectionDetecting
    //% block="Intersection Detection"
    //% weight=17
    //% group="V3"
    //% advanced=true
    export function intersectionDetecting(): number {
        pins.i2cWriteNumber(I2CADDR, 61, NumberFormat.Int8LE);
        let data = pins.i2cReadNumber(I2CADDR, 1);
        return data;
    }

    /**
     * 마퀸플러스 V3의 좌/우 조도(빛) 센서의 아날로그 값을 읽어옵니다. (0 ~ 1023)
     * Read the analog value (0 - 1023) from the Left or Right light sensor of Maqueen Plus V3.
     * @param type Sensor side (Left/Right)
     */

    //% blockId=readLightIntensity
    //% block="Read Light Values %type"
    //% weight=16
    //% group="V3"
    //% advanced=true
    export function readLightIntensity(type: DirectionType2): number {
        let allBuffer = pins.createBuffer(4);
        pins.i2cWriteNumber(I2CADDR, 78, NumberFormat.Int8LE);
        allBuffer = pins.i2cReadBuffer(I2CADDR, 4);
        if (type == DirectionType2.Left)
            return allBuffer[0] << 8 | allBuffer[1];
        else
            return allBuffer[2] << 8 | allBuffer[3];
    }

    /**
     * 마퀸플러스 V3의 모터 인코더 피드백과 PID를 이용하여 설정한 거리(cm)만큼 정확하게 이동합니다.
     * Move the robot a specified distance in cm using PID control and encoder feedback.
     * @param dir Direction (CW: Forward, CCW: Backward)
     * @param distance Distance in centimeters
     * @param interruption Interruption permission
     */

    //% blockId=pidControlDistance
    //% block="PID Distance Control %dir  distance %distance cm   %interruption  interruption"
    //% weight=15
    //% group="V3"
    //% advanced=true
    export function pidControlDistance(dir: SpeedDirection, distance: number, interruption: MyInterruption) {
        let speed =2 ;
        let allBuffer = pins.createBuffer(2);
        if (distance >= 6000)
            distance = 60000;
        allBuffer[0]=64; allBuffer[1] =dir;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 85; allBuffer[1] = speed;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 65; allBuffer[1] = distance>>8;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 66; allBuffer[1] = distance ;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 60; allBuffer[1] = 0x04 | 0x02;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)

        if (interruption == MyInterruption.NotAllowed){
            pins.i2cWriteNumber(I2CADDR, 87, NumberFormat.Int8LE);
            let flagBuffer = pins.createBuffer(1);
            flagBuffer = pins.i2cReadBuffer(I2CADDR, 1);
            while (flagBuffer[0]==1){
                basic.pause(10);
                flagBuffer=pins.i2cReadBuffer(I2CADDR, 1);  
            }
        }

    }

    /**
     * 마퀸플러스 V3의 모터 인코더 피드백과 PID를 이용하여 설정한 각도(도)만큼 제자리에서 정밀하게 회전합니다.
     * Turn the robot a specified angle using PID control and encoder feedback.
     * @param angle Rotation angle in degrees (-180 to 180)
     * @param interruption Interruption permission
     */

    //% blockId=pidControlAngle
    //% block="PID Angle Control speed  angle %angle %interruption  interruption"
    //% angle.min=-180 angle.max=180 angle.defl=90
    //% weight=14
    //% group="V3"
    //% advanced=true
    export function pidControlAngle(angle: number, interruption: MyInterruption) {
        let speed = 2;
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 67;
        if (angle>=0)allBuffer[1] = 1;
        else{
            allBuffer[1] = 2;
            angle = -angle;
        } 
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 86; allBuffer[1] = speed;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 68; allBuffer[1] = angle;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
        allBuffer[0] = 60; allBuffer[1] = 0x04 | 0x02;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)

        if (interruption == MyInterruption.NotAllowed) {
            pins.i2cWriteNumber(I2CADDR, 87, NumberFormat.Int8LE);
            let flagBuffer = pins.createBuffer(1);
            flagBuffer = pins.i2cReadBuffer(I2CADDR, 1);
            while (flagBuffer[0] == 1) {
                basic.pause(10);
                flagBuffer = pins.i2cReadBuffer(I2CADDR, 1);
            }
        }

    }
    /**
     * 진행 중인 PID 정밀 제어 주행 및 회전을 즉시 중지합니다.
     * Stop any currently running PID distance or angle control movements.
     */

    //% blockId=pidControlStop
    //% block="PID Control Stop"
    //% weight=13
    //% group="V3"
    //% advanced=true
    export function pidControlStop() {
        let allBuffer = pins.createBuffer(2);
        allBuffer[0] = 60;
        allBuffer[1] = 0x10;
        pins.i2cWriteBuffer(I2CADDR, allBuffer)
    }

    /**
     * 좌/우 바퀴의 실제 실시간 주행 속도(cm/s)를 측정하여 가져옵니다.
     * Read the real-time speed of the left or right wheel in cm/s.
     * @param type Wheel side (Left/Right)
     */

    //% blockId=readRealTimeSpeed
    //% block="Read Real-time Speed %type wheel"
    //% weight=12
    //% group="V3"
    //% advanced=true
    export function readRealTimeSpeed(type: DirectionType2): number {
        let speeds = readBothWheelSpeeds();
        return type == DirectionType2.Left ? speeds[0] : speeds[1];
    }

    /**
     * 좌/우 바퀴의 실시간 속도(cm/s)를 단 한 번의 I2C 통신으로 함께 읽어옵니다.
     * Read both left and right wheel real-time speed (cm/s) in a single I2C transaction.
     */
    function readBothWheelSpeeds(): number[] {
        pins.i2cWriteNumber(I2CADDR, 76, 1);
        let allBuffer = pins.i2cReadBuffer(I2CADDR, 2);
        return [allBuffer[0] / 5, allBuffer[1] / 5];
    }

    /**
     * 마퀸플러스 V3 하단 섀시에 탑재된 전면 RGB 헤드라이트의 단색을 지정합니다. (V3 전용)
     * Set the solid color of the Left, Right, or All front RGB headlights of Maqueen Plus V3.
     * @param type Light side (Left/Right/All)
     * @param rgb Selected car light color
     */

    //% blockId=setRgblLed
    //% block="RGB Car Lights %type color %rgb"
    //% weight=11
    //% group="V3"
    //% advanced=true
    export function setRgblLed(type: DirectionType, rgb: CarLightColors) {
        let allBuffer = pins.createBuffer(2);
        allBuffer[1] = rgb;
        if (type == DirectionType.Left) {
            allBuffer[0] = 11;
            pins.i2cWriteBuffer(I2CADDR, allBuffer)
        } else if (type == DirectionType.Right) {
            allBuffer[0] = 12;
            pins.i2cWriteBuffer(I2CADDR, allBuffer)
        } else if (type == DirectionType.All) {
            allBuffer[0] = 11;
            pins.i2cWriteBuffer(I2CADDR, allBuffer)
            allBuffer[0] = 12;
            pins.i2cWriteBuffer(I2CADDR, allBuffer)
        }
    }

    let activeAnimationId = 0;

    /**
     * Stop all running LED animations
     * @param pin pin to control the leds
     */
    //% weight=9
    //% blockId=stopAnimations
    //% block="SET PIN|%pin stop all animations"
    //% pin.defl=DigitalPin.P15
    //% subcategory="New Features"
    //% group="Effects"
    export function stopAnimations(pin: DigitalPin) {
        activeAnimationId++;
        // Turn off all RGBs
        showColor(pin, 0);
        // Turn off front LEDs
        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
    }

    /**
     * Start a custom police siren animation
     * @param pin pin to control the leds
     * @param color1 first color
     * @param color2 second color
     * @param interval interval in milliseconds
     */
    //% weight=8
    //% blockId=startSiren
    //% pin.defl=DigitalPin.P15
    //% interval.defl=200
    //% subcategory="New Features"
    //% group="Effects"
    //% block="SET PIN|%pin start siren color1|%color1=neopixel_colors color2|%color2=neopixel_colors at interval|%interval ms"
    export function startSiren(pin: DigitalPin, color1: number, color2: number, interval: number) {
        activeAnimationId++;
        let animId = activeAnimationId;
        control.inBackground(function () {
            let state = false;
            while (animId === activeAnimationId) {
                state = !state;
                if (state) {
                    setIndexColor(pin, 0, color1);
                    setIndexColor(pin, 1, color1);
                    setIndexColor(pin, 2, color2);
                    setIndexColor(pin, 3, color2);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                } else {
                    setIndexColor(pin, 0, color2);
                    setIndexColor(pin, 1, color2);
                    setIndexColor(pin, 2, color1);
                    setIndexColor(pin, 3, color1);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                }
                basic.pause(interval);
            }
        });
    }

    /**
     * Start directional blinkers/hazard lights animation
     * @param pin pin to control the leds
     * @param type direction type
     * @param color color to blink
     * @param interval interval in milliseconds
     */
    //% weight=7
    //% blockId=startBlinker
    //% pin.defl=DigitalPin.P15
    //% interval.defl=500
    //% subcategory="New Features"
    //% group="Effects"
    //% block="SET PIN|%pin start blinker|%type color|%color=neopixel_colors at interval|%interval ms"
    export function startBlinker(pin: DigitalPin, type: DirectionType, color: number, interval: number) {
        activeAnimationId++;
        let animId = activeAnimationId;
        control.inBackground(function () {
            let state = false;
            while (animId === activeAnimationId) {
                state = !state;
                if (state) {
                    if (type === DirectionType.Left) {
                        setIndexColor(pin, 0, color);
                        setIndexColor(pin, 1, color);
                        controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    } else if (type === DirectionType.Right) {
                        setIndexColor(pin, 2, color);
                        setIndexColor(pin, 3, color);
                        controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                    } else {
                        showColor(pin, color);
                        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                    }
                } else {
                    showColor(pin, 0);
                    controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                }
                basic.pause(interval);
            }
        });
    }

    /**
     * Start breathing LED light effect
     * @param pin pin to control the leds
     * @param color breathing color
     * @param speed speed of breathing (1-5)
     */
    //% weight=6
    //% blockId=startBreathing
    //% pin.defl=DigitalPin.P15
    //% speed.min=1 speed.max=5 speed.defl=3
    //% subcategory="New Features"
    //% group="Effects"
    //% block="SET PIN|%pin start breathing color|%color=neopixel_colors speed|%speed"
    export function startBreathing(pin: DigitalPin, color: number, speed: number) {
        activeAnimationId++;
        let animId = activeAnimationId;
        let pauseTime = (6 - speed) * 5;
        let r = (color >> 16) & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = color & 0xFF;

        control.inBackground(function () {
            let step = 5;
            let currentBrightness = 0;
            let direction = 1;
            while (animId === activeAnimationId) {
                currentBrightness += direction * step;
                if (currentBrightness >= 255) {
                    currentBrightness = 255;
                    direction = -1;
                } else if (currentBrightness <= 0) {
                    currentBrightness = 0;
                    direction = 1;
                }
                let scaledR = (r * currentBrightness) / 255;
                let scaledG = (g * currentBrightness) / 255;
                let scaledB = (b * currentBrightness) / 255;
                let scaledColor = (scaledR << 16) + (scaledG << 8) + scaledB;
                showColor(pin, scaledColor);
                basic.pause(pauseTime);
            }
        });
    }

    export enum MyEmotion {
        //% block="Happy"
        Happy,
        //% block="Sad"
        Sad,
        //% block="Angry"
        Angry,
        //% block="Surprised"
        Surprised,
        //% block="Scared"
        Scared,
        //% block="Sleepy"
        Sleepy,
        //% block="Curious"
        Curious,
        //% block="Excited"
        Excited,
        //% block="Proud"
        Proud,
        //% block="Confused"
        Confused
    }

    /**
     * Express an emotion using movements, lights, and sounds (V2 & V3 compatible)
     * @param emotion selected emotion type
     */
    //% weight=5
    //% blockId=expressEmotion
    //% block="express emotion %emotion"
    //% subcategory="Class"
    //% group="Class05Emotion"
    export function expressEmotion(emotion: MyEmotion): void {
        stopAnimations(DigitalPin.P15);

        switch (emotion) {
            case MyEmotion.Happy:
                music.playTone(523, 150);
                music.playTone(659, 150);
                music.playTone(784, 150);
                music.playTone(1047, 250);
                for (let i = 0; i < 3; i++) {
                    showColor(DigitalPin.P15, NeoPixelColors.Green);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 150);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Backward, 150);
                    basic.pause(120);

                    showColor(DigitalPin.P15, NeoPixelColors.Yellow);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Backward, 150);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 150);
                    basic.pause(120);
                }
                break;

            case MyEmotion.Sad:
                music.playTone(392, 300);
                music.playTone(311, 300);
                music.playTone(262, 500);
                showColor(DigitalPin.P15, NeoPixelColors.Blue);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Backward, 60);
                basic.pause(1000);
                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                break;

            case MyEmotion.Angry:
                music.playTone(110, 600);
                for (let i = 0; i < 4; i++) {
                    showColor(DigitalPin.P15, NeoPixelColors.Red);
                    controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                    controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Forward, 200);
                    basic.pause(100);

                    showColor(DigitalPin.P15, 0);
                    controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                    controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Backward, 200);
                    basic.pause(100);
                }
                break;

            case MyEmotion.Surprised:
                music.playTone(1976, 150);
                showColor(DigitalPin.P15, NeoPixelColors.White);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Backward, 220);
                basic.pause(200);
                controlMotorStop(MyEnumMotor.AllMotor);
                basic.pause(400);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;

            case MyEmotion.Scared:
                for (let i = 0; i < 4; i++) {
                    music.playTone(880, 80);
                    music.playTone(830, 80);
                }
                showColor(DigitalPin.P15, NeoPixelColors.Indigo);
                for (let i = 0; i < 6; i++) {
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 60);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Backward, 60);
                    basic.pause(80);

                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Backward, 60);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 60);
                    basic.pause(80);
                }
                break;

            case MyEmotion.Sleepy:
                music.playTone(330, 400);
                music.playTone(294, 400);
                music.playTone(262, 800);
                showColor(DigitalPin.P15, NeoPixelColors.Purple);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Forward, 45);
                basic.pause(800);
                controlMotor(MyEnumMotor.AllMotor, MyEnumDir.Backward, 45);
                basic.pause(800);
                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;

            case MyEmotion.Curious:
                music.playTone(262, 200);
                music.playTone(392, 400);
                showColor(DigitalPin.P15, NeoPixelColors.Cyan);
                controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 0);
                controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 100);
                basic.pause(450);

                controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 100);
                controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 0);
                basic.pause(450);

                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;

            case MyEmotion.Excited:
                music.playTone(523, 100);
                music.playTone(392, 100);
                music.playTone(523, 100);
                music.playTone(392, 100);
                music.playTone(523, 100);
                music.playTone(659, 100);
                music.playTone(784, 100);
                music.playTone(1047, 200);

                controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 160);
                controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Backward, 160);
                for (let i = 0; i < 6; i++) {
                    showColor(DigitalPin.P15, NeoPixelColors.Red);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                    basic.pause(150);

                    showColor(DigitalPin.P15, NeoPixelColors.Blue);
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                    basic.pause(150);
                }
                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;

            case MyEmotion.Proud:
                music.playTone(262, 150);
                music.playTone(330, 150);
                music.playTone(392, 150);
                music.playTone(523, 300);
                showColor(DigitalPin.P15, NeoPixelColors.Gold);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 90);
                controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 120);
                basic.pause(1200);
                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;

            case MyEmotion.Confused:
                music.playTone(349, 150);
                music.playTone(311, 150);
                music.playTone(349, 150);
                music.playTone(294, 250);
                showColor(DigitalPin.P15, NeoPixelColors.Magenta);
                for (let i = 0; i < 3; i++) {
                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Open);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Close);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Forward, 80);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Backward, 40);
                    basic.pause(200);

                    controlLED(MyEnumLed.LeftLed, MyEnumSwitch.Close);
                    controlLED(MyEnumLed.RightLed, MyEnumSwitch.Open);
                    controlMotor(MyEnumMotor.LeftMotor, MyEnumDir.Backward, 40);
                    controlMotor(MyEnumMotor.RightMotor, MyEnumDir.Forward, 80);
                    basic.pause(200);
                }
                controlMotorStop(MyEnumMotor.AllMotor);
                showColor(DigitalPin.P15, 0);
                controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
                break;
        }

        controlMotorStop(MyEnumMotor.AllMotor);
        showColor(DigitalPin.P15, 0);
        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
    }

    /**
     * 수업용 라인 감시 난이도. 단계가 올라갈수록 라인을 더 정확하게 따라가야 합니다.
     * - 1단계: 가장 바깥쪽 센서(L2, R2)가 검은선을 밟으면 즉시 이탈
     * - 2단계: L1·M·R1 중 하나라도 검은선을 밟은 뒤, 5개 센서가 전부 흰색이 되어
     *   라인을 완전히 놓치면 이탈 (L1, R1만 잠깐 밟는 건 이탈 아님)
     * - 3단계: 가운데 센서(M)가 검은선을 벗어나면 즉시 이탈
     */
    export enum MyLineSafetyLevel {
        //% block="1단계 (쉬움)"
        Level1 = 1,
        //% block="2단계"
        Level2 = 2,
        //% block="3단계 (어려움)"
        Level3 = 3,
    }

    /**
     * Start monitoring if the robot deviates from the black line (V2 & V3 compatible).
     * When it deviates, the "on line deviated" event is raised.
     * @param level line safety difficulty level
     */
    //% weight=12
    //% blockId=lineMonitorStart
    //% block="start line monitor level %level"
    //% subcategory="Class"
    //% group="Class03LineSafety"
    export function startLineSafetyMonitor(
        level: MyLineSafetyLevel = MyLineSafetyLevel.Level1
    ): void {
        if (safetyMonitorActive) return;
        safetyMonitorActive = true;

        control.inBackground(function () {
            let wasOnLine = false;
            let deviationLatched = false;
            while (safetyMonitorActive) {
                let bits = readLineSensorBits();
                let l2 = (bits & 0x10) ? 1 : 0;
                let l1 = (bits & 0x08) ? 1 : 0;
                let m = (bits & 0x04) ? 1 : 0;
                let r1 = (bits & 0x02) ? 1 : 0;
                let r2 = (bits & 0x01) ? 1 : 0;

                // 결승선 판정과 동일한 기준(L1, M, R1 모두 검은색)으로 통일해 오탐을 막음
                let atFinishLine = (l1 === 1 && m === 1 && r1 === 1);

                let isOnLine: boolean;
                let deviated: boolean;

                if (level === MyLineSafetyLevel.Level2) {
                    // 2단계: L1/R1이 검은선을 밟는 것 자체는 이탈이 아님(커브 보정으로 흔히 생김).
                    // 한 번 라인을 타고 있었는데(L1·M·R1 중 하나라도 검음) 이후 5개 센서가 전부
                    // 흰색이 되어 완전히 놓쳤을 때만 이탈로 판정
                    isOnLine = (l1 === 1 || m === 1 || r1 === 1);
                    deviated = !atFinishLine && (wasOnLine && !isOnLine && l2 === 0 && r2 === 0);
                } else if (level === MyLineSafetyLevel.Level3) {
                    // 3단계: 가운데 센서(M)가 검은선을 벗어나면 즉시 이탈
                    isOnLine = (m === 1);
                    deviated = !atFinishLine && !isOnLine;
                } else {
                    // 1단계(기본): 가장 바깥쪽 센서(L2, R2)가 검은선을 밟으면 이탈. 보조 판정 없이 가장 단순함
                    isOnLine = !(l2 === 1 || r2 === 1);
                    deviated = !atFinishLine && (l2 === 1 || r2 === 1);
                }

                if (deviated && !deviationLatched) {
                    // 레이스 타이머가 동작 중이면 이탈 시점의 경과 시간을 "실패 기록"으로 저장하고 타이머를 멈춤
                    if (raceFinishMonitorActive) {
                        raceFailTime = control.millis();
                        raceFailElapsedSeconds = Math.idiv(raceFailTime - raceStartTime, 1000);
                    }
                    control.raiseEvent(LINE_DEVIATED_EVENT_SOURCE, LINE_DEVIATED_EVENT_VALUE);
                    deviationLatched = true;
                    wasOnLine = false;
                } else if (isOnLine && !deviated) {
                    wasOnLine = true;
                    deviationLatched = false;
                }
                basic.pause(50);
            }
        });
    }

    /**
     * Stop the line safety monitor
     */
    //% weight=11
    //% blockId=lineMonitorStop
    //% block="stop line monitor"
    //% subcategory="Class"
    //% group="Class03LineSafety"
    export function stopLineSafetyMonitor(): void {
        safetyMonitorActive = false;
    }

    /**
     * Run code when the robot deviates from the black line.
     * @param body code to run when line is deviated
     */
    //% weight=10
    //% blockId=onLineDeviated
    //% block="when line deviated"
    //% blockGap=16
    //% subcategory="Class"
    //% group="Class03LineSafety"
    export function onLineDeviated(body: () => void): void {
        control.onEvent(LINE_DEVIATED_EVENT_SOURCE, LINE_DEVIATED_EVENT_VALUE, body);
    }

    /**
     * 제자리에서 소리와 빨간 불빛으로 "틀렸다"는 경고만 표시합니다. 모터는 움직이지 않습니다. (V2 & V3 호환)
     * Warn that something is wrong using only sound and red light, without moving the robot (V2 & V3 compatible).
     */
    //% weight=9
    //% blockId=warnWrong
    //% block="warn wrong (sound and light)"
    //% subcategory="Class"
    //% group="Class03LineSafety"
    export function warnWrong(): void {
        stopAnimations(DigitalPin.P15);
        for (let i = 0; i < 3; i++) {
            showColor(DigitalPin.P15, NeoPixelColors.Red);
            controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
            music.playTone(196, 150); // G3
            music.playTone(165, 200); // E3

            showColor(DigitalPin.P15, 0);
            controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
            basic.pause(120);
        }
        showColor(DigitalPin.P15, 0);
        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
    }

    /**
     * 수업용: I2C가 성공할 때까지 초기화 (Setup의 initialize via I2C 블록과 동일하게 동작)
     */
    //% weight=8
    //% blockId=I2CInitForClass
    //% block="initialize via I2C until success"
    //% subcategory="Class"
    //% group="Class01Setup"
    export function I2CInitForClass(): void {
        I2CInit();
    }

    /**
     * 수업용: 모터 방향과 속도 설정 (Motor의 set direction speed 블록과 동일하게 동작)
     * @param emotor Motor selection enumeration
     * @param edir   Motor direction selection enumeration
     * @param speed  Motor speed control, eg:100
     */
    //% blockId=controlMotorForClass
    //% block="set %emotor direction %edir speed %speed"
    //% speed.min=0 speed.max=255
    //% weight=7
    //% subcategory="Class"
    //% group="Class02Drive"
    export function controlMotorForClass(emotor: MyEnumMotor, edir: MyEnumDir, speed: number): void {
        controlMotor(emotor, edir, speed);
    }

    /**
     * 수업용: 모터 정지 (Motor의 set stop 블록과 동일하게 동작)
     * @param emotor Motor selection enumeration
     */
    //% blockId=controlMotorStopForClass
    //% block="set %emotor stop"
    //% weight=6
    //% subcategory="Class"
    //% group="Class02Drive"
    export function controlMotorStopForClass(emotor: MyEnumMotor): void {
        controlMotorStop(emotor);
    }

    /**
     * 수업용: 초 단위로 기다립니다. 소수도 입력할 수 있습니다 (예: 1.5초).
     * 기존 "기다리기 (ms)" 블록은 1000 단위라 초등학생이 헷갈려해서 만든 초 단위 버전입니다.
     * Wait for the given number of seconds (decimals allowed), eg: 1
     * @param seconds number of seconds to wait, eg: 1
     */
    //% blockId=waitSecondsForClass
    //% block="기다리기 %seconds 초"
    //% weight=5.9
    //% subcategory="Class"
    //% group="Class01Setup"
    export function waitSecondsForClass(seconds: number): void {
        basic.pause(Math.round(seconds * 1000));
    }

    const RACE_FINISH_EVENT_SOURCE = 3102;
    const RACE_FINISH_EVENT_VALUE = 1;
    let raceStartTime = 0;
    let raceFinishTime = 0;
    let raceFinishMonitorActive = false;
    let raceFinishElapsedSeconds = 0;  // 결승선 도착 시 저장된 경과 시간(초)
    let raceFailTime = 0;
    let raceFailElapsedSeconds = 0;    // 라인 이탈(실패) 시 저장된 경과 시간(초)

    /**
     * 수업용: 도착선(앞 센서 L1·M·R1 모두 흑색) 감지를 시작합니다. 감지되면 "도착선에 도착하면" 이벤트가 발생합니다.
     * 감지는 자동으로 꺼지지 않으므로, 다시 끄려면 "도착선 감지 끄기"를 호출하세요.
     * Start monitoring for the finish line (L1, M, R1 all detect black). Raises the "on finish line arrived" event when detected.
     * Detection keeps running until stopFinishLineMonitor() is called.
     */
    //% weight=6
    //% blockId=startFinishLineMonitor
    //% block="start finish line monitor"
    //% subcategory="Class"
    //% group="Class04RaceTimer"
    export function startFinishLineMonitor(): void {
        if (raceFinishMonitorActive) return;
        raceFinishMonitorActive = true;
        control.inBackground(function () {
            let seenNonBlack = false;
            let finishLatched = false;
            while (raceFinishMonitorActive) {
                let bits = readLineSensorBits();
                let l1 = (bits & 0x08) ? 1 : 0;
                let m = (bits & 0x04) ? 1 : 0;
                let r1 = (bits & 0x02) ? 1 : 0;
                // 결승선 판정: L1, M, R1 3개 센서가 모두 흑색
                let allBlack = (l1 === 1 && m === 1 && r1 === 1);

                if (!allBlack) {
                    seenNonBlack = true;
                    finishLatched = false;
                } else if (allBlack && seenNonBlack && !finishLatched) {
                    raceFinishTime = control.millis();
                    raceFinishElapsedSeconds = Math.idiv(raceFinishTime - raceStartTime, 1000);
                    finishLatched = true;
                    control.raiseEvent(RACE_FINISH_EVENT_SOURCE, RACE_FINISH_EVENT_VALUE);
                }
                basic.pause(50);
            }
        });
    }

    /**
     * 수업용: 도착선 감지를 중지합니다.
     * Stop the finish line monitor.
     */
    //% weight=5.8
    //% blockId=stopFinishLineMonitor
    //% block="stop finish line monitor"
    //% subcategory="Class"
    //% group="Class04RaceTimer"
    export function stopFinishLineMonitor(): void {
        raceFinishMonitorActive = false;
    }

    /**
     * 수업용: 시간 기록 변수를 0으로 초기화하고 타이머를 시작합니다.
     * 도착선 감지는 별도로 startFinishLineMonitor()를 호출해야 시작됩니다.
     * Reset the time tracking variables and start the timer.
     * Finish line detection must be started separately via startFinishLineMonitor().
     */
    //% weight=5
    //% blockId=startRaceTimer
    //% block="start timer"
    //% subcategory="Class"
    //% group="Class04RaceTimer"
    export function startRaceTimer(): void {
        raceStartTime = control.millis();
        raceFinishTime = 0;
        raceFinishElapsedSeconds = 0;
        raceFailTime = 0;
        raceFailElapsedSeconds = 0;
    }

    /**
     * 수업용: startFinishLineMonitor()로 시작한 결승선 감지(L1, M, R1 3개 센서 모두 흑색)에 도착하면
     * 실행할 코드를 등록합니다. startFinishLineMonitor()를 먼저 호출하지 않으면 이 이벤트는 발생하지 않습니다.
     * V3 내장 라인 주행(patrolling ON) 사용 시, 핸들러 안에서 모터를 멈추려면
     * controlMotorStop 전에 patrolling(OFF)를 반드시 먼저 호출하세요.
     * Run code when the finish line is detected (L1, M, R1 all black), as started by startFinishLineMonitor().
     * This event never fires unless startFinishLineMonitor() has been called first.
     * @param body code to run on finish
     */
    //% weight=4
    //% blockId=onFinishLineArrived
    //% block="도착선에 도착하면"
    //% blockGap=16
    //% subcategory="Class"
    //% group="Class04RaceTimer"
    export function onFinishLineArrived(body: () => void): void {
        control.onEvent(RACE_FINISH_EVENT_SOURCE, RACE_FINISH_EVENT_VALUE, body);
    }

    /**
     * 수업용: 레이스 타이머 시작 후 경과된 시간을 초(정수) 단위로 반환합니다.
     * 도착선에 도착했으면 도착 순간의 시간을, 라인을 이탈했으면 이탈 순간의 시간을 반환합니다.
     * Return the elapsed race time in whole seconds. Returns the captured finish or fail time once the race has ended.
     */
    //% weight=3
    //% blockId=getRaceElapsedSeconds
    //% block="타이머 경과 시간(초)"
    //% subcategory="New Features"
    //% group="NewRaceTimer"
    export function getRaceElapsedSeconds(): number {
        if (raceFinishTime > 0) return raceFinishElapsedSeconds;
        if (raceFailTime > 0) return raceFailElapsedSeconds;
        return Math.idiv(control.millis() - raceStartTime, 1000);
    }

    /**
     * 수업용: 도착 시간을 마이크로비트 LED에 소수점 1자리(0.1초 단위)로 표시합니다.
     * 예: 12.7초 → "12.7" 스크롤 표시.
     * Show the finish time on the micro:bit LED display with one decimal place (0.1s precision).
     */
    //% weight=2
    //% blockId=showRaceResult
    //% block="타이머 시간 표시"
    //% subcategory="New Features"
    //% group="NewRaceTimer"
    export function showRaceResult(): void {
        let end = raceFinishTime > 0 ? raceFinishTime : (raceFailTime > 0 ? raceFailTime : control.millis());
        let ms = end - raceStartTime;
        let secs = Math.idiv(ms, 1000);
        let tenths = Math.idiv(ms % 1000, 100);
        basic.showString(secs + "." + tenths);
    }

}
