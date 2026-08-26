import { notFound } from "next/navigation";
import { getAllSongs } from "../../../lib/songs";
import { translationPage } from "../../../lib/translations";
import TranslationPage from "../translation-page";

export const revalidate = 21600;
export const dynamicParams = false;

export function generateStaticParams() {
  const data = translationPage(getAllSongs(), 1);
  return Array.from({ length: Math.max(0, data.totalPages - 1) }, (_, index) => ({ page: String(index + 2) }));
}

export async function generateMetadata({ params }) {
  const { page } = await params;
  return { title: `번역만 읽기 ${page}페이지 | Lyra` };
}

export default async function TranslationsPagedPage({ params }) {
  const { page } = await params;
  const data = translationPage(getAllSongs(), Number(page));
  if (!data) notFound();
  return <TranslationPage data={data} />;
}
