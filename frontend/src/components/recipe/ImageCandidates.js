import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { api } from "../../api";
import { useToast } from "../../lib/toast";
// Zdjęcia z internetu do wyboru - stuknięcie ustawia zdjęcie przepisu
export default function ImageCandidates({ recipe, urls, onPicked, onClose }) {
    const { run } = useToast();
    const pick = async (url) => {
        const saved = await run(() => api.setImageFromUrl(recipe.id, url));
        if (saved)
            onPicked(saved);
    };
    return (_jsxs("section", { className: "box", children: [_jsx("p", { className: "small muted", children: "Stuknij zdj\u0119cie, kt\u00F3re pasuje:" }), _jsx("div", { className: "candidates", children: urls.map((url) => (_jsx("button", { type: "button", onClick: () => pick(url), children: _jsx("img", { src: url, alt: "", loading: "lazy", referrerPolicy: "no-referrer" }) }, url))) }), _jsx("button", { type: "button", className: "link small", onClick: onClose, children: "\u017Badne nie pasuje" })] }));
}
