import FallbackBanner from "./fallback-banner";

// 관리자 화면에는 레이아웃이 없었다 — 페이지마다 제 껍데기를 그렸다. 모든
// 관리자 페이지 위에 하나만 얹으면 되는 것(폴백 경고)이 생겨서 만든다.
//
// 배너는 클라이언트에서 /api/version을 폴링한다. 서버에서 판정해 버리면
// force-dynamic인 페이지도 렌더 시점의 한 번뿐이라, 열어 둔 채 장애가 시작되면
// 끝까지 모른다.
export default function AdminLayout({ children }) {
  return (
    <>
      <FallbackBanner />
      {children}
    </>
  );
}
