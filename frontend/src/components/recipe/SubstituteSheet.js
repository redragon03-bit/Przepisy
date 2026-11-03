import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../../api";
import Sheet from "../Sheet";
// "Nie mam śmietany - czym zastąpić?" - odpowiedź AI dla tego konkretnego przepisu.
// Otwierane przytrzymaniem składnika na liście.
export default function SubstituteSheet({ recipeId, ingredient, onClose }) {
    const [answer, setAnswer] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        api
            .substitute(recipeId, ingredient)
            .then((r) => setAnswer(r.text))
            .catch((e) => setError(e.message));
    }, [recipeId, ingredient]);
    return (_jsx(Sheet, { title: `Czym zastąpić: ${ingredient}?`, onClose: onClose, list: true, children: error ? _jsx("p", { className: "error", children: error }) : answer ? (_jsx("div", { className: "substitute", children: answer.split("\n").filter((line) => line.trim()).map((line, i) => (_jsx("p", { children: line }, i))) })) : _jsx("p", { className: "muted", children: "Pytam AI\u2026" }) }));
}
