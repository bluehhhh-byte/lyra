import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tap = await readFile(new URL("../app/audio-tap.js", import.meta.url), "utf8");
const scope = await readFile(new URL("../app/scope.js", import.meta.url), "utf8");

assert.match(tap, /const sources = new WeakMap/);
assert.match(tap, /sources\.set\(audio, pending\)/, "동시 tap 전에 생성 Promise를 캐시해야 한다");
assert.equal((tap.match(/createMediaElementSource/g) || []).length, 1, "소스 생성 지점은 정확히 하나여야 한다");
assert.match(tap, /source\.connect\(context\.destination\)/);
assert.match(tap, /shared\.source\.connect\(analyser\)/);
assert.match(tap, /shared\.source\.disconnect\(analyser\)/);
assert.doesNotMatch(tap, /^const .*window|^let .*AudioContext/m, "모듈 평가 중 브라우저 API에 접근하면 안 된다");
assert.match(scope, /import \{ tapAudio \} from "\.\/audio-tap"/);
assert.match(scope, /releaseTap\?\.\(\)/);
assert.doesNotMatch(scope, /createMediaElementSource|new \(window\.AudioContext/);

console.log("✓ 오디오 tap — 단일 MediaElementSource·다중 analyser·Scope 해제 계약");
