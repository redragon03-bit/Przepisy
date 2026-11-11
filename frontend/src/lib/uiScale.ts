// Skala wyglądu (Ustawienia → Wygląd): każda grupa czcionek, kółka i odstępy osobno, co 5%.
// Zapisana w telefonie (localStorage) i ustawiana jako zmienne CSS --s-<grupa> (1 = 100%).
// Bez importów z aplikacji - testy (npm test) uruchamiają ten plik bezpośrednio w Node.

export type ScaleKey = "title" | "body" | "list" | "small" | "kitchen" | "timer" | "check" | "space";
export type Scales = Record<ScaleKey, number>;

export const SCALE_GROUPS: { key: ScaleKey; label: string; hint: string }[] = [
  { key: "title", label: "Tytuły", hint: "nazwy przepisów, nagłówki sekcji" },
  { key: "body", label: "Tekst", hint: "opisy, kroki, przyciski" },
  { key: "list", label: "Składniki i zakupy", hint: "listy do odhaczania" },
  { key: "small", label: "Małe napisy", hint: "kcal, czasy, podpowiedzi" },
  { key: "kitchen", label: "Tryb gotowania", hint: "duży tekst kroku" },
  { key: "timer", label: "Minutnik", hint: "pastylka z czasem" },
  { key: "check", label: "Kółka do odhaczania", hint: "składniki i zakupy" },
  { key: "space", label: "Odstępy", hint: "między akapitami, wierszami i ramkami" },
];

export const SCALE_MIN = 50;
export const SCALE_MAX = 200;
export const SCALE_STEP = 5;
const KEY = "ui-scale";

export const DEFAULT_SCALES: Scales = Object.fromEntries(SCALE_GROUPS.map((g) => [g.key, 100])) as Scales;

export function clampScale(value: number): number {
  const stepped = Math.round(value / SCALE_STEP) * SCALE_STEP;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, stepped));
}

// Zapisane ustawienia; brakujące lub zepsute wartości = 100%
export function parseScales(raw: string | null): Scales {
  const scales = { ...DEFAULT_SCALES };
  if (!raw) return scales;
  try {
    const saved = JSON.parse(raw) as Record<string, unknown>;
    for (const g of SCALE_GROUPS) {
      const v = saved[g.key];
      if (typeof v === "number" && Number.isFinite(v)) scales[g.key] = clampScale(v);
    }
  } catch {
    // zepsuty zapis - domyślne
  }
  return scales;
}

export function loadScales(): Scales {
  try {
    return parseScales(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SCALES };
  }
}

export function saveScales(scales: Scales) {
  try {
    localStorage.setItem(KEY, JSON.stringify(scales));
  } catch {
    // tryb prywatny - działa do zamknięcia aplikacji
  }
}

export function applyScales(scales: Scales) {
  const root = document.documentElement.style;
  for (const g of SCALE_GROUPS) root.setProperty(`--s-${g.key}`, String(scales[g.key] / 100));
}

// "Tytuły 90% · Odstępy 80%" - tylko to, co różni się od 100%
export function scalesSummary(scales: Scales): string {
  const changed = SCALE_GROUPS.filter((g) => scales[g.key] !== 100).map((g) => `${g.label} ${scales[g.key]}%`);
  return changed.length ? changed.join(" · ") : "wszystko 100%";
}

// Opis ekranu do logu na serwerze, np. "iPhone 428×926 @3"
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const kind = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "komputer";
  return `${kind} ${screen.width}×${screen.height} @${window.devicePixelRatio}`;
}
