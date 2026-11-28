// Ozdobne drobinki w klimacie motywu (iskry, para, liście, iskierki, bąbelki, śnieg).
// Same kształty i ruch są w styles.css (.ambient, zależnie od data-theme i data-fx na <html>).
// "Subtelne": pas nad listą przepisów (list); "Na bogato": cały ekran poza trybem gotowania. Nie łapią stuknięć.
const COUNT = 16;
const PARTICLES = Array.from({ length: COUNT }, (_, i) => ({
  "--x": `${(i * 37 + 11) % 100}%`,
  "--d": `${-((i * 1.7) % 9).toFixed(1)}s`,
  "--t": `${7 + ((i * 5) % 6)}s`,
  "--s": `${0.6 + ((i * 7) % 6) / 6}`,
  "--w": `${((i * 13) % 5) - 2}`,
}));

export default function ThemeAmbient({ list }: { list: boolean }) {
  return (
    <div className={`ambient${list ? " ambient-list" : ""}`} aria-hidden="true">
      {PARTICLES.map((style, i) => (
        <i key={i} style={style as React.CSSProperties} />
      ))}
    </div>
  );
}
