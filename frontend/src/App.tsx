import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, AuthStatus, setUnauthorizedHandler } from "./api";
import CookPage from "./pages/CookPage";
import EditRecipePage from "./pages/EditRecipePage";
import ImportPage from "./pages/ImportPage";
import LoginPage from "./pages/LoginPage";
import RecipePage from "./pages/RecipePage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);

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
          <Route path="/" element={<RecipesPage />} />
          <Route path="/przepis/:id" element={<RecipePage />} />
          <Route path="/przepis/:id/edytuj" element={<EditRecipePage />} />
          <Route path="/nowy" element={<EditRecipePage />} />
          <Route path="/dodaj" element={<ImportPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/co-ugotowac" element={<CookPage />} />
          <Route path="/ustawienia" element={<SettingsPage onLogout={refreshAuth} auth={auth} />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end>
          <span>📖</span>Przepisy
        </NavLink>
        <NavLink to="/dodaj">
          <span>➕</span>Dodaj
        </NavLink>
        <NavLink to="/co-ugotowac">
          <span>🥕</span>Co ugotuję?
        </NavLink>
        <NavLink to="/ustawienia">
          <span>⚙️</span>Ustawienia
        </NavLink>
      </nav>
    </>
  );
}
