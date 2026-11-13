import { useRemembered } from "./remember";

// Czy pokazywać plakietki "🏷️ Biedronka 5,99 zł" przy składnikach i na liście zakupów.
// Przełącznik w Ustawieniach, zapamiętany w telefonie.
export function usePromoBadges(): [boolean, (on: boolean) => void] {
  return useRemembered<boolean>("promo-badges", true);
}

// Sklepy odznaczone w Promocjach - ich ceny nie pojawiają się w Zakupach, przy składnikach ani w "Z promocji"
export function useHiddenPromoStores(): [Set<string>, (next: Set<string>) => void] {
  const [list, setList] = useRemembered<string[]>("promo-hidden-stores", []);
  return [new Set(list), (next) => setList([...next])];
}
