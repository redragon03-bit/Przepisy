// Ekran ładowania "Smoczej strawy" zamiast gołego napisu „Ładowanie…”.
// - <LoadingScreen /> - cały ekran z logo, gdy aplikacja startuje (ten sam wygląd co w index.html)
// - <Loading /> - na stronie, gdy czekamy na dane (logo pulsuje, pod spodem napis)

export function LoadingScreen({ text = "Ładowanie…" }: { text?: string }) {
  return (
    <div className="boot" aria-busy="true">
      <img className="boot-logo" src="/apple-touch-icon.png" alt="" width={112} height={112} />
      <strong>Smocza strawa</strong>
      <span className="boot-dots">{text}</span>
    </div>
  );
}

export default function Loading({ text = "Ładowanie…" }: { text?: string }) {
  return (
    <div className="page-loading" aria-busy="true">
      <img className="page-loading-logo" src="/apple-touch-icon.png" alt="" width={64} height={64} />
      <span>{text}</span>
    </div>
  );
}
