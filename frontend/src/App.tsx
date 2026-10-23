import { MouseEvent, useEffect, useLayoutEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { api, AuthStatus, setUnauthorizedHandler } from "./api";
import BackToTop from "./components/BackToTop";
import { scrollToTop } from "./lib/navigation";
import ChatPage from "./pages/ChatPage";
import CookingModePage from "./pages/CookingModePage";
import CookPage from "./pages/CookPage";
import EditRecipePage from "./pages/EditRecipePage";
import ImportPage from "./pages/ImportPage";
import LoginPage from "./pages/LoginPage";
import PlanPage from "./pages/PlanPage";
import RecipePage from "./pages/RecipePage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";
import ShoppingPage from "./pages/ShoppingPage";

const TABS = [
  { to: "/", icon: "📖", label: "Przepisy" },
  { to: "/dodaj", icon: "➕", label: "Dodaj" },
  { to: "/czat", icon: "💬", label: "Czat" },
  { to: "/co-ugotowac", icon: "🥕", label: "Co ugotuję?" },
  { to: "/plan", icon: "📅", label: "Plan" },
  { to: "/zakupy", icon: "🛒", label: "Zakupy" },
];

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const location = useLocation();
  const navigationType = useNavigationType();

  // Nowo otwarta strona zaczyna od góry (lista przepisów sama wraca w zapamiętane miejsce).
  useLayoutEffect(() => {
    if (navigationType !== "POP" && location.pathname !== "/") window.scrollTo(0, 0);
  }, [location.key]);

  // Stuknięcie w zakładkę, na której już jesteśmy, przewija ją na samą górę (jak w iOS).
  const onTabClick = (e: MouseEvent, to: string) => {
    if (location.pathname !== to) return;
    e.preventDefault();
    scrollToTop();
  };

  const refreshAuth = () => api.authStatus().then(setAuth);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth((a) => (a ? { ...a, authenticated: false } : a)));
    refreshAuth().catch(() => setAuth(null));
  }, []);

  if (!auth) return <div className="center muted">Ładowanie…</div>;
  if (!auth.authenticated) return <LoginPage onLogin={refreshAuth} />;

  return (
    <>
      <main className="page">
        <Routes>
          <Route path="/" element={<RecipesPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/przepis/:id" element={<RecipePage />} />
          <Route path="/przepis/:id/edytuj" element={<EditRecipePage />} />
          <Route path="/przepis/:id/gotuj" element={<CookingModePage />} />
          <Route path="/czat" element={<ChatPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/nowy" element={<EditRecipePage />} />
          <Route path="/dodaj" element={<ImportPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/co-ugotowac" element={<CookPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/zakupy" element={<ShoppingPage haEnabled={auth.ha_enabled} />} />
          <Route path="/ustawienia" element={<SettingsPage onLogout={refreshAuth} auth={auth} />} />
        </Routes>
      </main>
      <BackToTop />
      <nav className="tabbar">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} onClick={(e) => onTabClick(e, tab.to)}>
            <span>{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
