import { ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, AuthStatus, BackupFile, ReceiptSettings } from "../api";
import AccountsSection from "../components/AccountsSection";
import AppearanceSection from "../components/AppearanceSection";
import BackupSection from "../components/BackupSection";
import CleanupSection from "../components/CleanupSection";
import InfoSection, { aiProviders } from "../components/InfoSection";
import ShoppingSettings from "../components/ShoppingSettings";
import { useGoBack } from "../lib/navigation";
import { usePromoBadges } from "../lib/promoBadges";
import { loadTheme, themeById } from "../lib/theme";
import { DEFAULT_SCALES, loadScales, scalesSummary } from "../lib/uiScale";

type Props = { auth: AuthStatus; onLogout: () => void };

// Ustawienia jak w iPhonie: krótka lista grup, każda grupa to osobna podstrona /ustawienia/<slug>.
type Group = { slug: string; icon: string; title: string; ownerOnly?: boolean; page: (auth: AuthStatus) => ReactNode };

const GROUPS: Group[] = [
  { slug: "konto", icon: "👤", title: "Konto i domownicy", page: (auth) => <AccountsSection auth={auth} /> },
  { slug: "wyglad", icon: "🎨", title: "Wygląd", page: () => <AppearanceSection /> },
  { slug: "zakupy", icon: "🛒", title: "Zakupy i promocje", page: () => <ShoppingSettings /> },
  { slug: "kopia", icon: "💾", title: "Kopia zapasowa", ownerOnly: true, page: () => <BackupSection /> },
  { slug: "porzadki", icon: "🧹", title: "Porządki", ownerOnly: true, page: (auth) => <CleanupSection auth={auth} /> },
  { slug: "informacje", icon: "ℹ️", title: "Informacje", page: (auth) => <InfoSection auth={auth} /> },
];

// Karty na głównym ekranie: grupy podobnych spraw razem, jak w Ustawieniach iPhone'a
const CARDS = [["konto"], ["wyglad", "zakupy"], ["kopia", "porzadki"], ["informacje"]];

export default function SettingsPage({ auth, onLogout }: Props) {
  const { group } = useParams();
  if (!group) return <SettingsHome auth={auth} onLogout={onLogout} />;
  const found = GROUPS.find((g) => g.slug === group);
  if (!found || (found.ownerOnly && !auth.is_owner)) return <Navigate to="/ustawienia" replace />;
  return <SettingsSubpage title={groupTitle(found, auth)}>{found.page(auth)}</SettingsSubpage>;
}

function groupTitle(group: Group, auth: AuthStatus) {
  return group.slug === "konto" && !auth.is_owner ? "Twoje konto" : group.title;
}

function SettingsSubpage({ title, children }: { title: string; children: ReactNode }) {
  const goBack = useGoBack("/ustawienia");
  return (
    <div className="settings-subpage">
      <header className="topbar">
        <button type="button" className="link" onClick={goBack}>
          ‹ Wróć
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}

function SettingsHome({ auth, onLogout }: Props) {
  const owner = auth.is_owner;
  const [showPromos] = usePromoBadges();
  const [receipts, setReceipts] = useState<ReceiptSettings | null>(null);
  const [backups, setBackups] = useState<BackupFile[] | null>(null);

  useEffect(() => {
    api.receiptSettings().then(setReceipts, () => undefined);
    // Kopie to sprawa właściciela - domownik ich nie widzi
    if (owner) api.listBackups().then(setBackups, () => undefined);
  }, [owner]);

  // Krótki opis bieżącego stanu pod nazwą grupy
  const subtitle = (slug: string): string => {
    switch (slug) {
      case "konto":
        if (!owner) return `${auth.user_name} · zmiana hasła`;
        return auth.auth_required ? `${auth.user_name} · konta domowników` : "Konta działają, gdy jest hasło";
      case "wyglad": {
        const sizes = scalesSummary(loadScales()) === scalesSummary(DEFAULT_SCALES) ? "wielkość 100%" : "wielkość zmieniona";
        return `Motyw: ${themeById(loadTheme().theme).label} · ${sizes}`;
      }
      case "zakupy": {
        const promos = `Ceny z gazetek: ${showPromos ? "wł." : "wył."}`;
        return receipts ? `${promos} · paragon: ${receipts.enabled && receipts.ai_enabled ? "wł." : "wył."}` : promos;
      }
      case "kopia": {
        if (!backups) return "Pobierz albo przywróć";
        const newest = Math.max(...backups.map((b) => new Date(b.created_at).getTime()));
        return backups.length ? `Ostatnia: ${new Date(newest).toLocaleDateString("pl-PL", { dateStyle: "medium" })}` : "Jeszcze bez kopii automatycznej";
      }
      case "porzadki":
        return auth.ai_enabled ? "Kategorie, zdjęcia, podwójne składniki" : "Zdjęcia, podwójne składniki";
      case "informacje": {
        const ai = aiProviders(auth);
        return ai ? `AI: ${ai}` : "AI wyłączone";
      }
    }
    return "";
  };

  const logout = async () => {
    await api.logout();
    onLogout();
  };

  const visible = (slug: string) => {
    const g = GROUPS.find((x) => x.slug === slug);
    return g && (!g.ownerOnly || owner) ? g : null;
  };

  return (
    <>
      <header className="topbar">
        <h1>Ustawienia</h1>
      </header>

      {!auth.auth_required && (
        <p className="box warning small">
          Aplikacja nie ma hasła - każdy, kto ma do niej dostęp, może zmieniać przepisy. Ustaw hasło w opcjach dodatku (app_password).
        </p>
      )}

      {CARDS.map((slugs) => {
        const groups = slugs.map(visible).filter((g): g is Group => !!g);
        if (!groups.length) return null;
        return (
          <ul key={slugs[0]} className="box settings-list">
            {groups.map((g) => (
              <li key={g.slug}>
                <Link to={`/ustawienia/${g.slug}`} className="settings-row">
                  <span className="settings-icon" aria-hidden="true">
                    {g.icon}
                  </span>
                  <span className="grow">
                    {groupTitle(g, auth)}
                    <span className="muted small block">{subtitle(g.slug)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        );
      })}

      {auth.auth_required && (
        <button type="button" className="danger wide" onClick={logout}>
          Wyloguj ({auth.user_name})
        </button>
      )}
    </>
  );
}
