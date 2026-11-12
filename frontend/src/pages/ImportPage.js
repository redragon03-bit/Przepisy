import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import AutoTextarea from "../components/AutoTextarea";
const STATUS_LABEL = {
    pending: "⏳ w kolejce",
    running: "⏳ czytam przepis…",
    done: "✅ gotowe",
    failed: "❌ nie udało się",
    duplicate: "♻️ już masz ten przepis",
};
// Polska odmiana: 2-4 przepisy, 5-21 przepisów, 22-24 przepisy...
function recipesWord(n) {
    const last = n % 10;
    const lastTwo = n % 100;
    return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "przepisy" : "przepisów";
}
function findUrl(text) {
    return text.match(/https?:\/\/\S+/)?.[0] ?? "";
}
// Sam link (ewentualnie z krótkim podpisem, jak przy udostępnianiu z TikToka) = import z linku;
// dłuższy tekst = przepis wklejony jako tekst (np. z Messengera)
function isJustLink(text) {
    const url = findUrl(text);
    return !!url && text.replace(url, "").trim().length < 80;
}
const JOB_ICON = { url: "", image: "📷 ", text: "📝 " };
// Dodawanie przepisów: z linku (strona albo film z TikToka/YouTube/Instagrama),
// z wklejonego tekstu albo ze zdjęć/screenów.
// Import trwa kilkanaście sekund, więc działa w tle - lista poniżej pokazuje postęp.
export default function ImportPage({ aiEnabled }) {
    const [params, setParams] = useSearchParams();
    const [url, setUrl] = useState("");
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const fileInput = useRef(null);
    const refresh = () => api.listImports().then(setJobs);
    const startUrlImport = async (link, force = false) => {
        setError("");
        setBusy(true);
        try {
            if (isJustLink(link) || force)
                await api.importUrl(findUrl(link) || link.trim(), force);
            else
                await api.importText(link.trim());
            setUrl("");
            await refresh();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    // Link przekazany w adresie strony (menu "Udostępnij" na Androidzie albo Skrót iOS):
    // /dodaj?url=https://... -> od razu importujemy
    useEffect(() => {
        // Udostępniony tekst bez linku (np. przepis z notatek) importujemy jako tekst
        const shared = params.get("url") || params.get("text") || "";
        if (shared) {
            setParams({}, { replace: true });
            startUrlImport(shared);
        }
        else {
            refresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Dopóki coś się importuje, co 2 sekundy pytamy serwer o postęp
    const working = jobs.some((j) => j.status === "pending" || j.status === "running");
    useEffect(() => {
        if (!working)
            return;
        const timer = setInterval(refresh, 2000);
        return () => clearInterval(timer);
    }, [working]);
    const retry = async (id) => {
        setError("");
        try {
            await api.retryImport(id);
            await refresh();
        }
        catch (e) {
            setError(e.message);
        }
    };
    // Anulowanie (także zawieszonego importu) albo usunięcie wpisu z listy
    const remove = async (id) => {
        setError("");
        try {
            await api.deleteImport(id);
            setJobs((list) => list.filter((j) => j.id !== id));
        }
        catch (e) {
            setError(e.message);
        }
    };
    const paste = async () => {
        try {
            setUrl((await navigator.clipboard.readText()) || url);
        }
        catch {
            setError("Przeglądarka nie pozwoliła odczytać schowka - wklej link ręcznie.");
        }
    };
    const uploadImages = async (files) => {
        if (!files?.length)
            return;
        setError("");
        setBusy(true);
        try {
            await api.importImages(Array.from(files));
            await refresh();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
            if (fileInput.current)
                fileInput.current.value = "";
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "topbar", children: [_jsx("h1", { children: "Dodaj przepis" }), _jsx(Link, { to: "/nowy", className: "button small", children: "\u270D\uFE0F R\u0119cznie" })] }), !aiEnabled && (_jsx("p", { className: "box warning small", children: "AI jest wy\u0142\u0105czone (brak klucza API). Dzia\u0142a tylko import ze stron z danymi przepisu, bez t\u0142umaczenia. Zdj\u0119cia nie b\u0119d\u0105 odczytane." })), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Z linku albo tekstu" }), _jsx("p", { className: "muted small", children: "Link do strony albo filmu (TikTok, YouTube, Instagram) \u2013 albo ca\u0142y przepis wklejony jako tekst." }), _jsxs("div", { className: "row import-input", children: [_jsx(AutoTextarea, { value: url, onChange: (e) => setUrl(e.target.value), placeholder: "https://\u2026 albo tekst przepisu", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, rows: 1 }), "clipboard" in navigator && "readText" in navigator.clipboard && (_jsx("button", { type: "button", onClick: paste, children: "Wklej" }))] }), _jsx("button", { className: "primary wide", disabled: !url.trim() || busy || (!isJustLink(url) && !aiEnabled), onClick: () => startUrlImport(url), children: url.trim() && !isJustLink(url) ? "Importuj tekst" : "Importuj" })] }), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Ze zdj\u0119\u0107 lub screen\u00F3w" }), _jsx("p", { className: "muted small", children: "Mo\u017Cesz wybra\u0107 kilka zdj\u0119\u0107 jednego przepisu (np. sk\u0142adniki i kroki na osobnych screenach)." }), _jsx("button", { className: "primary wide", disabled: busy || !aiEnabled, onClick: () => fileInput.current?.click(), children: "Wybierz zdj\u0119cia" }), _jsx("input", { ref: fileInput, type: "file", accept: "image/*", multiple: true, hidden: true, onChange: (e) => uploadImages(e.target.files) })] }), error && _jsx("p", { className: "error", children: error }), jobs.length > 0 && (_jsxs("section", { children: [_jsx("h2", { children: "Ostatnie importy" }), _jsx("ul", { className: "jobs", children: jobs.map((job) => (_jsxs("li", { children: [_jsx("div", { className: "job-source", children: JOB_ICON[job.kind] + job.source }), _jsxs("div", { className: "small", children: [STATUS_LABEL[job.status], job.status === "done" && job.recipe_count > 1 && (_jsxs(_Fragment, { children: [" · ", _jsxs(Link, { to: "/", children: [job.recipe_count, " ", recipesWord(job.recipe_count), " - zobacz list\u0119"] })] })), job.status === "done" && job.recipe_count <= 1 && job.recipe_id && (_jsxs(_Fragment, { children: [" · ", _jsx(Link, { to: `/przepis/${job.recipe_id}`, children: "otw\u00F3rz przepis" })] }))] }), job.status === "duplicate" && job.recipe_id && (_jsxs("div", { className: "small", children: [_jsx(Link, { to: `/przepis/${job.recipe_id}`, children: "otw\u00F3rz" }), " · ", _jsx("button", { type: "button", className: "link", onClick: () => startUrlImport(job.source, true), children: "importuj mimo to" })] })), job.error && job.status !== "duplicate" && _jsx("div", { className: "error small", children: job.error }), (job.status === "pending" || job.status === "running") && (_jsx("button", { type: "button", className: "link small", onClick: () => remove(job.id), children: "anuluj" })), job.status === "failed" && (_jsxs("div", { className: "row", children: [_jsx("button", { className: "small-button", onClick: () => retry(job.id), children: "Pon\u00F3w" }), _jsx("button", { type: "button", className: "link small", onClick: () => remove(job.id), children: "usu\u0144 z listy" })] }))] }, job.id))) })] }))] }));
}
