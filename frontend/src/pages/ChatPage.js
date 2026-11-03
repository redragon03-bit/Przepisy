import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import NewRecipeCard from "../components/NewRecipeCard";
import RecipeCard from "../components/RecipeCard";
// Czat z asystentem: "mam ochotę na...", "coś bez ryżu". Asystent poleca przepisy z bazy,
// a gdy nic nie pasuje - wymyśla nowy, który można zapisać.
// Rozmowę trzymamy w pamięci karty przeglądarki, żeby przejście do przepisu jej nie kasowało.
const STORAGE_KEY = "chat-messages";
// Serwer odpowiada najpóźniej po ok. 50 s; dłużej nie czekamy, żeby "Myślę…" nie wisiało w nieskończoność
const TIMEOUT_MS = 60_000;
const SUGGESTIONS = [
    "Mam ochotę na coś słodkiego",
    "Szybki obiad do 30 minut",
    "Co zrobię z tego, co mam w domu?",
    "Coś lekkiego na kolację, bez mięsa",
];
function loadSaved() {
    try {
        return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    }
    catch {
        return [];
    }
}
export default function ChatPage({ aiEnabled }) {
    const [messages, setMessages] = useState(loadSaved);
    const [text, setText] = useState("");
    const [thinking, setThinking] = useState(false);
    const [error, setError] = useState("");
    const bottom = useRef(null);
    // Trwające zapytanie - "Nowa rozmowa" i wyjście z ekranu je przerywają
    const pending = useRef(null);
    useEffect(() => () => pending.current?.abort(), []);
    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        }
        catch {
            // brak dostępu do pamięci przeglądarki - rozmowa zniknie po wyjściu, trudno
        }
        bottom.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, thinking]);
    const ask = async (history) => {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, TIMEOUT_MS);
        setError("");
        setThinking(true);
        try {
            const reply = await api.chat(history, controller.signal);
            setMessages([...history, { role: "assistant", text: reply.text, recipe: reply.new_recipe, recipes: reply.recipes }]);
        }
        catch (e) {
            if (timedOut)
                setError("AI nie odpowiedziało na czas - spróbuj jeszcze raz.");
            else if (!controller.signal.aborted)
                setError(e.message);
        }
        finally {
            clearTimeout(timer);
            // Gdy w międzyczasie ruszyło nowe zapytanie, to ono decyduje o "Myślę…"
            if (pending.current === controller) {
                pending.current = null;
                setThinking(false);
            }
        }
    };
    const send = (question) => {
        if (!question.trim() || thinking)
            return;
        const history = [...messages, { role: "user", text: question.trim() }];
        setMessages(history);
        setText("");
        ask(history);
    };
    const newConversation = () => {
        pending.current?.abort();
        pending.current = null;
        setThinking(false);
        setError("");
        setMessages([]);
    };
    // Po błędzie ostatnia wiadomość użytkownika została bez odpowiedzi - wysyłamy ją jeszcze raz
    const canRetry = error && !thinking && messages[messages.length - 1]?.role === "user";
    if (!aiEnabled) {
        return (_jsxs(_Fragment, { children: [_jsx("header", { className: "topbar", children: _jsx("h1", { children: "Czat" }) }), _jsx("p", { className: "muted center", children: "Czat wymaga AI - dodaj klucz Gemini albo Anthropic w ustawieniach dodatku." })] }));
    }
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "topbar", children: [_jsx("h1", { children: "Czat" }), messages.length > 0 && (_jsx("button", { type: "button", className: "link", onClick: newConversation, children: "Nowa rozmowa" }))] }), messages.length === 0 && (_jsxs("section", { className: "box", children: [_jsx("p", { className: "small", children: "Napisz, na co masz ochot\u0119 albo czego nie chcesz. Najpierw poszukam w Twoich przepisach, a je\u015Bli nic nie pasuje, wymy\u015Bl\u0119 nowy. Bior\u0119 pod uwag\u0119 to, co masz w domu (spi\u017Carnia w \u201ECo ugotuj\u0119?\u201D)." }), _jsx("div", { className: "chips", children: SUGGESTIONS.map((s) => (_jsx("button", { type: "button", className: "chip", onClick: () => send(s), children: s }, s))) })] })), _jsxs("div", { className: "chat", children: [messages.map((m, i) => (_jsxs("div", { className: `bubble ${m.role}`, children: [_jsx("p", { children: m.text }), m.recipes && m.recipes.length > 0 && (_jsx("div", { className: "grid", children: m.recipes.map((r) => (_jsx(RecipeCard, { recipe: r }, r.id))) })), m.recipe && _jsx(NewRecipeCard, { recipe: m.recipe })] }, i))), thinking && _jsx("div", { className: "bubble assistant muted", children: "My\u015Bl\u0119\u2026" }), error && (_jsxs("p", { className: "error small", children: [error, " ", canRetry && (_jsx("button", { type: "button", className: "link", onClick: () => ask(messages), children: "Spr\u00F3buj ponownie" }))] })), _jsx("div", { ref: bottom })] }), _jsxs("form", { className: "chat-input", onSubmit: (e) => {
                    e.preventDefault();
                    send(text);
                }, children: [_jsx("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: "Na co masz ochot\u0119?", enterKeyHint: "send" }), _jsx("button", { className: "primary", disabled: thinking || !text.trim(), children: "Wy\u015Blij" })] })] }));
}
