// 계측이 사용량을 만들지 않는지 — 기본 off 계약.
//
// 켜져 있던 동안 콘텐츠 DB read 한 번이 lyra_usage_buckets upsert를 불러 왕복이
// 두 배가 됐고, 브라우저 비콘도 표본 세션의 경로 변경마다 write를 만들었다.
// 관측 대상(Neon)을 관측 행위가 다시 깨우는 구조였다.
//   node lib/usage-gate.test.mjs
import assert from "node:assert/strict";
import { usageMetricsEnabled } from "./usage-metrics-core.js";

// 1) 기본값은 off — 환경변수를 두지 않은 배포에서 방문자 요청이 DB를 건드리지 않는다
{
  assert.equal(usageMetricsEnabled({}), false, "환경변수가 없으면 꺼져 있어야 한다");
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "" }), false);
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "off" }), false);
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "false" }), false);
  // 오타나 알 수 없는 값은 켜지 않는다 — 모르는 값에서 비용이 발생하면 안 된다
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "yes please" }), false);
}

// 2) 명시적으로 켤 수 있다
{
  for (const value of ["on", "ON", "1", "true", "TRUE", "yes"]) {
    assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: value }), true, `${value}는 켜져야 한다`);
  }
}

// 3) 붙여넣기 오염에 견딘다.
// LYRA_CONTENT_STORE와 DATABASE_URL이 BOM 때문에 이틀씩 조용히 죽은 전력이 있다.
// 여기서는 반대 방향이 더 위험하다 — 끄려고 넣은 값이 안 읽혀 켜진 채로 남는 것.
{
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "﻿on" }), true, "BOM이 붙어도 읽어야 한다");
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: " on \n" }), true, "공백·개행을 다듬어야 한다");
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: '"on"' }), true, "따옴표가 감싸도 읽어야 한다");
  assert.equal(usageMetricsEnabled({ LYRA_USAGE_METRICS: "﻿off" }), false, "BOM 붙은 off는 꺼진 것이다");
}

// 4) 읽기 경로에 게이트가 실제로 걸려 있다 — 소스로 확인한다.
// 함수를 부르려면 DB 연결이 필요해 단위 테스트에서 실행할 수 없다.
{
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  const contentDb = read("lib/content-db.js");
  assert.match(
    contentDb,
    /async function trackRead[\s\S]{0,400}?if \(!usageMetricsEnabled\(\)\) return value;/,
    "trackRead가 계측 off일 때 즉시 반환해야 콘텐츠 read가 write를 만들지 않는다"
  );

  const metrics = read("lib/usage-metrics.js");
  assert.match(
    metrics,
    /saveBrowserUsage[\s\S]{0,300}?if \(!usageMetricsEnabled\(\)\) return false;/,
    "saveBrowserUsage도 닫혀 있어야 다른 호출자가 생겨도 새지 않는다"
  );

  const route = read("app/api/usage/route.js");
  assert.match(route, /if \(!usageMetricsEnabled\(\)\) return new Response/, "비콘 라우트가 먼저 막아야 한다");

  const layout = read("app/layout.js");
  assert.match(layout, /usageMetricsEnabled\(\)\s*&&\s*<UsageReporter/, "꺼져 있으면 리포터를 렌더하지 않는다");
}

console.log("✓ 계측 게이트 — 기본 off, 읽기·비콘·리포터 모두 차단");
