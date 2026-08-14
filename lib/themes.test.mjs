import assert from "node:assert/strict";
import { parseThemes, themeCounts } from "./themes.js";

assert.deepEqual(parseThemes("상실, 사랑, 임의값, 사랑, 기억"), ["상실", "사랑", "기억"]);
assert.deepEqual(parseThemes(["고독", "불안", "위로", "희망"]), ["고독", "불안", "위로"]);
assert.deepEqual(themeCounts([{ themes: ["사랑", "기억"] }, { themes: ["사랑"] }]), [["사랑", 2], ["기억", 1]]);
