import { MouseEvent, useEffect, useLayoutEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { api, AuthStatus, savedAuth, saveAuth, setUnauthorizedHandler } from "./api";
import BackToTop from "./components/BackToTop";
import { LoadingScreen } from "./components/Loading";
import ServerDownScreen from "./components/ServerDownScreen";
import Sheet from "./components/Sheet";
import ThemeAmbient from "./components/ThemeAmbient";
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
import SectionsReviewPage from "./pages/SectionsReviewPage";
import SettingsPage from "./pages/SettingsPage";
import ShoppingPage from "./pages/ShoppingPage";

const TABS = [
  { to: "/", icon: "📖", label: "Przepisy" },
  { to: "/dodaj", icon: "+", label: "Dodaj" },
  { to: "/czat", icon: "💬", label: "Czat" },
  { to: "/zakupy", icon: "🛒", label: "Zakupy" },
];

// Rzadziej używane strony chowamy pod zakładką "Więcej", żeby pasek był czytelny.
const MORE = [
  { to: "/co-ugotowac", icon: "🥕", label: "Co ugotuję?" },
  { to: "/plan", icon: "🗓️", label: "Plan" },
  { to: "/promocje", icon: "🏷️", label: "Promocje" },
  { to: "/ustawienia", icon: "⚙️", label: "Ustawienia" },
  { to: "/pomoc", icon: "💡", label: "Jak używać" },
];

export default function App() {
  // Telefon pamięta ostatnie logowanie, więc aplikacja rysuje się od razu, bez czekania
  // na serwer (przez Tailscale pierwsze zapytanie potrafi trwać kilka sekund).
  // Świeży stan z serwera przychodzi w tle; wygasła sesja przełączy na ekran logowania.
  const [auth, setAuth] = useState<AuthStatus | null>(() => {
    const saved = savedAuth();
    return saved?.authenticated ? saved : null;
  });
  const location = useLocation();
  const navigationType = useNavigationType();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((m) => location.pathname === m.to || location.pathname.startsWith(`${m.to}/`));
  const swipe = useEdgeSwipeBack();

  useEffect(() => setMoreOpen(false), [location.key]);

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

  const [offline, setOffline] = useState(false);

  // Raz po otwarciu aplikacji: ustawienia wyglądu i ekran do logu dodatku (wiadomo, co jest ustawione)
  const authenticated = !!auth?.authenticated;
  useEffect(() => {
    if (authenticated) api.saveAppearance(loadScales(), deviceLabel()).catch(() => undefined);
  }, [authenticated]);
  const refreshAuth = () =>
    api.authStatus().then((status) => {
      setAuth(status);
      saveAuth(status);
      // Przepisy z planu na tydzień trafiają do pamięci telefonu - do gotowania bez internetu.
      // Dopiero po zalogowaniu (wcześniej serwer odpowiadał 401).
      if (status.authenticated) prefetchPlanned().catch(() => {});
    });

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth((a) => (a ? { ...a, authenticated: false } : a)));
    // Bez internetu (np. w sklepie) otwieramy aplikację z ostatnio zapamiętanym stanem -
    // lista zakupów działa wtedy z pamięci telefonu
    refreshAuth().catch(() => {
      const saved = savedAuth();
      if (saved) setAuth((current) => current ?? saved);
      setOffline(true);
    });
  }, []);

  if (!auth)
    return (
      <>
        <LoadingScreen text={offline ? "Brak połączenia z serwerem." : undefined} />
        <ServerDownScreen />
      </>
    );
  if (!auth.authenticated)
    return (
      <>
        <LoginPage onLogin={refreshAuth} />
        <ServerDownScreen />
      </>
    );

  return (
    <>
      <ServerDownScreen />
      {!location.pathname.endsWith("/gotuj") && <ThemeAmbient list={location.pathname === "/"} />}
      <main className="page">
        <Routes>
          <Route path="/" element={<RecipesPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/przepis/:id" element={<RecipePage aiEnabled={auth.ai_enabled} />} />
          <Route path="/przepis/:id/edytuj" element={<EditRecipePage aiEnabled={auth.ai_enabled} />} />
          <Route path="/przepis/:id/gotuj" element={<CookingModePage />} />
          <Route path="/czat" element={<ChatPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/nowy" element={<EditRecipePage aiEnabled={auth.ai_enabled} />} />
          <Route path="/dodaj" element={<ImportPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/co-ugotowac" element={<CookPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/promocje" element={<PromotionsPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/plan" element={<PlanPage aiEnabled={auth.ai_enabled} />} />
          <Route path="/zakupy" element={<ShoppingPage haEnabled={auth.ha_enabled} owner={auth.is_owner} />} />
          <Route path="/ustawienia" element={<SettingsPage onLogout={refreshAuth} auth={auth} />} />
          <Route path="/ustawienia/:group" element={<SettingsPage onLogout={refreshAuth} auth={auth} />} />
          <Route path="/pomoc" element={<HelpPage />} />
          <Route path="/sekcje" element={<SectionsReviewPage />} />
        </Routes>
      </main>
      <BackToTop />
      <TimersBar />
      {swipe > 0 && (
        <div className={`swipe-back ${swipe >= SWIPE_BACK_DISTANCE ? "ready" : ""}`} style={{ transform: `translateX(${swipe - 40}px)` }}>
          ‹
        </div>
      )}
      <nav className="tabbar">
        {TABS.map((tab) => (
          // Przy otwartym panelu "Więcej" wyróżniona jest tylko ta zakładka
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) => (isActive && !moreOpen ? "active" : "")}
            onClick={(e) => onTabClick(e, tab.to)}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
        <button type="button" className={inMore || moreOpen ? "active" : ""} onClick={() => setMoreOpen(!moreOpen)}>
          <span>⋯</span>Więcej
        </button>
      </nav>
      {moreOpen && (
        <Sheet onClose={() => setMoreOpen(false)}>
          {MORE.map((m) => (
            <NavLink key={m.to} to={m.to} className="sheet-tile" onClick={() => setMoreOpen(false)}>
              <span>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </Sheet>
      )}
    </>
  );
}
