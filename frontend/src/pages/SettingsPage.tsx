import { useEffect, useState } from "react";
import { api, AuthStatus, BackupFile, Ingredient } from "../api";

const AI_NAMES: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", groq: "Groq", mistral: "Mistral" };

export default function SettingsPage({ auth, onLogout }: { auth: AuthStatus; onLogout: () => void }) {
  const [staples, setStaples] = useState<Ingredient[]>([]);
  const [newStaple, setNewStaple] = useState("");
  const [backups, setBackups] = useState<BackupFile[]>([]);

  const refresh = () => api.listIngredients("", true).then(setStaples);
  useEffect(() => {
    refresh();
    api.listBackups().then(setBackups);
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaple.trim()) return;
    await api.addStaple(newStaple);
    setNewStaple("");
    refresh();
  };

  const logout = async () => {
    await api.logout();
    onLogout();
  };

  return (
    <>
      <header className="topbar">
        <h1>Ustawienia</h1>
      </header>

      <section className="box">
        <h2>Zawsze w domu</h2>
        <p className="muted small">Te składniki nie są liczone jako brakujące w „Co ugotuję?”.</p>
        <div className="chips">
          {staples.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => api.setStaple(s.id, false).then(refresh)}>
              {s.name} ✕
            </button>
          ))}
        </div>
        <form className="row" onSubmit={add}>
          <input value={newStaple} onChange={(e) => setNewStaple(e.target.value)} placeholder="np. masło" autoCapitalize="none" />
          <button>Dodaj</button>
        </form>
      </section>

      <section className="box">
        <h2>Kopia zapasowa</h2>
        <p className="muted small">Plik ZIP z bazą przepisów i wszystkimi zdjęciami.</p>
        <a className="button wide" href="/api/backup" download>
          Pobierz kopię
        </a>
        <p className="muted small">
          Aplikacja sama robi kopię raz w tygodniu i trzyma 3 ostatnie (w folderze danych aplikacji).
        </p>
        {backups.length === 0 ? (
          <p className="muted small">Pierwsza automatyczna kopia powstanie kilka minut po uruchomieniu.</p>
        ) : (
          <ul className="small">
            {backups.map((b) => (
              <li key={b.name}>
                <a href={`/api/backups/${b.name}`} download>
                  {new Date(b.created_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
                </a>{" "}
                <span className="muted">({(b.size / 1024 / 1024).toFixed(1)} MB)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="box small">
        <h2>Informacje</h2>
        <p>
          AI (pytane po kolei):{" "}
          {auth.ai_providers.length ? auth.ai_providers.map((p) => AI_NAMES[p] ?? p).join(" → ") + " ✅" : "wyłączone (brak klucza API)"}
        </p>
        <p>Home Assistant: {auth.ha_enabled ? "wysyłanie listy zakupów działa ✅" : "nie skonfigurowane"}</p>
        <p className="muted">
          Na iPhonie: w Safari stuknij „Udostępnij” → „Do ekranu początkowego”, żeby mieć aplikację jako ikonę.
        </p>
      </section>

      {auth.auth_required && (
        <button type="button" className="danger wide" onClick={logout}>
          Wyloguj
        </button>
      )}
    </>
  );
}
