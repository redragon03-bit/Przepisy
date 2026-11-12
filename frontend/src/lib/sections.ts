// Sekcje w składnikach i krokach (np. "Omlet", "Krem do omleta").
// Serwer zapisuje sekcję przy każdym składniku/kroku; formularz edycji pokazuje je
// jako osobne wiersze-nagłówki, które można przeciągać razem ze składnikami.

export interface WithSection {
  section?: string;
}

// Wiersz w formularzu: nagłówek sekcji albo składnik/krok
export type Row<T> = { heading: string } | { item: T };

export const isHeading = <T>(row: Row<T>): row is { heading: string } => "heading" in row;

// Lista z serwera -> wiersze z nagłówkami tam, gdzie zmienia się sekcja
export function toRows<T extends WithSection>(items: T[]): Row<T>[] {
  const rows: Row<T>[] = [];
  let current = "";
  for (const item of items) {
    const section = (item.section ?? "").trim();
    if (section !== current) rows.push({ heading: section });
    current = section;
    rows.push({ item });
  }
  return rows;
}

// Wiersze -> lista dla serwera; każdy składnik dostaje sekcję z nagłówka nad nim
// (pusty nagłówek = dalej bez sekcji). Nagłówek bez niczego pod spodem znika.
export function fromRows<T extends WithSection>(rows: Row<T>[]): T[] {
  let current = "";
  const items: T[] = [];
  for (const row of rows) {
    if (isHeading(row)) current = row.heading.trim();
    else items.push({ ...row.item, section: current });
  }
  return items;
}

export interface Group<T> {
  section: string;
  // Pozycja w całej liście (numer kroku, odhaczanie)
  items: { item: T; index: number }[];
}

// Do wyświetlania: kolejne składniki/kroki tej samej sekcji razem
export function groupBySection<T extends WithSection>(items: T[]): Group<T>[] {
  const groups: Group<T>[] = [];
  items.forEach((item, index) => {
    const section = (item.section ?? "").trim();
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push({ item, index });
    else groups.push({ section, items: [{ item, index }] });
  });
  return groups;
}

// Propozycja AI (nowa kolejność + sekcja na każdej pozycji) -> lista z sekcjami
export function applyOrder<T extends WithSection>(items: T[], order: number[], sections: string[]): T[] {
  if (order.length !== items.length) return items;
  return order.map((from, i) => ({ ...items[from], section: sections[i] ?? "" }));
}
