import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import AutoTextarea from "../components/AutoTextarea";
import { cachedRecipe, forgetRecipe } from "../lib/recipeCache";
import { useReorder } from "../lib/useReorder";
const EMPTY = {
    title: "",
    description: "",
    servings: "",
    prep_minutes: null,
    cook_minutes: null,
    total_minutes: null,
    source_url: "",
    notes: "",
    ingredients: [],
    steps: [],
    categories: [],
};
const emptyIngredient = () => ({ text: "", name: "", amount: null, unit: "", original_text: "" });
// Formularz dodawania (adres /nowy) i edycji (/przepis/:id/edytuj) przepisu.
export default function EditRecipePage() {
    const params = useParams();
    const id = params.id ? Number(params.id) : null;
    const navigate = useNavigate();
    const [form, setForm] = useState(id ? null : { ...EMPTY, ingredients: [emptyIngredient()], steps: [{ text: "", image: null }] });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [allCategories, setAllCategories] = useState([]);
    const [newCategory, setNewCategory] = useState("");
    // Formularz tuż po wczytaniu - żeby "Anuluj" pytał tylko wtedy, gdy coś zmieniono
    const initial = useRef(form ? JSON.stringify(form) : "");
    useEffect(() => {
        api.listCategories().then(setAllCategories, () => { });
    }, []);
    // Licznik prób wczytania - "Spróbuj ponownie" po błędzie zwiększa go i wczytuje jeszcze raz
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!id)
            return;
        let active = true;
        const toForm = (r) => ({
            title: r.title,
            description: r.description,
            servings: r.servings,
            prep_minutes: r.prep_minutes,
            cook_minutes: r.cook_minutes,
            total_minutes: r.total_minutes,
            source_url: r.source_url,
            notes: r.notes,
            ingredients: r.ingredients,
            steps: r.steps.map((s, i) => ({ text: s.text, image: r.step_images?.[i] ?? null })),
            categories: r.categories,
        });
        // Przepis zapamiętany w telefonie pokazujemy od razu (jak ekran przepisu), świeży z serwera podmieniamy w tle
        const cached = cachedRecipe(id);
        let shown = cached ? JSON.stringify(toForm(cached)) : "";
        if (cached) {
            initial.current = shown;
            setForm(toForm(cached));
        }
        setError("");
        api
            .getRecipe(id)
            .then((r) => {
            if (!active)
                return;
            const loaded = toForm(r);
            // Nie nadpisujemy tego, co ktoś zdążył już zmienić w formularzu
            setForm((current) => {
                if (current && JSON.stringify(current) !== shown)
                    return current;
                shown = JSON.stringify(loaded);
                initial.current = shown;
                return loaded;
            });
        })
            .catch((e) => {
            // Wcześniej błąd (np. "Load failed" po powrocie z galerii zdjęć) zostawiał wieczne "Ładowanie…"
            if (active && !cached)
                setError(e.message || "Nie udało się wczytać przepisu.");
        });
        return () => {
            active = false;
        };
    }, [id, attempt]);
    const ingredientOrder = useReorder(form?.ingredients ?? [], (ingredients) => form && setForm({ ...form, ingredients }));
    const stepOrder = useReorder(form?.steps ?? [], (steps) => form && setForm({ ...form, steps }));
    if (!form)
        return error ? (_jsxs("div", { className: "center", children: [_jsx("p", { className: "error", children: error }), _jsx("button", { type: "button", onClick: () => setAttempt(attempt + 1), children: "Spr\u00F3buj ponownie" })] })) : (_jsx("p", { className: "muted center", children: "\u0141adowanie\u2026" }));
    const cancel = () => {
        if (JSON.stringify(form) !== initial.current && !window.confirm("Odrzucić zmiany w przepisie?"))
            return;
        navigate(-1);
    };
    // Wklejenie kilku linijek (np. listy z kartki albo strony) robi z nich osobne składniki
    const pasteIngredients = (index, e) => {
        const lines = e.clipboardData
            .getData("text")
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*[-•*–]\s*/, "").trim())
            .filter(Boolean);
        if (lines.length < 2)
            return;
        e.preventDefault();
        const pasted = lines.map((text, i) => (i === 0 ? { ...form.ingredients[index], text } : { ...emptyIngredient(), text }));
        set("ingredients", [...form.ingredients.slice(0, index), ...pasted, ...form.ingredients.slice(index + 1)]);
    };
    const set = (key, value) => setForm({ ...form, [key]: value });
    const minutes = (value) => (value ? Number(value) : null);
    const setIngredient = (index, patch) => set("ingredients", form.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
    const setStep = (index, text) => set("steps", form.steps.map((s, i) => (i === index ? { ...s, text } : s)));
    const toggleCategory = (name) => set("categories", form.categories.includes(name) ? form.categories.filter((c) => c !== name) : [...form.categories, name]);
    const addCategory = () => {
        const name = newCategory.trim();
        if (name && !form.categories.includes(name))
            set("categories", [...form.categories, name]);
        setNewCategory("");
    };
    // Kategorie z bazy + nowe, wpisane w tym formularzu
    const categoryOptions = [...new Set([...allCategories.map((c) => c.name), ...form.categories])];
    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const saved = id ? await api.updateRecipe(id, form) : await api.createRecipe(form);
            forgetRecipe(saved.id);
            navigate(`/przepis/${saved.id}`, { replace: true });
        }
        catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };
    return (_jsxs("form", { className: "edit", onSubmit: save, children: [_jsxs("header", { className: "topbar", children: [_jsx("button", { type: "button", className: "link", onClick: cancel, children: "Anuluj" }), _jsx("h1", { children: id ? "Edycja" : "Nowy przepis" }), _jsx("button", { className: "primary small", disabled: saving, children: "Zapisz" })] }), error && _jsx("p", { className: "error", children: error }), _jsxs("label", { children: ["Nazwa", _jsx("input", { required: true, value: form.title, onChange: (e) => set("title", e.target.value) })] }), _jsxs("label", { children: ["Opis", _jsx(AutoTextarea, { rows: 2, value: form.description, onChange: (e) => set("description", e.target.value) })] }), _jsxs("div", { className: "row", children: [_jsxs("label", { children: ["Porcje", _jsx("input", { value: form.servings, onChange: (e) => set("servings", e.target.value), placeholder: "np. 4 porcje" })] }), _jsxs("label", { children: ["Czas razem (min)", _jsx("input", { type: "number", inputMode: "numeric", value: form.total_minutes ?? "", onChange: (e) => set("total_minutes", minutes(e.target.value)) })] })] }), _jsx("h2", { children: "Kategorie" }), _jsx("div", { className: "chips", children: categoryOptions.map((name) => (_jsx("button", { type: "button", className: `chip ${form.categories.includes(name) ? "selected" : ""}`, onClick: () => toggleCategory(name), children: name }, name))) }), _jsxs("div", { className: "row", children: [_jsx("input", { value: newCategory, onChange: (e) => setNewCategory(e.target.value), onKeyDown: (e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addCategory();
                            }
                        }, placeholder: "Nowa kategoria" }), _jsx("button", { type: "button", onClick: addCategory, disabled: !newCategory.trim(), children: "Dodaj" })] }), _jsx("h2", { children: "Sk\u0142adniki" }), _jsx("p", { className: "muted small", children: "Druga kolumna to nazwa do wyszukiwania, np. \u201Em\u0105ka pszenna\u201D dla \u201E200 g m\u0105ki pszennej\u201D. Kolejno\u015B\u0107 zmienisz, przeci\u0105gaj\u0105c za \u283F. Wklejenie kilku linijek doda kilka sk\u0142adnik\u00F3w." }), form.ingredients.map((ing, i) => (_jsxs("div", { ref: ingredientOrder.rowRef(i), className: `row ingredient-row ${ingredientOrder.dragging === i ? "dragging" : ""}`, children: [_jsx("span", { className: "drag-handle", "aria-label": "Przeci\u0105gnij, \u017Ceby zmieni\u0107 kolejno\u015B\u0107", ...ingredientOrder.handle(i), children: "\u283F" }), _jsx(AutoTextarea, { singleLine: true, value: ing.text, onChange: (e) => setIngredient(i, { text: e.target.value.replace(/\n/g, " ") }), onPaste: (e) => pasteIngredients(i, e), placeholder: "200 g m\u0105ki pszennej" }), _jsx(AutoTextarea, { singleLine: true, value: ing.name, onChange: (e) => setIngredient(i, { name: e.target.value.replace(/\n/g, " ") }), placeholder: "m\u0105ka pszenna", autoCapitalize: "none" }), _jsx("button", { type: "button", className: "icon", onClick: () => set("ingredients", form.ingredients.filter((_, j) => j !== i)), "aria-label": "Usu\u0144", children: "\u2715" })] }, i))), _jsx("button", { type: "button", onClick: () => set("ingredients", [...form.ingredients, emptyIngredient()]), children: "+ Sk\u0142adnik" }), _jsx("h2", { children: "Kroki" }), _jsx("p", { className: "muted small", children: "Kolejno\u015B\u0107 krok\u00F3w zmienisz, przeci\u0105gaj\u0105c za numer." }), form.steps.map((step, i) => (_jsxs("div", { ref: stepOrder.rowRef(i), className: `row step-row ${stepOrder.dragging === i ? "dragging" : ""}`, children: [_jsx("span", { className: "step-number drag-handle", "aria-label": "Przeci\u0105gnij, \u017Ceby zmieni\u0107 kolejno\u015B\u0107", ...stepOrder.handle(i), children: i + 1 }), _jsx(AutoTextarea, { rows: 2, value: step.text, onChange: (e) => setStep(i, e.target.value) }), _jsx("button", { type: "button", className: "icon", onClick: () => set("steps", form.steps.filter((_, j) => j !== i)), "aria-label": "Usu\u0144", children: "\u2715" })] }, i))), _jsx("button", { type: "button", onClick: () => set("steps", [...form.steps, { text: "", image: null }]), children: "+ Krok" }), _jsx("h2", { children: "Pozosta\u0142e" }), _jsxs("label", { children: ["Link do \u017Ar\u00F3d\u0142a", _jsx("input", { value: form.source_url, onChange: (e) => set("source_url", e.target.value), autoCapitalize: "none", autoCorrect: "off", spellCheck: false })] }), _jsxs("label", { children: ["Notatki", _jsx(AutoTextarea, { rows: 2, value: form.notes, onChange: (e) => set("notes", e.target.value), placeholder: "np. nast\u0119pnym razem mniej cukru" })] })] }));
}
