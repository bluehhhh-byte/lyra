import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { carouselSizeReport, formatCarouselBytes } from "./carousel.js";

test("reports actual size for every generated PNG", () => {
  const report = carouselSizeReport([{ size: 512_000 }, { size: 1_048_576 }, { size: 700_000 }]);
  assert.deepEqual(report.perCard, [512_000, 1_048_576, 700_000]);
  assert.equal(report.total, 2_260_576);
  assert.equal(report.average, 753_525);
  assert.equal(report.largest, 1_048_576);
  assert.equal(formatCarouselBytes(512_000), "500 KB");
  assert.equal(formatCarouselBytes(1_048_576), "1.00 MB");
});

test("studio renders the measured Blob sizes", () => {
  const source = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
  assert.match(source, /carouselSizeReport\(cards\.map\(\(card\) => card\.blob\)\)/);
  assert.match(source, /장당.*sizeReport\.perCard/);
  assert.match(source, /전체.*sizeReport\.total/);
});
