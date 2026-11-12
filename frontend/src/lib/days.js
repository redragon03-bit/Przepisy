import { isoDay } from "../api";
// Najbliższe dni do zaplanowania posiłku: "Dziś", "Jutro", "sobota 25 paź"
export function nextDays(count = 7) {
    return Array.from({ length: count }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const label = i === 0 ? "Dziś" : i === 1 ? "Jutro" : date.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "short" });
        return { day: isoDay(date), label };
    });
}
export function dayLabel(day) {
    return new Date(`${day}T12:00`).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
}
// Krótko, do przycisków: "pon. 27"
export function shortDayLabel(day) {
    return new Date(`${day}T12:00`).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric" }).replace(",", "");
}
