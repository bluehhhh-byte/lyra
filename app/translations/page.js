import { getAllSongs } from "../../lib/songs";
import { translationPage } from "../../lib/translations";
import TranslationPage from "./translation-page";

export const metadata = { title: "번역만 읽기 | Lyra", description: "기록한 노래의 번역을 이어 읽는 페이지" };
export const revalidate = 21600;

export default function TranslationsPage() {
  return <TranslationPage data={translationPage(getAllSongs(), 1)} />;
}
