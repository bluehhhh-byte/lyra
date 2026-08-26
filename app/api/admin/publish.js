import { revalidatePath } from "next/cache";
import { completePublication } from "../../../lib/publish-candidates";
import { readRuntimeData, writeData } from "../../../lib/store";

export async function handlePublish(action, body) {
  if (action !== "publishComplete") return null;
  const current = await readRuntimeData("instagram-published.json", { items: [], at: "" });
  const next = completePublication(current, body);
  await writeData("instagram-published.json", JSON.stringify(next, null, 1), `data: ${body.slug} 발행 완료`);
  revalidatePath("/admin/publish-queue");
  return Response.json({ ok: true, publishedAt: next.items.at(-1).publishedAt });
}
