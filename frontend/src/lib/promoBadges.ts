import { useRemembered } from "./remember";

// Czy pokazywać plakietki "🏷️ Biedronka 5,99 zł" przy składnikach i na liście zakupów.
// Przełącznik w Ustawieniach, zapamiętany w telefonie.
export function usePromoBadges(): [boolean, (on: boolean) => void] {
  return useRemembered<boolean>("promo-badges", true);
}
