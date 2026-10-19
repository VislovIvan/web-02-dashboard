// Маска суши 120x48, клетка 3°: Natural Earth land 110m (общественное достояние), пакет world-atlas.
// Широты от 84° с. ш. до 60° ю. ш.: орбита МКС не выходит за 52°.
// Строка сетки: 30 шестнадцатеричных символов, бит 1 означает сушу. Запад слева, север сверху.
export const WORLD_COLS = 120;
export const WORLD_ROWS = 48;
export const LAT_TOP = 84;
export const LAT_BOTTOM = -60;

const ROWS_HEX = [
  '00000003fdfff80000000000000000',
  '0000000ffffffc00f000001e000000',
  '00000f3fcffffc004000801fc03000',
  '00003ebbe07ff800000211fffe1000',
  '03f8f7dff83ff0001e06ffffffff8c',
  '7fffffffffffffff80780800000000',
  '1ffffffffffffffffffffffffffffe',
  '07fffff8381c0003dffffffffffffe',
  '0383fff83e000023cffffffffff240',
  '0000ffff3f8000719fffffffffc0c0',
  '00007fffffc0007ffffffffffff080',
  '00003ffffec0003ffffffffffff000',
  '00003ffffe00001fffffffffffc000',
  '00003ffff800007ffc77ffffff9000',
  '00003ffff00000787ffbfffffe2000',
  '00001fffe000007217fbfffffa2000',
  '00000fffe000003f00fffffff3e000',
  '000007ff8000007ffffffffff90000',
  '000003f0800000fffff7fffff80000',
  '000003f0000001fffffbfffff00000',
  '00000070400003ffff7f1fffe00000',
  '00000076280003fffffe0f9f800000',
  '0000003f000003ffffbc0f1f080000',
  '00000003000003fffff00607880000',
  '000000011f0001fffff80603040000',
  '000000003f8000fffff80204040000',
  '000000003fe00053fff0000e300000',
  '000000007fe00001ffe00006f00000',
  '000000007ff80001ffc00006f88000',
  '000000007fff0000ff800002087800',
  '000000007fff8000ff800001c03800',
  '000000003fff0000ffc00000000400',
  '000000003ffe0000ffc8000001d000',
  '000000001ffe0000fff8000007f800',
  '000000000ffe0000ff1800000ff800',
  '000000000ffc00007f3000003ffc00',
  '000000000ff000007e1000003ffe00',
  '000000000ff000007e0000003ffe00',
  '000000000fe000003c0000003ffe00',
  '000000000fc0000020000000187e00',
  '000000001f80000000000000001c02',
  '000000001e00000000000000000002',
  '000000001e0000000000000000000c',
  '000000001c00000000000000000008',
  '000000001c00000000000000000000',
  '000000001800000000000000000000',
  '000000000c00000000000000000000',
  '000000000000000000000000000000',
];

// Распаковка в плоский массив: 1 у суши, 0 у воды
export function decodeLand() {
  const cells = new Uint8Array(WORLD_COLS * WORLD_ROWS);
  ROWS_HEX.forEach((hex, row) => {
    for (let i = 0; i < hex.length; i++) {
      const nibble = parseInt(hex[i], 16);
      for (let bit = 0; bit < 4; bit++) {
        cells[row * WORLD_COLS + i * 4 + bit] = (nibble >> (3 - bit)) & 1;
      }
    }
  });
  return cells;
}
