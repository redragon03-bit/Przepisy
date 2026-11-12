import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../lib/toast";
import AutoTextarea from "../AutoTextarea";
export default function NotesSection({ recipe, onChange }) {
    const [editing, setEditing] = useState(null);
    const { run } = useToast();
    const save = async () => {
        const saved = await run(() => api.patchRecipe(recipe.id, { notes: editing ?? "" }));
        if (saved) {
            onChange(saved);
            setEditing(null);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("h2", { children: "Notatki" }), editing === null ? (_jsxs(_Fragment, { children: [recipe.notes ? _jsx("p", { className: "notes", children: recipe.notes }) : _jsx("p", { className: "muted small", children: "Brak notatek." }), recipe.can_edit && (_jsx("button", { type: "button", className: "link small", onClick: () => setEditing(recipe.notes), children: recipe.notes ? "Edytuj notatki" : "+ Dodaj notatkę, np. „następnym razem mniej cukru”" }))] })) : (_jsxs(_Fragment, { children: [_jsx(AutoTextarea, { rows: 3, value: editing, onChange: (e) => setEditing(e.target.value), autoFocus: true }), _jsx("button", { type: "button", className: "primary", onClick: save, children: "Zapisz notatk\u0119" })] }))] }));
}
