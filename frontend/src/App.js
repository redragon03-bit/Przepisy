import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { api, savedAuth, saveAuth, setUnauthorizedHandler } from "./api";
import BackToTop from "./components/BackToTop";
import Sheet from "./components/Sheet";
import TimersBar from "./components/TimersBar";
import { scrollToTop } from "./lib/navigation";
import { prefetchPlanned } from "./lib/recipeCache";
import { deviceLabel, loadScales } from "./lib/uiScale";
import { SWIPE_BACK_DISTANCE, useEdgeSwipeBack } from "./lib/useEdgeSwipeBack";
import ChatPage from "./pages/ChatPage";
import CookingModePage from "./pages/CookingModePage";
import CookPage from "./pages/CookPage";
import EditRecipePage from "./pages/EditRecipePage";
import HelpPage from "./pages/HelpPage";
import ImportPage from "./pages/ImportPage";
import LoginPage from "./pages/LoginPage";
import PlanPage from "./pages/PlanPage";
import PromotionsPage from "./pages/PromotionsPage";
import RecipePage from "./pages/RecipePage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";
import ShoppingPage from "./pages/ShoppingPage";
const TABS = [
    { to: "/", icon: "📖", label: "Przepisy" },
    { to: "/dodaj", icon: "➕", label: "Dodaj" },
    { to: "/czat", icon: "💬", label: "Czat" },
    { to: "/zakupy", icon: "🛒", label: "Zakupy" },
];
// Rzadziej używane strony chowamy pod zakładką "Więcej", żeby pasek był czytelny.
const MORE = [
    { to: "/co-ugotowac", icon: "🥕", label: "Co ugotuję?" },
    { to: "/plan", icon: "📅", label: "Plan" },
    { to: "/promocje", icon: "🏷️", label: "Promocje" },
    { to: "/ustawienia", icon: "⚙️", label: "Ustawienia" },
    { to: "/pomoc", icon: "💡", label: "Jak używać" },
];
export default function App() {
    const [auth, setAuth] = useState(null);
    const location = useLocation();
    const navigationType = useNavigationType();
    const [moreOpen, setMoreOpen] = useState(false);
    const inMore = MORE.some((m) => m.to === location.pathname);
    const swipe = useEdgeSwipeBack();
    useEffect(() => setMoreOpen(false), [location.key]);
    // Nowo otwarta strona zaczyna od góry (lista przepisów sama wraca w zapamiętane miejsce).
    useLayoutEffect(() => {
        if (navigationType !== "POP" && location.pathname !== "/")
            window.scrollTo(0, 0);
    }, [location.key]);
    // Stuknięcie w zakładkę, na której już jesteśmy, przewija ją na samą górę (jak w iOS).
    const onTabClick = (e, to) => {
        if (location.pathname !== to)
            return;
        e.preventDefault();
        scrollToTop();
    };
    const [offline, setOffline] = useState(false);
    // Raz po otwarciu aplikacji: ustawienia wyglądu i ekran do logu dodatku (wiadomo, co jest ustawione)
    const authenticated = !!auth?.authenticated;
    useEffect(() => {
        if (authenticated)
            api.saveAppearance(loadScales(), deviceLabel()).catch(() => undefined);
    }, [authenticated]);
    const refreshAuth = () => api.authStatus().then((status) => {
        setAuth(status);
        saveAuth(status);
    });
    useEffect(() => {
        setUnauthorizedHandler(() => setAuth((a) => (a ? { ...a, authenticated: false } : a)));
        // Bez internetu (np. w sklepie) otwieramy aplikację z ostatnio zapamiętanym stanem -
        // lista zakupów działa wtedy z pamięci telefonu
        refreshAuth().then(
        // Przepisy z planu na tydzień trafiają do pamięci telefonu - do gotowania bez internetu
        () => prefetchPlanned().catch(() => { }), () => {
            const saved = savedAuth();
            if (saved)
                setAuth(saved);
            setOffline(true);
        });
    }, []);
    if (!auth)
        return _jsx("div", { className: "center muted", children: offline ? "Brak połączenia z serwerem." : "Ładowanie…" });
    if (!auth.authenticated)
        return _jsx(LoginPage, { onLogin: refreshAuth });
    return (_jsxs(_Fragment, { children: [_jsx("main", { className: "page", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(RecipesPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/przepis/:id", element: _jsx(RecipePage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/przepis/:id/edytuj", element: _jsx(EditRecipePage, {}) }), _jsx(Route, { path: "/przepis/:id/gotuj", element: _jsx(CookingModePage, {}) }), _jsx(Route, { path: "/czat", element: _jsx(ChatPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/nowy", element: _jsx(EditRecipePage, {}) }), _jsx(Route, { path: "/dodaj", element: _jsx(ImportPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/co-ugotowac", element: _jsx(CookPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/promocje", element: _jsx(PromotionsPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/plan", element: _jsx(PlanPage, { aiEnabled: auth.ai_enabled }) }), _jsx(Route, { path: "/zakupy", element: _jsx(ShoppingPage, { haEnabled: auth.ha_enabled }) }), _jsx(Route, { path: "/ustawienia", element: _jsx(SettingsPage, { onLogout: refreshAuth, auth: auth }) }), _jsx(Route, { path: "/pomoc", element: _jsx(HelpPage, {}) })] }) }), _jsx(BackToTop, {}), _jsx(TimersBar, {}), swipe > 0 && (_jsx("div", { className: `swipe-back ${swipe >= SWIPE_BACK_DISTANCE ? "ready" : ""}`, style: { transform: `translateX(${swipe - 40}px)` }, children: "\u2039" })), _jsxs("nav", { className: "tabbar", children: [TABS.map((tab) => (_jsxs(NavLink, { to: tab.to, end: tab.to === "/", onClick: (e) => onTabClick(e, tab.to), children: [_jsx("span", { children: tab.icon }), tab.label] }, tab.to))), _jsxs("button", { type: "button", className: inMore || moreOpen ? "active" : "", onClick: () => setMoreOpen(!moreOpen), children: [_jsx("span", { children: "\u22EF" }), "Wi\u0119cej"] })] }), moreOpen && (_jsx(Sheet, { onClose: () => setMoreOpen(false), children: MORE.map((m) => (_jsxs(NavLink, { to: m.to, className: "sheet-tile", onClick: () => setMoreOpen(false), children: [_jsx("span", { children: m.icon }), m.label] }, m.to))) }))] }));
}
