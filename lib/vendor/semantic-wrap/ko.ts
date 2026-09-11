import { createBudouxPredictor, definePhraseModel } from "./index.ts";
import {
  koreanTitleCoarseModel,
  koreanTitleFineModel,
  koreanTitleMediumModel,
} from "./ko-models.ts";

/** Three-level Korean title model trained from cumulative semantic pseudo-labels. */
export const koTitleModel = definePhraseModel({
  boundaryMode: "spaces",
  levels: [
    {
      name: "coarse",
      predictor: createBudouxPredictor(koreanTitleCoarseModel),
      penalty: 0,
    },
    {
      name: "medium",
      predictor: createBudouxPredictor(koreanTitleMediumModel),
      penalty: 0.35,
    },
    {
      name: "fine",
      predictor: createBudouxPredictor(koreanTitleFineModel),
      penalty: 0.7,
    },
  ],
  fallbackPenalty: 1,
});
