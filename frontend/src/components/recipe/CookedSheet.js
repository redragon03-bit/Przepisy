import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { api } from "../../api";
import { clearProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import AutoTextarea from "../AutoTextarea";
import Sheet from "../Sheet";
import Stars from "../Stars";
// "Ugotowane": wpis w dzienniku gotowania. Ocena, notatka ("za słone") i zdjęcie
// są opcjonalne - samo "Zapisz" działa jak dawny przycisk.
export default function CookedSheet({ recipe, onSaved, onClose }) {
    const [rating, setRating] = useState(0);
    const [note, setNote] = useState("");
    const [photo, setPhoto] = useState(null);
    const [saving, setSaving] = useState(false);
    const photoInput = useRef(null);
    const { toast, run } = useToast();
    const save = async () => {
        setSaving(true);
        const saved = await run(() => api.markCooked(recipe.id, { rating: rating || null, note, photo }));
        setSaving(false);
        if (saved) {
            clearProgress(recipe.id);
            onSaved(saved);
            toast("Zapisane! Smacznego 🙂");
        }
    };
    return (_jsx(Sheet, { title: "Jak wysz\u0142o?", onClose: onClose, list: true, children: _jsxs("div", { className: "cooked-form", children: [_jsx(Stars, { value: rating || null, onChange: setRating }), _jsx(AutoTextarea, { value: note, onChange: (e) => setNote(e.target.value), rows: 2, placeholder: "Notatka na nast\u0119pny raz (np. \u201Emniej soli\u201D)" }), _jsx("input", { ref: photoInput, type: "file", accept: "image/*", hidden: true, onChange: (e) => setPhoto(e.target.files?.[0] ?? null) }), _jsx("button", { type: "button", className: "sheet-row", onClick: () => photoInput.current?.click(), children: photo ? "✅ Zdjęcie dodane (zmień)" : "📷 Dodaj zdjęcie" }), _jsx("button", { type: "button", className: "primary wide", disabled: saving, onClick: save, children: saving ? "Zapisuję…" : "✅ Zapisz" })] }) }));
}
