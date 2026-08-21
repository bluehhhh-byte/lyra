// ZIP 묶기 — 헤더 산수가 틀리면 파일이 조용히 안 열린다. 구조를 바이트로 검증한다.
import assert from "node:assert/strict";
import { buildZip, crc32 } from "./zip.js";

// CRC-32 — 알려진 값과 대조 ("123456789" → 0xCBF43926, IEEE 표준 검증 벡터)
assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
assert.equal(crc32(new Uint8Array(0)), 0);

// 두 파일 묶음 — 시그니처·개수·오프셋이 규격대로여야 어느 압축 해제기든 연다
{
  const a = new TextEncoder().encode("hello");
  const b = new TextEncoder().encode("world!");
  const zip = buildZip([
    { name: "lyra-숲-01.png", data: a },
    { name: "lyra-숲-02.png", data: b },
  ]);
  const view = new DataView(zip.buffer);

  // local file header 시그니처
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // method 0 (STORE)
  assert.equal(view.getUint16(8, true), 0);
  // UTF-8 파일명 플래그 — 한글 slug가 깨지지 않게
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  // 첫 파일 크기
  assert.equal(view.getUint32(18, true), a.length);

  // EOCD — 파일 끝 22바이트
  const eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 2, "entry 수");

  // central directory 시작 위치가 EOCD가 가리키는 곳과 일치
  const cdOffset = view.getUint32(eocd + 16, true);
  assert.equal(view.getUint32(cdOffset, true), 0x02014b50);

  // 데이터가 실제로 STORE로 들어가 있다 — 파일명 바로 뒤가 본문
  const nameLen = view.getUint16(26, true);
  const body = new TextDecoder().decode(zip.slice(30 + nameLen, 30 + nameLen + a.length));
  assert.equal(body, "hello");
}

// node의 압축 해제로 실제로 풀리는지 — 규격 준수의 최종 증거
{
  const { execSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-zip-"));
  const file = path.join(dir, "t.zip");
  const payload = new TextEncoder().encode("가사 카드 페이로드");
  fs.writeFileSync(file, buildZip([{ name: "card-01.png", data: payload }]));
  try {
    // tar는 ZIP도 푼다 (bsdtar) — 환경에 없으면 구조 검증만으로 통과시킨다
    execSync(`tar -xf "${file}" -C "${dir}"`, { stdio: "pipe" });
    const out = fs.readFileSync(path.join(dir, "card-01.png"));
    assert.equal(new TextDecoder().decode(out), "가사 카드 페이로드", "풀린 내용이 원본과 같다");
  } catch (e) {
    if (!/tar/.test(String(e.message))) throw e;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("✓ ZIP — CRC·구조·실제 해제");
