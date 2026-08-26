import { parseEmotion } from "./keywords.js";

export const BROWSE_GROUP_KEYS = ["none", "country", "decade", "artist", "random"];
export const BROWSE_SORT_KEYS = ["relevance", "recent", "year"];

export function parseBrowseFilters(params) {
  const requestedDecade = params?.get("decade") || "";
  const requestedGroup = params?.get("group") || "none";
  return {
    q: params?.get("q") || "",
    tag: params?.get("tag") || "",
    emotion: parseEmotion(params?.get("emotion")),
    decade: /^\d{4}s$/.test(requestedDecade) ? requestedDecade : "",
    group: BROWSE_GROUP_KEYS.includes(requestedGroup) ? requestedGroup : "none",
    sort: BROWSE_SORT_KEYS.includes(params?.get("sort")) ? params.get("sort") : "relevance",
  };
}

export function serializeBrowseFilters({ q = "", tag = "", emotion = "", decade = "", group = "none", sort = "relevance" }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (emotion) params.set("emotion", emotion);
  if (decade) params.set("decade", decade);
  if (group !== "none") params.set("group", group);
  if (sort !== "relevance") params.set("sort", sort);
  return params.toString();
}
