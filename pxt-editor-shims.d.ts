// IDE 전용 타입 보강 파일입니다. pxt.json의 files 목록에 없으므로 실제 MakeCode 빌드에는 포함되지 않습니다.
// PXT 런타임은 Math.idiv / Math.clamp 같은 자체 shim을 제공하지만, pxt_modules/core의 선언은
// 표준 lib(Array/String/Object 등)를 통째로 재정의해 일반 tsc와 충돌하므로 직접 포함하지 않고,
// 여기서는 Math 인터페이스에 필요한 멤버만 추가로 병합(declaration merging)합니다.
interface Math {
    idiv(x: number, y: number): number;
    clamp(min: number, max: number, value: number): number;
}

// pxt_modules/core/shims.d.ts의 Buffer는 //% indexerGet/indexerSet 주석으로
// buf[i] 문법을 PXT 컴파일러에만 알려주므로, 표준 tsc에는 인덱스 시그니처를 별도로 보강합니다.
interface Buffer {
    [index: number]: number;
}

// music.ts / pins.ts는 구현 파일이라 tsconfig files에 포함하지 않았지만,
// 그 안의 함수들은 실제 MakeCode 빌드에서는 정상 동작하므로 시그니처만 보강합니다.
declare namespace music {
    function playTone(frequency: number, ms: number): void;
}
declare namespace pins {
    function i2cWriteNumber(address: number, value: number, format: NumberFormat, repeated?: boolean): void;
    function i2cReadNumber(address: number, format: NumberFormat, repeated?: boolean): number;
}

declare namespace radio {
    function sendValue(name: string, value: number): void;
}
