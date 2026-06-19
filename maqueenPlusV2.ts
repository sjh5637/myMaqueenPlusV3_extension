
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
//% weight=100 color=#0fbc11 icon="\uf067" block="MaqueenPlusV2&V3"
//% groups="['Setup', 'Motor', 'LED', 'Sensors', 'NeoPixel', 'V3', 'Effects']"
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
    
    let irstate: number;
    let neopixel_buf = pins.createBuffer(16 * 3);
    for (let i = 0; i < 16 * 3; i++) {
        neopixel_buf[i] = 0
    }
    let _brightness = 255
    let state: number;

    // Line safety monitor state variables
    let safetyMonitorActive = false;
    let safetyAlertColor = 0xFF0000; // Red
    let safetyStopMotors = true;
    let safetyLightAlert = true;
    let safetySoundAlert = true;
    let deviationHandler: (() => void) | null = null;

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

    /**
     * Control left and right LED light switch module
     * @param eled LED lamp selection
     * @param eSwitch Control LED light on or off
     */

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
     * Get the state of the patrol sensor
     * @param eline Select the inspection sensor enumeration
     */

    //% block="read line sensor %eline state"
    //% weight=96
    //% group="Sensors"
    export function readLineSensorState(eline:MyEnumLineSensor):number{
        pins.i2cWriteNumber(I2CADDR, LINE_STATE_REGISTER, NumberFormat.Int8LE);
        let data = pins.i2cReadNumber(I2CADDR, NumberFormat.Int8LE)
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
        let r$: number;
        let g$: number;
        let b$: number;
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
    maqueenPlusV2.setRightOrStraightRunMode(RightOrStraight.Straight)
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

    //% block="Read Real-time Speed %type wheel"
    //% weight=12
    //% group="V3"
    //% advanced=true
    export function readRealTimeSpeed(type: DirectionType2): number {
        let allBuffer = pins.createBuffer(2);
        pins.i2cWriteNumber(I2CADDR, 76, 1);
        allBuffer = pins.i2cReadBuffer(I2CADDR, 2);
        if (type == DirectionType2.Left)
            return allBuffer[0] / 5;
        else
            return allBuffer[1] / 5;
    }

    /**
     * 마퀸플러스 V3 하단 섀시에 탑재된 전면 RGB 헤드라이트의 단색을 지정합니다. (V3 전용)
     * Set the solid color of the Left, Right, or All front RGB headlights of Maqueen Plus V3.
     * @param type Light side (Left/Right/All)
     * @param rgb Selected car light color
     */

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
    //% weight=9 block="SET PIN|%pin stop all animations"
    //% pin.defl=DigitalPin.P15
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
    //% pin.defl=DigitalPin.P15
    //% interval.defl=200
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
    //% pin.defl=DigitalPin.P15
    //% interval.defl=500
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
    //% pin.defl=DigitalPin.P15
    //% speed.min=1 speed.max=5 speed.defl=3
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
    //% block="express emotion %emotion"
    //% group="Effects"
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
     * Start monitoring if the robot deviates from the black line (V2 & V3 compatible).
     * If it deviates (crosses L2/R2 or exits the line completely), it stops motors and alerts.
     * @param pin pin to control the leds
     * @param color alert color when deviated
     * @param stopMotors automatically stop motors when deviated, eg: true
     * @param lightAlert automatically turn on warning lights when deviated, eg: true
     * @param soundAlert automatically play alert tone when deviated, eg: true
     */
    //% weight=4
    //% blockId=lineMonitorStart
    //% pin.defl=DigitalPin.P15
    //% color.defl=0xFF0000
    //% stopMotors.defl=true
    //% lightAlert.defl=true
    //% soundAlert.defl=true
    //% block="start line safety monitor PIN|%pin color|%color stop motors|%stopMotors light alert|%lightAlert sound|%soundAlert"
    //% color.shadow=colorNumberPicker
    //% group="Effects"
    export function startLineSafetyMonitor(
        pin: DigitalPin,
        color: number,
        stopMotors: boolean,
        lightAlert: boolean,
        soundAlert: boolean
    ): void {
        safetyAlertColor = color;
        safetyStopMotors = stopMotors;
        safetyLightAlert = lightAlert;
        safetySoundAlert = soundAlert;

        if (safetyMonitorActive) return;
        safetyMonitorActive = true;

        control.inBackground(function () {
            let wasOnLine = false;
            while (safetyMonitorActive) {
                let l2 = readLineSensorState(MyEnumLineSensor.SensorL2);
                let l1 = readLineSensorState(MyEnumLineSensor.SensorL1);
                let m = readLineSensorState(MyEnumLineSensor.SensorM);
                let r1 = readLineSensorState(MyEnumLineSensor.SensorR1);
                let r2 = readLineSensorState(MyEnumLineSensor.SensorR2);

                let isOnLine = (l1 === 1 || m === 1 || r1 === 1);
                
                // Trigger if L2 or R2 detects the black line, or if we were on the line and now completely lost it
                let deviated = (l2 === 1 || r2 === 1) || (wasOnLine && !isOnLine && l2 === 0 && r2 === 0);

                if (deviated) {
                    if (safetyStopMotors) {
                        controlMotorStop(MyEnumMotor.AllMotor);
                    }
                    if (safetyLightAlert) {
                        showColor(pin, safetyAlertColor);
                        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Open);
                    }
                    if (safetySoundAlert) {
                        music.playTone(440, 500);
                    }
                    
                    // Trigger event callback if registered
                    if (deviationHandler) {
                        deviationHandler();
                    }
                    
                    basic.pause(1000); // pause to prevent immediate re-trigger
                    wasOnLine = false;
                } else {
                    if (isOnLine) {
                        wasOnLine = true;
                    }
                }
                basic.pause(50);
            }
        });
    }

    /**
     * Stop the line safety monitor
     * @param pin pin to control the leds
     */
    //% weight=3
    //% blockId=lineMonitorStop
    //% pin.defl=DigitalPin.P15
    //% block="stop line safety monitor PIN|%pin"
    //% group="Effects"
    export function stopLineSafetyMonitor(pin: DigitalPin): void {
        safetyMonitorActive = false;
        showColor(pin, 0);
        controlLED(MyEnumLed.AllLed, MyEnumSwitch.Close);
    }

    /**
     * Set up line deviation handler and start monitoring (V2 & V3 compatible).
     * @param stopMotors automatically stop motors when deviated, eg: true
     * @param lightAlert automatically turn on warning lights when deviated, eg: true
     * @param soundAlert automatically play alert tone when deviated, eg: true
     * @param handler code to run when deviated
     */
    //% weight=2
    //% blockId=onLineDeviated
    //% stopMotors.defl=true
    //% lightAlert.defl=true
    //% soundAlert.defl=true
    //% block="when line deviated motors|%stopMotors light|%lightAlert sound|%soundAlert handler"
    //% group="Effects"
    export function onLineDeviated(stopMotors: boolean, lightAlert: boolean, soundAlert: boolean, handler: () => void): void {
        deviationHandler = handler;
        startLineSafetyMonitor(DigitalPin.P15, NeoPixelColors.Red, stopMotors, lightAlert, soundAlert);
    }

}



