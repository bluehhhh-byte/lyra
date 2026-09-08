export default function AdminErrorMessage({
  message,
  compact = false,
  className = "",
  actionHref = "",
  actionLabel = "다시 로그인",
}) {
  if (!message) return null;
  // 예전엔 팔레트 직접 지정 + OS 추종 변형을 썼는데, 이 사이트의 테마는
  // data-theme이 정하므로 OS 라이트 + 사이트 다크(기본값)에서 어두운 배경에
  // 라이트용 진한 붉은색이 얹혔다. 상태색 토큰은 테마 블록에서 값이 갈리므로
  // 변형 없이 항상 맞는다.
  if (compact) {
    return <span role="alert" className={`text-xs text-danger ${className}`}>{message}</span>;
  }
  return (
    <div role="alert" className={` border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ${className}`}>
      <p>{message}</p>
      {actionHref && <a href={actionHref} className="mt-2 inline-block font-semibold underline">{actionLabel}</a>}
    </div>
  );
}
