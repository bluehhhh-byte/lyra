export default function AdminErrorMessage({
  message,
  compact = false,
  className = "",
  actionHref = "",
  actionLabel = "다시 로그인",
}) {
  if (!message) return null;
  if (compact) {
    return <span role="alert" className={`text-xs text-red-600 dark:text-red-400 ${className}`}>{message}</span>;
  }
  return (
    <div role="alert" className={`rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 ${className}`}>
      <p>{message}</p>
      {actionHref && <a href={actionHref} className="mt-2 inline-block font-semibold underline">{actionLabel}</a>}
    </div>
  );
}
