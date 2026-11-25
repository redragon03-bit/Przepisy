// Motyw kolorów (Ustawienia → Wygląd): paleta + tryb jasny/ciemny/automatyczny.
// Zapisany w telefonie (localStorage) i ustawiany jako zmienne CSS na <html> (te same nazwy co w styles.css).
// Bez importów z aplikacji - testy (npm test) uruchamiają ten plik bezpośrednio w Node.

export type ThemeId = "klasyczny" | "smok" | "las" | "ksiega" | "eliksir" | "lod";
export type ThemeMode = "auto" | "light" | "dark";
export type Scheme = "light" | "dark";
// Efekty: bez, subtelne (gradienty, połysk, iskry nad listą), na bogato (tło, poświata, animacje wszędzie)
export type Fx = "off" | "subtle" | "bold";

// Kolory, które zmienia motyw. Semantyka (brak, promocja, -30%, ostatnia minuta) zostaje wszędzie taka sama.
type Palette = {
  bg: string;
  surface: string;
  "surface-2": string;
  text: string;
  muted: string;
  accent: string;
  "accent-strong": string; // tekst w kolorze akcentu i tło pod białym tekstem: kontrast >= 4.5:1
  "on-accent": string;
  "accent-soft": string;
  "on-accent-soft": string;
  border: string;
  field: string;
  "field-border": string;
  "timer-progress": string;
  "accent-2": string; // drugi koniec gradientu przycisków (tekst on-accent czytelny na obu końcach)
};

export type Theme = { id: ThemeId; label: string; hint: string; light: Palette; dark: Palette };

const SHADOW: Record<Scheme, [string, string]> = {
  light: ["0 1px 2px rgb(43 33 24 / 6%), 0 2px 8px rgb(43 33 24 / 6%)", "0 4px 12px rgb(43 33 24 / 12%), 0 12px 32px rgb(43 33 24 / 10%)"],
  dark: ["0 1px 2px rgb(0 0 0 / 40%)", "0 8px 28px rgb(0 0 0 / 55%)"],
};

export const THEMES: Theme[] = [
  {
    id: "klasyczny",
    label: "Klasyczny",
    hint: "pomarańcz i ciepłe brązy",
    light: {
      bg: "#fffaf5", surface: "#ffffff", "surface-2": "#fff3ea", text: "#2b2118", muted: "#6f6256",
      accent: "#e8692c", "accent-strong": "#c2410c", "on-accent": "#ffffff", "accent-soft": "#fde7da", "on-accent-soft": "#7a2e0e",
      border: "#eadfd5", field: "#ffffff", "field-border": "#cdbcad", "timer-progress": "#ff9a5c", "accent-2": "#b91c1c",
    },
    dark: {
      bg: "#1b1714", surface: "#26201c", "surface-2": "#2f2722", text: "#f3ebe4", muted: "#b8a99c",
      accent: "#ff8a4c", "accent-strong": "#ff8a4c", "on-accent": "#1b1714", "accent-soft": "#4a2c1c", "on-accent-soft": "#ffc9a8",
      border: "#3a312b", field: "#342b25", "field-border": "#6b5a4d", "timer-progress": "#e8692c", "accent-2": "#ffb347",
    },
  },
  {
    id: "smok",
    label: "Smocze złoto",
    hint: "karmazyn i złoto ze smoczego skarbca",
    light: {
      bg: "#fbf6ee", surface: "#ffffff", "surface-2": "#f7ecdc", text: "#2a1a17", muted: "#6e5a52",
      accent: "#a3203a", "accent-strong": "#8e1b33", "on-accent": "#ffffff", "accent-soft": "#f6e3b4", "on-accent-soft": "#5c3a00",
      border: "#ead9c6", field: "#ffffff", "field-border": "#ccb59e", "timer-progress": "#e0a526", "accent-2": "#b45309",
    },
    dark: {
      bg: "#140f10", surface: "#1f1718", "surface-2": "#2a1d1f", text: "#f5ece4", muted: "#bba69c",
      accent: "#f2b84b", "accent-strong": "#f2b84b", "on-accent": "#1a1207", "accent-soft": "#4d1a24", "on-accent-soft": "#ffd38a",
      border: "#3a2a2c", field: "#2c2022", "field-border": "#6e5357", "timer-progress": "#c8344f", "accent-2": "#ff7a45",
    },
  },
  {
    id: "las",
    label: "Leśne zioła",
    hint: "szałwia, mech i rozmaryn",
    light: {
      bg: "#f6f8f1", surface: "#ffffff", "surface-2": "#ebf1e2", text: "#1d2a1f", muted: "#56665a",
      accent: "#3d7a4a", "accent-strong": "#2f6a3c", "on-accent": "#ffffff", "accent-soft": "#dcebd6", "on-accent-soft": "#1f4a2a",
      border: "#d8e2d0", field: "#ffffff", "field-border": "#a9bba6", "timer-progress": "#8cc084", "accent-2": "#1f6f6a",
    },
    dark: {
      bg: "#111813", surface: "#18221b", "surface-2": "#1f2b22", text: "#e8f0e6", muted: "#a3b5a6",
      accent: "#8fd19e", "accent-strong": "#8fd19e", "on-accent": "#0f1a12", "accent-soft": "#213a28", "on-accent-soft": "#bfe6c6",
      border: "#2c3a30", field: "#1f2b22", "field-border": "#4f6655", "timer-progress": "#3d7a4a", "accent-2": "#d4e78a",
    },
  },
  {
    id: "ksiega",
    label: "Księga czarów",
    hint: "pergamin, atrament i złote litery",
    light: {
      bg: "#f8f3e6", surface: "#fffdf7", "surface-2": "#f1e8d2", text: "#1f1d33", muted: "#5f5a70",
      accent: "#3b3f8f", "accent-strong": "#34388a", "on-accent": "#ffffff", "accent-soft": "#e3e2f5", "on-accent-soft": "#262a6b",
      border: "#e3d8bf", field: "#fffdf7", "field-border": "#c2b596", "timer-progress": "#d4a84a", "accent-2": "#6d28d9",
    },
    dark: {
      bg: "#0f1226", surface: "#171b36", "surface-2": "#1e2342", text: "#ece8f8", muted: "#a9a6c4",
      accent: "#e6c068", "accent-strong": "#e6c068", "on-accent": "#15132a", "accent-soft": "#2a2f5e", "on-accent-soft": "#cdd0ff",
      border: "#2a2f52", field: "#1e2342", "field-border": "#4d5384", "timer-progress": "#7b82e0", "accent-2": "#f0a868",
    },
  },
  {
    id: "eliksir",
    label: "Eliksir",
    hint: "fiolet z pracowni alchemika",
    light: {
      bg: "#faf6fb", surface: "#ffffff", "surface-2": "#f3eaf5", text: "#261a2b", muted: "#67586d",
      accent: "#7b3fa0", "accent-strong": "#6c3290", "on-accent": "#ffffff", "accent-soft": "#efdff6", "on-accent-soft": "#4b1f66",
      border: "#e7dbeb", field: "#ffffff", "field-border": "#c4b1cb", "timer-progress": "#c08ae0", "accent-2": "#be185d",
    },
    dark: {
      bg: "#161019", surface: "#201826", "surface-2": "#2a2031", text: "#f1e9f4", muted: "#b6a6bd",
      accent: "#c99af0", "accent-strong": "#c99af0", "on-accent": "#1b1020", "accent-soft": "#3b2650", "on-accent-soft": "#e4ccf7",
      border: "#382b40", field: "#2a2031", "field-border": "#66537a", "timer-progress": "#9b5cc4", "accent-2": "#f0a6d8",
    },
  },
  {
    id: "lod",
    label: "Lodowy smok",
    hint: "turkus i szron z północnych gór",
    light: {
      bg: "#f3f8fa", surface: "#ffffff", "surface-2": "#e6f1f5", text: "#13262e", muted: "#4f6670",
      accent: "#12708a", "accent-strong": "#0e6179", "on-accent": "#ffffff", "accent-soft": "#d4ecf3", "on-accent-soft": "#0b4556",
      border: "#d5e4ea", field: "#ffffff", "field-border": "#a3bcc6", "timer-progress": "#6cc4dc", "accent-2": "#1d4ed8",
    },
    dark: {
      bg: "#0d161b", surface: "#142128", "surface-2": "#1a2a33", text: "#e4f1f5", muted: "#9fb6bf",
      accent: "#7fd3e8", "accent-strong": "#7fd3e8", "on-accent": "#0a1a20", "accent-soft": "#173845", "on-accent-soft": "#bde9f4",
      border: "#24363f", field: "#1a2a33", "field-border": "#4a6470", "timer-progress": "#2a93b0", "accent-2": "#b4c6ff",
    },
  },
];

export const MODES: { id: ThemeMode; label: string }[] = [
  { id: "auto", label: "Jak w telefonie" },
  { id: "light", label: "Jasny" },
  { id: "dark", label: "Ciemny" },
];

export const FX: { id: Fx; label: string }[] = [
  { id: "off", label: "Bez" },
  { id: "subtle", label: "Subtelne" },
  { id: "bold", label: "Na bogato" },
];

export type ThemeChoice = { theme: ThemeId; mode: ThemeMode; fx: Fx };
export const DEFAULT_THEME: ThemeChoice = { theme: "klasyczny", mode: "auto", fx: "subtle" };
const KEY = "ui-theme";

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function parseTheme(raw: string | null): ThemeChoice {
  if (!raw) return { ...DEFAULT_THEME };
  try {
    const saved = JSON.parse(raw) as Partial<ThemeChoice>;
    return {
      theme: THEMES.some((t) => t.id === saved.theme) ? (saved.theme as ThemeId) : DEFAULT_THEME.theme,
      mode: MODES.some((m) => m.id === saved.mode) ? (saved.mode as ThemeMode) : DEFAULT_THEME.mode,
      fx: FX.some((f) => f.id === saved.fx) ? (saved.fx as Fx) : DEFAULT_THEME.fx,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function loadTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // tryb prywatny - działa do zamknięcia aplikacji
  }
}

export function resolveScheme(mode: ThemeMode, systemDark: boolean): Scheme {
  return mode === "auto" ? (systemDark ? "dark" : "light") : mode;
}

// Zmienne CSS dla wybranego motywu i trybu, np. { "--bg": "#fbf6ee", ... }
export function themeVars(id: ThemeId, scheme: Scheme): Record<string, string> {
  const theme = themeById(id);
  const p = theme[scheme];
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) vars[`--${k}`] = v;
  // Minutnik: odwrócone kolory (ciemna pastylka na jasnym ekranie i odwrotnie) - widać kątem oka
  vars["--timer-bg"] = p.text;
  vars["--timer-text"] = p.bg;
  [vars["--shadow-1"], vars["--shadow-2"]] = SHADOW[scheme];
  return vars;
}

const media = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null);
let current: ThemeChoice = { ...DEFAULT_THEME };
let listening = false;

// Ustawia motyw na <html>: zmienne kolorów, data-scheme (dla reguł "po ciemku" w styles.css),
// color-scheme (pola formularzy, paski przewijania) i kolor paska w przeglądarce.
export function applyTheme(choice: ThemeChoice) {
  current = choice;
  const root = document.documentElement;
  const scheme = resolveScheme(choice.mode, media()?.matches ?? false);
  for (const [k, v] of Object.entries(themeVars(choice.theme, scheme))) root.style.setProperty(k, v);
  root.dataset.theme = choice.theme;
  root.dataset.scheme = scheme;
  root.dataset.fx = choice.fx;
  root.style.colorScheme = scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeById(choice.theme)[scheme].bg);
  if (!listening) {
    listening = true;
    media()?.addEventListener("change", () => applyTheme(current));
  }
}
