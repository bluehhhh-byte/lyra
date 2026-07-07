import { notFound } from "next/navigation";
import EditForm from "./edit-form";

export const metadata = { title: "곡 수정 | Lyra" };

export default async function EditPage({ params }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;
  return <EditForm slug={decodeURIComponent(slug)} />;
}
