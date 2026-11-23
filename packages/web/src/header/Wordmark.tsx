/** The page title: a gravestone mark and the name. The mark is decoration; its colour comes from CSS. */
export function Wordmark() {
  return (
    <h1 className="wordmark">
      <svg className="wordmark-mark" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <path d="M5 22V10a7 7 0 0 1 14 0v12z" />
        <path className="wordmark-cross" d="M11 8h2v2h2v2h-2v4h-2v-4H9v-2h2z" />
      </svg>
      <span className="wordmark-name">Sexton</span> <span className="wordmark-sub">cemetery</span>
    </h1>
  );
}
