import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../api";
// Pole do wybierania składników: wpisujesz, dostajesz podpowiedzi z bazy,
// wybrane składniki pokazują się jako "chipsy" do usunięcia jednym tapnięciem.
export default function IngredientPicker({ value, onChange, placeholder, onChipClick, chipLabel }) {
    const [text, setText] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    useEffect(() => {
        const q = text.trim();
        if (!q) {
            setSuggestions([]);
            return;
        }
        // Czekamy chwilę po ostatnim znaku, żeby nie pytać serwera przy każdej literze
        const timer = setTimeout(() => {
            api.listIngredients(q).then((list) => setSuggestions(list.filter((i) => !value.includes(i.name))));
        }, 200);
        return () => clearTimeout(timer);
    }, [text, value]);
    const add = (name) => {
        const clean = name.trim().toLowerCase();
        if (clean && !value.includes(clean))
            onChange([...value, clean]);
        setText("");
        setSuggestions([]);
    };
    return (_jsxs("div", { className: "picker", children: [value.length > 0 && (_jsx("div", { className: "chips", children: value.map((name) => (_jsx("button", { type: "button", className: "chip", onClick: () => (onChipClick ? onChipClick(name) : onChange(value.filter((n) => n !== name))), children: chipLabel ? chipLabel(name) : `${name} ✕` }, name))) })), _jsx("form", { onSubmit: (e) => {
                    e.preventDefault();
                    add(text);
                }, children: _jsx("input", { value: text, onChange: (e) => setText(e.target.value), placeholder: placeholder ?? "Dodaj składnik…", autoCapitalize: "none", enterKeyHint: "done" }) }), suggestions.length > 0 && (_jsx("ul", { className: "suggestions", children: suggestions.slice(0, 8).map((s) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => add(s.name), children: [s.name, " ", _jsxs("span", { className: "muted", children: ["(", s.recipe_count, ")"] })] }) }, s.id))) }))] }));
}
