import { useEffect, useState } from "react";
import { api, AuthStatus, Ingredient } from "../api";

export default function SettingsPage({ auth, onLogout }: { auth: AuthStatus; onLogout: () => void }) {
  const [staples, setStaples] = useState<Ingredient[]>([]);
  const [newStaple, setNewStaple] = useState("");

  const refresh = () => api.listIngredients("", true).then(setStaples);
  useEffect(() => {
    refresh();
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
      </section>

      <section className="box small">
        <h2>Informacje</h2>
        <p>AI: {auth.ai_enabled ? "włączone ✅" : "wyłączone (brak klucza API)"}</p>
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
