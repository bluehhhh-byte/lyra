import { lowestPenalty } from "./aggregators.ts";
import { optimalLayouts } from "./calculators.ts";
import { balance } from "./selectors.ts";
import type { LineBreakStrategy, LineBreakStrategyOptions } from "./types.ts";

/** Creates a complete strategy while filling omitted stages with library defaults. */
export function createLineBreakStrategy(
  options: LineBreakStrategyOptions = {},
): LineBreakStrategy {
  return {
    aggregate: options.aggregate ?? lowestPenalty(),
    calculate: options.calculate ?? optimalLayouts(),
    select: options.select ?? balance(),
  };
}
