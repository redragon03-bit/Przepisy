import { useEffect, useRef, useState } from "react";
import { api, AuthStatus, BackupFile, DuplicateGroup, ImageSearchProgress, Ingredient } from "../api";
import { useToast } from "../lib/toast";

const AI_NAMES: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", groq: "Groq", mistral: "Mistral" };

export default function SettingsPage({ auth, onLogout }: { auth: AuthStatus; onLogout: () => void }) {
  const [staples, setStaples] = useState<Ingredient[]>([]);
  const [newStaple, setNewStaple] = useState("");
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [uncategorized, setUncategorized] = useState(0);
  const [images, setImages] = useState<ImageSearchProgress | null>(null);
  const [working, setWorking] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const { toast, run } = useToast();

  const refresh = () => api.listIngredients("", true).then(setStaples);
  useEffect(() => {
    refresh();
    api.listBackups().then(setBackups);
    if (auth.ai_enabled) {
      api.recipeStats().then((s) => setUncategorized(s.uncategorized));
      api.imageSearchStatus().then(setImages);
    }
  }, [auth.ai_enabled]);

  const autoCategorize = async () => {
    setWorking("categories");
    const result = await run(() => api.autoCategorize());
    setWorking("");
    if (result) {
      setUncategorized(result.remaining);
      toast(result.remaining ? `Przypisano ${result.updated}, zostało ${result.remaining} - stuknij jeszcze raz.` : "Gotowe!");
    }
  };

  const findDuplicates = async () => {
    setWorking("duplicates");
    const found = await run(() => api.findDuplicateIngredients());
    setWorking("");
    if (found) {
      setDuplicates(found);
      if (!found.length) toast("Nie znalazłem podwójnych składników.");
    }
  };

  const merge = async (group: DuplicateGroup) => {
    // run() zwraca undefined także po błędzie, więc odpowiedź bez treści zamieniamy na true
    if (await run(() => api.mergeIngredients(group.keep, group.others).then(() => true))) {
      setDuplicates((list) => list && list.filter((g) => g !== group));
      toast(`Połączono w „${group.keep}”.`);
    }
  };

  const findImages = async () => {
    const status = await run(() => api.startImageSearch());
    if (status) {
      setImages(status);
      toast("Szukam zdjęć w tle - postęp widać na liście przepisów.");
    }
  };

  // Przywrócenie kopii to duża zmiana, więc tu (wyjątkowo) pytamy. Obecne dane i tak
  // trafiają najpierw do kopii automatycznych - można do nich wrócić.
  const restore = async (file: File | undefined) => {
    if (restoreInput.current) restoreInput.current.value = "";
    if (!file || !window.confirm(`Zastąpić wszystkie przepisy zawartością pliku „${file.name}”? Obecne dane zostaną zapisane jako kopia automatyczna.`)) return;
    setWorking("restore");
    const result = await run(() => api.restoreBackup(file));
    setWorking("");
    if (result) {
      toast(`Przywrócono kopię: ${result.recipes} przepisów.`);
      api.listBackups().then(setBackups);
      refresh();
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaple.trim()) return;
    if (!(await run(() => api.addStaple(newStaple)))) return;
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

      {!auth.auth_required && (
        <p className="box warning small">
          Aplikacja nie ma hasła - każdy, kto ma do niej dostęp, może zmieniać przepisy. Ustaw hasło w opcjach dodatku (app_password).
        </p>
      )}

      <section className="box">
        <h2>Zawsze w domu</h2>
        <p className="muted small">Te składniki nie są liczone jako brakujące w „Co ugotuję?”.</p>
        <div className="chips">
          {staples.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => run(() => api.setStaple(s.id, false)).then(refresh)}>
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
        <button type="button" className="wide" disabled={working === "restore"} onClick={() => restoreInput.current?.click()}>
          {working === "restore" ? "Przywracam…" : "Przywróć z pliku…"}
        </button>
        <input ref={restoreInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => restore(e.target.files?.[0])} />
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

      <section className="box">
        <h2>Porządki</h2>
        {auth.ai_enabled && (
          <>
            <button type="button" className="wide" disabled={working === "categories" || !uncategorized} onClick={autoCategorize}>
              {working === "categories" ? "AI przypisuje kategorie…" : `✨ Przypisz kategorie (${uncategorized} bez kategorii)`}
            </button>
            <button type="button" className="wide" disabled={!images || images.running || !images.missing} onClick={findImages}>
              {images?.running ? `🔍 Szukam zdjęć… ${images.done}/${images.total}` : `🔍 Znajdź zdjęcia w internecie (${images?.missing ?? 0} bez zdjęcia)`}
            </button>
          </>
        )}
        <button type="button" className="wide" disabled={working === "duplicates"} onClick={findDuplicates}>
          {working === "duplicates" ? "Szukam…" : "🧹 Znajdź podwójne składniki"}
        </button>
        {duplicates && duplicates.length > 0 && (
          <>
            <p className="muted small">Ten sam produkt zapisany inaczej psuje wyszukiwanie i „Co ugotuję?”. Stuknij, żeby połączyć.</p>
            {duplicates.map((g) => (
              <button key={g.keep} type="button" className="sheet-row" onClick={() => merge(g)}>
                {g.others.join(", ")} → <b>{g.keep}</b> <span className="muted small">({g.recipe_count} przepisów)</span>
              </button>
            ))}
          </>
        )}
      </section>

      <section className="box small">
        <h2>Informacje</h2>
        <p>
          AI (pytane po kolei):{" "}
          {auth.ai_providers.length ? auth.ai_providers.map((p) => AI_NAMES[p] ?? p).join(" → ") + " ✅" : "wyłączone (brak klucza API)"}
        </p>
        <p>Home Assistant: {auth.ha_enabled ? "wysyłanie listy zakupów działa ✅" : "nie skonfigurowane"}</p>
        <p>Powiadomienia z minutników: {auth.notify_enabled ? "przez Home Assistant ✅" : "wyłączone (opcja ha_notify dodatku)"}</p>
        <p>
          Połączenie: {window.isSecureContext ? "https ✅" : "http – bez pracy offline i bez utrzymywania włączonego ekranu (patrz README, HTTPS)"}
        </p>
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
