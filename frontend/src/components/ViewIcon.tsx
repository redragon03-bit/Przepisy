import type { RecipeView } from "../lib/recipeView";

// Rysunek układu listy przepisów - od razu widać, ile kafelków mieści się w rzędzie.
// Zamiast znaków ☰ ▦ ▣ ■, które na iPhonie wyglądały jak przypadkowe kwadraty.
export default function ViewIcon({ view, size = 20 }: { view: RecipeView; size?: number }) {
  const box = (x: number, y: number, w: number, h: number) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={1.5} />;
  let shapes;
  if (view === "list")
    shapes = [0, 7, 14].flatMap((y) => [box(1, y + 1, 5, 5), <rect key={`l${y}`} x={8} y={y + 2.5} width={11} height={2} rx={1} />]);
  else if (view === "small") shapes = [1, 7.5, 14].flatMap((x) => [1, 7.5, 14].map((y) => box(x, y, 5, 5)));
  else if (view === "medium") shapes = [1, 11].flatMap((x) => [1, 11].map((y) => box(x, y, 8, 8)));
  else shapes = [box(1, 1, 18, 12), <rect key="l" x={1} y={16} width={12} height={2.5} rx={1.25} />];
  return (
    <svg className="view-icon" width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      {shapes}
    </svg>
  );
}
