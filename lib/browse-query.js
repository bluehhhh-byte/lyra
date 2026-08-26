import { parseEmotion } from "./keywords.js";

export const BROWSE_GROUP_KEYS = ["none", "country", "decade", "artist", "random"];

export function parseBrowseFilters(params) {
  const requestedDecade = params?.get("decade") || "";
  const requestedGroup = params?.get("group") || "none";
  return {
    q: params?.get("q") || "",
    tag: params?.get("tag") || "",
    emotion: parseEmotion(params?.get("emotion")),
    decade: /^\d{4}s$/.test(requestedDecade) ? requestedDecade : "",
    group: BROWSE_GROUP_KEYS.includes(requestedGroup) ? requestedGroup : "none",
  };
}

export function serializeBrowseFilters({ q = "", tag = "", emotion = "", decade = "", group = "none" }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (emotion) params.set("emotion", emotion);
  if (decade) params.set("decade", decade);
  if (group !== "none") params.set("group", group);
  return params.toString();
}
