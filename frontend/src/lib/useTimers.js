import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { beep, unlockSound } from "./timers";
// Minutniki są wspólne dla całej aplikacji i zapisane w pamięci telefonu: działają dalej
// po przejściu do innego ekranu, a po powrocie do aplikacji (iPhone usypia ją w tle)
// od razu widać i słychać, że czas minął.
const STORAGE_KEY = "timers";
function loadTimers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    }
    catch {
        return [];
    }
}
const TimersContext = createContext(null);
export function useTimers() {
    const timers = useContext(TimersContext);
    if (!timers)
        throw new Error("useTimers działa tylko wewnątrz TimersProvider");
    return timers;
}
export function TimersProvider({ children }) {
    const [timers, setTimers] = useState(loadTimers);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
        }
        catch {
            // tryb prywatny - minutniki działają, tylko bez zapamiętania
        }
    }, [timers]);
    const running = timers.some((t) => !t.done);
    useEffect(() => {
        if (!running)
            return;
        const check = () => {
            const current = Date.now();
            setNow(current);
            setTimers((list) => list.map((t) => {
                if (!t.done && t.endsAt <= current) {
                    beep();
                    return { ...t, done: true };
                }
                return t;
            }));
        };
        const tick = setInterval(check, 1000);
        // Po powrocie do aplikacji sprawdzamy od razu, nie czekając na kolejną sekundę
        const onVisible = () => document.visibilityState === "visible" && check();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(tick);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [running]);
    const start = (label, seconds, recipeId) => {
        unlockSound();
        const id = Date.now();
        setNow(id);
        setTimers((list) => [...list, { id, label, endsAt: id + seconds * 1000, done: false, recipeId, total: seconds }]);
        // Serwer przypomni przez Home Assistant, nawet gdy telefon ma zgaszony ekran (jeśli to ustawiono)
        api.startTimer(id, label, seconds).catch(() => { });
    };
    const remove = (id) => {
        setTimers((list) => list.filter((t) => t.id !== id));
        api.cancelTimer(id).catch(() => { });
    };
    const extend = (id, seconds) => {
        const current = Date.now();
        setNow(current);
        const timer = timers.find((t) => t.id === id);
        if (!timer)
            return;
        const endsAt = Math.max(timer.endsAt, current) + seconds * 1000;
        setTimers((list) => list.map((t) => (t.id === id ? { ...t, endsAt, done: false, total: (t.total ?? 0) + seconds } : t)));
        // Przypomnienie z HA: odwołujemy stare i ustawiamy nowe na pozostały czas
        api
            .cancelTimer(id)
            .then(() => api.startTimer(id, timer.label, Math.round((endsAt - current) / 1000)))
            .catch(() => { });
    };
    return _jsx(TimersContext.Provider, { value: { timers, now, start, remove, extend }, children: children });
}
// "Nie wygaszaj ekranu" (Wake Lock). Zwraca false, gdy przeglądarka tego nie obsługuje.
export function useWakeLock(enabled, onFail) {
    useEffect(() => {
        if (!enabled || !("wakeLock" in navigator))
            return;
        let lock = null;
        let cancelled = false;
        const request = () => navigator.wakeLock
            .request("screen")
            .then((l) => {
            if (cancelled)
                l.release();
            else
                lock = l;
        })
            .catch(() => onFail?.());
        request();
        // iPhone zwalnia blokadę po przełączeniu aplikacji - po powrocie prosimy ponownie
        const onVisible = () => document.visibilityState === "visible" && request();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
            lock?.release();
        };
    }, [enabled]);
}
