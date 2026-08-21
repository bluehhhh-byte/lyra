// 무압축(STORE) ZIP 묶기 — 캐러셀 카드 5장을 파일 하나로 내려받기 위한 것.
//
// 왜 ZIP인가: iOS Safari는 스크립트가 잇달아 거는 다운로드를 첫 개 이후 조용히
// 막는다. 5장을 250ms 간격으로 내려받게 하던 방식은 데스크톱에서만 다 받아졌다.
// 파일 하나면 어디서나 한 번에 끝난다.
//
// 왜 무압축인가: PNG는 이미 deflate로 압축돼 있다. 다시 압축하면 CPU만 쓰고
// 크기는 안 준다. STORE는 헤더 산수만 있으면 되므로 의존성 없이 몇십 줄이다.
// ponytail: 폴더·유니코드 플래그·zip64는 안 다룬다 — 카드 다섯 장에는 필요 없다.

// CRC-32 (IEEE 802.3) — ZIP이 요구하는 체크섬. 테이블은 첫 호출 때 한 번 만든다.
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

export function crc32(bytes) {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value, true); }

// files: [{ name, data: Uint8Array }] → ZIP 전체 바이트.
// 파일명은 UTF-8로 쓰고 언어 인코딩 플래그(bit 11)를 세운다 — 한글 slug가 깨지지 않게.
export function buildZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); // local file header signature
    u16(lv, 4, 20);         // version needed
    u16(lv, 6, 0x0800);     // UTF-8 파일명 플래그
    u16(lv, 8, 0);          // method 0 = STORE
    u32(lv, 14, crc);
    u32(lv, 18, data.length);
    u32(lv, 22, data.length);
    u16(lv, 26, name.length);
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    u32(cv, 0, 0x02014b50); // central directory signature
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u32(cv, 16, crc);
    u32(cv, 20, data.length);
    u32(cv, 24, data.length);
    u16(cv, 28, name.length);
    u32(cv, 42, offset);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32(ev, 0, 0x06054b50); // end of central directory signature
  u16(ev, 8, files.length);
  u16(ev, 10, files.length);
  u32(ev, 12, cdSize);
  u32(ev, 16, offset);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...parts, ...central, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
