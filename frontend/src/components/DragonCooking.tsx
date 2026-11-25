// Smok z logo gotuje: nad kotłem unosi się para, w kotle bulgocze, pod kotłem migocze ogień.
// Sam obrazek to logo (apple-touch-icon), animacje są nałożone w CSS (.dragon-cook w styles.css,
// ta sama wersja w index.html dla ekranu przed wczytaniem aplikacji).
export default function DragonCooking({ size = 168 }: { size?: number }) {
  return (
    <div className="dragon-cook" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/apple-touch-icon.png" alt="" width={size} height={size} />
      <span className="dc-fire" />
      <span className="dc-bubble b1" />
      <span className="dc-bubble b2" />
      <span className="dc-bubble b3" />
      <span className="dc-steam s1" />
      <span className="dc-steam s2" />
      <span className="dc-steam s3" />
    </div>
  );
}
