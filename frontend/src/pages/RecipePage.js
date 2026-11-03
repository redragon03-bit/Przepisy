import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, formatMinutes } from "../api";
import CookedSheet from "../components/recipe/CookedSheet";
import CookLogSheet from "../components/recipe/CookLogSheet";
import ImageCandidates from "../components/recipe/ImageCandidates";
import IngredientsSection from "../components/recipe/IngredientsSection";
import NotesSection from "../components/recipe/NotesSection";
import RecipeMenu from "../components/recipe/RecipeMenu";
import StepsSection from "../components/recipe/StepsSection";
import Stars from "../components/Stars";
import { useGoBack } from "../lib/navigation";
import { nutritionText } from "../lib/nutrition";
import { currentRandom, pickRandom } from "../lib/random";
import { rememberRecipe } from "../lib/recent";
import { cachedRecipe, cacheRecipe } from "../lib/recipeCache";
import { parseServings } from "../lib/scale";
import { useToast } from "../lib/toast";
import { useWakeLock } from "../lib/useTimers";
// Szczegóły przepisu. Składniki i kroki można "odhaczać" w trakcie gotowania,
// czasy w krokach uruchamiają minutniki, a porcje można przeliczyć.
// Rzadziej używane akcje są w menu "⋯" (RecipeMenu).
export default function RecipePage({ aiEnabled }) {
    const id = Number(useParams().id);
    const navigate = useNavigate();
    const goBack = useGoBack("/");
    const { toast, run } = useToast();
    // Przepis wylosowany kostką na liście - można losować dalej
    const random = useLocation().state?.random;
    // Przepis otwarty niedawno pokazujemy od razu z pamięci, świeży przychodzi w tle
    const [recipe, setRecipeState] = useState(() => cachedRecipe(id) ?? null);
    const [error, setError] = useState("");
    const [keepAwake, setKeepAwake] = useState(false);
    const [servings, setServings] = useState(() => parseServings(cachedRecipe(id)?.servings ?? ""));
    const [factor, setFactor] = useState(1);
    const [candidates, setCandidates] = useState(null);
    const [searching, setSearching] = useState(false);
    const [panel, setPanel] = useState(null);
    const setRecipe = (r) => {
        cacheRecipe(r);
        setRecipeState(r);
    };
    useEffect(() => {
        window.scrollTo(0, 0);
        const cached = cachedRecipe(id);
        setRecipeState(cached ?? null);
        setServings(parseServings(cached?.servings ?? ""));
        setFactor(1);
        setCandidates(null);
        setPanel(null);
        api
            .getRecipe(id)
            .then((r) => {
            setRecipe(r);
            if (!cached)
                setServings(parseServings(r.servings));
            rememberRecipe(r.id);
        })
            .catch((e) => {
            if (!cached)
                setError(e.message);
        });
    }, [id]);
    // "Nie wygaszaj ekranu" - przydatne, gdy telefon leży w kuchni
    useWakeLock(keepAwake, () => {
        setKeepAwake(false);
        toast("Telefon nie pozwolił utrzymać włączonego ekranu.");
    });
    if (error)
        return _jsx("p", { className: "error center", children: error });
    if (!recipe)
        return _jsx("p", { className: "muted center", children: "\u0141adowanie\u2026" });
    const baseServings = parseServings(recipe.servings);
    const scale = baseServings && servings ? servings / baseServings : factor;
    const searchImages = async () => {
        setSearching(true);
        setCandidates(null);
        const found = await run(() => api.imageCandidates(recipe.id));
        setSearching(false);
        if (found) {
            setCandidates(found);
            if (!found.length)
                toast("Nie znalazłem pasujących zdjęć.");
        }
    };
    const patch = async (data) => {
        const saved = await run(() => api.patchRecipe(recipe.id, data));
        if (saved)
            setRecipe(saved);
    };
    // Przepis główny i jego warianty (np. "wege") - przełączanie jednym stuknięciem
    const family = recipe.variant_of
        ? [{ ...recipe.variant_of, variant_name: "oryginał" }, { id: recipe.id, title: recipe.title, variant_name: recipe.variant_name }, ...recipe.variants]
        : recipe.variants.length
            ? [{ id: recipe.id, title: recipe.title, variant_name: "oryginał" }, ...recipe.variants]
            : [];
    const times = [
        recipe.prep_minutes && `przygotowanie ${formatMinutes(recipe.prep_minutes)}`,
        recipe.cook_minutes && `gotowanie ${formatMinutes(recipe.cook_minutes)}`,
        recipe.total_minutes && `razem ${formatMinutes(recipe.total_minutes)}`,
    ].filter(Boolean);
    return (_jsxs("article", { className: "recipe", children: [_jsxs("header", { className: "topbar", children: [_jsx("button", { type: "button", className: "link", onClick: goBack, children: "\u2039 Wr\u00F3\u0107" }), random && random.pool.length > 1 && (_jsx("button", { type: "button", className: "button small", onClick: () => {
                            const next = pickRandom(random);
                            navigate(`/przepis/${currentRandom(next)}`, { replace: true, state: { random: next } });
                        }, children: "\uD83C\uDFB2 Inny" })), _jsx("span", { className: "grow" }), _jsx("button", { type: "button", className: "link favorite", "aria-label": recipe.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych", onClick: () => patch({ favorite: !recipe.favorite }), children: recipe.favorite ? "❤️" : "🤍" }), _jsx(RecipeMenu, { recipe: recipe, scale: scale, servings: baseServings && servings ? `${servings} porcje` : recipe.servings, onChange: setRecipe, onSearchImages: searchImages, aiEnabled: aiEnabled })] }), recipe.image_url ? (_jsx("img", { className: "hero", src: recipe.image_url, alt: "" })) : (_jsx("button", { type: "button", className: "hero-placeholder", disabled: searching, onClick: searchImages, children: searching ? "Szukam zdjęć w internecie…" : "🔍 Znajdź zdjęcie w internecie" })), searching && recipe.image_url && _jsx("p", { className: "muted small", children: "Szukam zdj\u0119\u0107 w internecie\u2026" }), candidates && candidates.length > 0 && (_jsx(ImageCandidates, { recipe: recipe, urls: candidates, onPicked: (r) => {
                    setRecipe(r);
                    setCandidates(null);
                }, onClose: () => setCandidates(null) })), _jsx("h1", { children: recipe.title }), family.length > 0 && (_jsx("div", { className: "chips variants", children: family.map((v) => v.id === recipe.id ? (_jsx("span", { className: "chip selected", children: v.variant_name }, v.id)) : (_jsx(Link, { to: `/przepis/${v.id}`, replace: true, className: "chip", children: v.variant_name }, v.id))) })), recipe.categories.length > 0 && (_jsx("div", { className: "chips", children: recipe.categories.map((c) => (_jsx("span", { className: "chip", children: c }, c))) })), _jsx(Stars, { value: recipe.rating, onChange: (rating) => patch({ rating }) }), recipe.description && _jsx("p", { children: recipe.description }), _jsxs("p", { className: "muted small", children: [[recipe.servings, ...times].filter(Boolean).join(" · "), recipe.source_url && (_jsxs(_Fragment, { children: [" · ", _jsx("a", { href: recipe.source_url, target: "_blank", rel: "noreferrer", children: "\u017Ar\u00F3d\u0142o" })] }))] }), recipe.kcal !== null && (_jsxs("p", { className: "small", children: [nutritionText(recipe), " ", _jsx("span", { className: "muted", children: "na porcj\u0119 (szacunek AI)" })] })), recipe.cooked_count > 0 && (_jsxs("button", { type: "button", className: "link muted small cooked-line", onClick: () => setPanel("log"), children: ["Ugotowane ", recipe.cooked_count, "\u00D7 \u00B7 ostatnio ", new Date(recipe.last_cooked_at).toLocaleDateString("pl-PL"), recipe.cook_log.length > 0 && " · dziennik ›"] })), "wakeLock" in navigator && (_jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: keepAwake, onChange: (e) => setKeepAwake(e.target.checked) }), "Nie wygaszaj ekranu"] })), _jsx(IngredientsSection, { recipe: recipe, baseServings: baseServings, servings: servings, setServings: setServings, factor: factor, setFactor: setFactor, scale: scale, aiEnabled: aiEnabled }), _jsx(StepsSection, { recipe: recipe, scale: scale }), _jsx(NotesSection, { recipe: recipe, onChange: setRecipe }), _jsx("div", { className: "actions", children: _jsx("button", { type: "button", className: "primary", onClick: () => setPanel("cooked"), children: "\u2705 Ugotowane" }) }), panel === "cooked" && (_jsx(CookedSheet, { recipe: recipe, onClose: () => setPanel(null), onSaved: (r) => {
                    setRecipe(r);
                    setPanel(null);
                } })), panel === "log" && _jsx(CookLogSheet, { recipe: recipe, onChange: setRecipe, onClose: () => setPanel(null) })] }));
}
