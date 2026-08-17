import { getMomentRuntime, removeMoment, saveMoment } from "../../../lib/moments";

export async function handleMoments(action, body) {
  if (action === "momentSave") {
    const previousSlug = String(body.previousSlug || "").trim();
    if (previousSlug && !(await getMomentRuntime(previousSlug, { includeDrafts: true })))
      return Response.json({ error: "수정할 장면을 찾을 수 없습니다" }, { status: 404 });
    const moment = await saveMoment(body, previousSlug);
    return Response.json({ slug: moment.slug });
  }
  if (action === "momentDelete") {
    const slug = String(body.slug || "").trim();
    if (!slug) return Response.json({ error: "삭제할 장면이 없습니다" }, { status: 400 });
    await removeMoment(slug);
    return Response.json({ ok: true });
  }
  return null;
}
