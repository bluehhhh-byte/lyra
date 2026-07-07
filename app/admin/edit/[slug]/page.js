import EditForm from "./edit-form";

export const metadata = { title: "곡 수정 | Lyra" };

export default async function EditPage({ params }) {
  const { slug } = await params;
  return <EditForm slug={decodeURIComponent(slug)} />;
}
