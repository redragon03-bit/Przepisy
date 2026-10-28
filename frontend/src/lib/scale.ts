// Przeliczanie porcji. Ta sama logika co scale_text w backend/app/services/shopping.py.

// Ułamki zapisane jednym znakiem: "½ łyżeczki"
const FRACTIONS: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8 };
// Ułamki, które pokazujemy zamiast liczb dziesiętnych ("1 ½ szklanki", a nie "1,5 szklanki")
const NICE_FRACTIONS: [number, string][] = [[1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]];

// Jedna ilość: "1 1/2", "1/2", "1½", "½", "1,5", "200"
const QUANTITY = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?)`;
// Ilość albo zakres: "2-3", "1/2–1"
const QUANTITY_RANGE = String.raw`${QUANTITY}(?:\s*[-–]\s*${QUANTITY})?`;
// Liczba nie może być doklejona do innej ("1/2" to jedna ilość, nie "1" i "2")
const NOT_GLUED = String.raw`(?<![\d\/.,½⅓⅔¼¾⅛])`;
// Po tych jednostkach ilość zostaje dziesiętna: "1,5 kg", nie "1 ½ kg"
const METRIC = /^\s*(kg|dag|g|ml|l)(?!\p{L})/u;

export function parseQuantity(text: string): number {
  const t = text.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = t.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const unicode = t.match(/^(\d*)([½⅓⅔¼¾⅛])$/);
  if (unicode) return Number(unicode[1] || 0) + FRACTIONS[unicode[2]];
  return Number(t.replace(",", "."));
}

export function formatAmount(amount: number): string {
  const rounded = amount >= 10 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return String(rounded).replace(".", ",");
}

// Ilość "kuchenna": 1.5 -> "1 ½", 0.25 -> "¼"; gdy nie pasuje żaden ładny ułamek - jak formatAmount
export function formatKitchenAmount(amount: number): string {
  if (amount >= 10) return formatAmount(amount);
  const whole = Math.floor(amount);
  const rest = amount - whole;
  if (rest < 0.01) return String(whole);
  const nice = NICE_FRACTIONS.find(([value]) => Math.abs(rest - value) < 0.02);
  if (!nice) return formatAmount(amount);
  return whole ? `${whole} ${nice[1]}` : nice[1];
}

// "4 porcje" -> 4, "na 6 osób" -> 6, "" -> null
export function parseServings(servings: string): number | null {
  const match = servings.match(/\d+/);
  return match ? Number(match[0]) : null;
}

// Przelicza ilość albo zakres ("2-3" -> "4-6"). `after` = tekst po ilości (do rozpoznania jednostki).
function scaleQuantity(quantity: string, factor: number, after: string): string {
  const format = METRIC.test(after) ? formatAmount : formatKitchenAmount;
  const range = quantity.match(new RegExp(String.raw`^(${QUANTITY})(\s*[-–]\s*)(${QUANTITY})$`));
  if (range) return format(parseQuantity(range[1]) * factor) + range[2] + format(parseQuantity(range[3]) * factor);
  return format(parseQuantity(quantity) * factor);
}

// Zmienia pierwszą ilość w linijce, jeśli to ta sama ilość co `amount`:
// ("200 g mąki", 200, 1.5) -> "300 g mąki". Inaczej dopisuje "(×1,5)".
// Bez `amount` (przepis wpisany ręcznie albo ze strony bez AI) zmieniamy ilość na początku linijki.
export function scaleText(text: string, amount: number | null, factor: number): string {
  if (factor === 1) return text;
  const match = new RegExp(NOT_GLUED + QUANTITY_RANGE).exec(text);
  if (!match) return amount === null ? text : `${text} (×${formatAmount(factor)})`;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  if (amount === null) {
    return before.trim() ? text : before + scaleQuantity(match[0], factor, after) + after;
  }
  const first = parseQuantity(match[0].split(/\s*[-–]\s*/)[0]);
  if (Math.abs(first - amount) < 0.01) return before + scaleQuantity(match[0], factor, after) + after;
  return `${text} (×${formatAmount(factor)})`;
}

// Ilości w treści kroku: "dodaj 200 g mąki i 2 łyżki cukru" -> przy 2× "dodaj 400 g mąki i 4 łyżki cukru".
// Zmieniamy tylko liczby z jednostką ilości - czasy ("30 min") i temperatury ("180°C") zostają.
const STEP_AMOUNT = new RegExp(
  String.raw`${NOT_GLUED}(${QUANTITY_RANGE})(\s*)(kg|dag|g|ml|l|łyż\p{L}*|szklan\p{L}*|szt\.?|ząb\p{L}*|opakowan\p{L}*)(?!\p{L})`,
  "giu",
);

export function scaleStep(text: string, factor: number): string {
  if (factor === 1) return text;
  return text.replace(STEP_AMOUNT, (_, quantity: string, space: string, unit: string) =>
    scaleQuantity(quantity, factor, space + unit) + space + unit,
  );
}
