import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
// Krótkie komunikaty u góry ekranu, wspólne dla całej aplikacji:
// - toast("Zapisane!") - zwykła informacja albo błąd,
// - undoable("Usunięto przepis", commit, undo) - zmiana wykona się za kilka sekund,
//   chyba że użytkownik stuknie "Cofnij" (zamiast pytania "Na pewno?").
const SHOW_MS = 3000;
const UNDO_MS = 5000;
const ToastContext = createContext(null);
export function useToast() {
    const toasts = useContext(ToastContext);
    if (!toasts)
        throw new Error("useToast działa tylko wewnątrz ToastProvider");
    return toasts;
}
export function ToastProvider({ children }) {
    const [message, setMessage] = useState(null);
    const timer = useRef(undefined);
    // Zmiana czekająca na wykonanie - wykonujemy ją od razu, gdy pojawi się kolejna
    const pending = useRef(null);
    const flush = useCallback(() => {
        const waiting = pending.current;
        pending.current = null;
        if (waiting)
            Promise.resolve(waiting.commit()).catch((e) => show({ id: Date.now(), text: e.message }, SHOW_MS));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const show = (next, ms) => {
        clearTimeout(timer.current);
        setMessage(next);
        timer.current = setTimeout(() => {
            if (pending.current?.id === next.id)
                flush();
            setMessage((current) => (current?.id === next.id ? null : current));
        }, ms);
    };
    // Wyjście z aplikacji (np. przełączenie na inną) nie może zgubić zmiany czekającej na "Cofnij"
    useEffect(() => {
        const onHide = () => document.visibilityState === "hidden" && flush();
        document.addEventListener("visibilitychange", onHide);
        return () => document.removeEventListener("visibilitychange", onHide);
    }, [flush]);
    const toasts = {
        toast: (text) => show({ id: Date.now(), text }, SHOW_MS),
        undoable: (text, commit, undo) => {
            flush();
            const id = Date.now();
            pending.current = { id, commit };
            show({
                id,
                text,
                undo: () => {
                    pending.current = null;
                    undo?.();
                    setMessage(null);
                },
            }, UNDO_MS);
        },
        run: async (action) => {
            try {
                return await action();
            }
            catch (e) {
                show({ id: Date.now(), text: e.message }, SHOW_MS);
                return undefined;
            }
        },
    };
    return (_jsxs(ToastContext.Provider, { value: toasts, children: [children, message && (_jsxs("div", { className: "toast", role: "status", children: [message.text, message.undo && (_jsx("button", { type: "button", className: "toast-undo", onClick: message.undo, children: "Cofnij" }))] }))] }));
}
