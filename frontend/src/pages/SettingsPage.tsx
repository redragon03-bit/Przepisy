import { useEffect, useRef, useState } from "react";
import { api, AuthStatus, BackupFile, DuplicateGroup, ImageSearchProgress, Ingredient, ReceiptSettings } from "../api";
import { Link } from "react-router-dom";
import AccountsSection from "../components/AccountsSection";
import AppearanceSection from "../components/AppearanceSection";
import { usePromoBadges } from "../lib/promoBadges";
import { useToast } from "../lib/toast";

const AI_NAMES: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", xai: "Grok", groq: "Groq", mistral: "Mistral" };

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
  const [showPromos, setShowPromos] = usePromoBadges();
  const [receipts, setReceipts] = useState<ReceiptSettings | null>(null);

  const refresh = () => api.listIngredients("", true).then(setStaples);
  const owner = auth.is_owner;
  useEffect(() => {
    refresh();
    api.receiptSettings().then(setReceipts, () => undefined);
    // Kopie i porządki w bazie to sprawy właściciela - domownik ich nie widzi
    if (!owner) return;
    api.listBackups().then(setBackups);
    if (auth.ai_enabled) {
      api.recipeStats().then((s) => setUncategorized(s.uncategorized));
      api.imageSearchStatus().then(setImages);
    }
  }, [auth.ai_enabled, owner]);

  const autoCategorize = async () => {
    setWorking("categories");
    const result = await run(() => api.autoCategorize());
    setWorking("");
    if (result) {
      setUncategorized(result.remaining);
      toast(result.remaining ? `Przypisano ${result.updated}, zostało ${result.remaining} - stuknij jeszcze raz.` : "Gotowe!");
    }
  };

  // Adres z tokenem - kalendarz pobiera go sam, bez logowania. `app` = adres do linków w wydarzeniach.
  const copyCalendar = async () => {
    const link = await run(() => api.calendarLink());
    if (!link) return;
    const url = `${location.origin}${link.path}&app=${encodeURIComponent(location.origin)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Skopiowano adres kalendarza.");
    } catch {
      window.prompt("Adres kalendarza:", url);
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
        <p className="muted small">
          Te składniki nie są liczone jako brakujące w „Co ugotuję?”.
          {!owner && " Listę zmienia właściciel aplikacji."}
        </p>
        <div className="chips">
          {staples.map((s) =>
            owner ? (
              <button key={s.id} type="button" className="chip" onClick={() => run(() => api.setStaple(s.id, false)).then(refresh)}>
                {s.name} ✕
              </button>
            ) : (
              <span key={s.id} className="chip">
                {s.name}
              </span>
            ),
          )}
        </div>
        {owner && (
          <form className="row" onSubmit={add}>
            <input value={newStaple} onChange={(e) => setNewStaple(e.target.value)} placeholder="np. masło" autoCapitalize="none" />
            <button>Dodaj</button>
          </form>
        )}
      </section>

      <section className="box">
        <h2>Promocje</h2>
        <label className="toggle switch-row">
          <span className="grow">
            Ceny z gazetek przy składnikach
            <span className="muted small block">Plakietki „🏷️ Biedronka 5,99 zł” w przepisach i na liście zakupów.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={showPromos}
            onChange={(e) => setShowPromos(e.target.checked)}
            aria-label="Pokazuj ceny z promocji przy składnikach"
          />
        </label>
      </section>

      {receipts && (
        <section className="box">
          <h2>Spiżarnia</h2>
          <label className="toggle switch-row">
            <span className="grow">
              Dodawanie z paragonu
              <span className="muted small block">
                {receipts.ai_enabled
                  ? `Zakupy → W domu → „📷 Dodaj z paragonu”: AI odczytuje zdjęcie paragonu, a Ty sprawdzasz listę. Do ${receipts.daily_limit} paragonów dziennie (dziś: ${receipts.used_today}). Tylko na tym koncie.`
                  : "Paragon odczytuje AI - najpierw ustaw klucz API do AI w opcjach dodatku."}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={receipts.enabled}
              disabled={!receipts.ai_enabled}
              onChange={async (e) => {
                const next = await run(() => api.setReceiptsEnabled(e.target.checked));
                if (next) {
                  setReceipts(next);
                  // Zakupy czytają to ustawienie z pamięci telefonu, zanim zapytają serwer
                  try {
                    localStorage.setItem("receipts-enabled", JSON.stringify(next.enabled && next.ai_enabled));
                  } catch {
                    // prywatne okno - Zakupy i tak zapytają serwer
                  }
                }
              }}
              aria-label="Dodawanie produktów do spiżarni z paragonu"
            />
          </label>
        </section>
      )}

      <AppearanceSection />

      <AccountsSection auth={auth} />

      {owner && (
        <section className="box">
          <h2>Kopia zapasowa</h2>
          <p className="muted small">Plik ZIP z bazą przepisów i wszystkimi zdjęciami.</p>
          <a className="button wide" href="/api/backup" download>
            Pobierz kopię
          </a>
          <p className="muted small">
            Przeprowadzka do innej aplikacji (Mealie, Tandoor, Paprika):{" "}
            <a href="/api/backup/schema-org" download>
              przepisy w formacie schema.org
            </a>
          </p>
          <p className="muted small">Aplikacja sama robi kopię raz w tygodniu i trzyma 3 ostatnie (w folderze danych aplikacji).</p>
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
                    {new Date(b.created_at).toLocaleString("pl-PL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </a>{" "}
                  <span className="muted">({(b.size / 1024 / 1024).toFixed(1)} MB)</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {owner && (
        <section className="box">
          <h2>Porządki</h2>
          {auth.ai_enabled && (
            <>
              <button type="button" className="wide" disabled={working === "categories" || !uncategorized} onClick={autoCategorize}>
                {working === "categories" ? "AI przypisuje kategorie…" : `✨ Przypisz kategorie (${uncategorized} bez kategorii)`}
              </button>
              <Link className="button wide" to="/sekcje">
                🧩 Podziel przepisy na sekcje (przegląd z AI)
              </Link>
              <button type="button" className="wide" disabled={!images || images.running || !images.missing} onClick={findImages}>
                {images?.running
                  ? `🔍 Szukam zdjęć… ${images.done}/${images.total}`
                  : `🔍 Znajdź zdjęcia w internecie (${images?.missing ?? 0} bez zdjęcia)`}
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
      )}

      <section className="box small">
        <h2>Informacje</h2>
        <p>
          AI (pytane po kolei):{" "}
          {auth.ai_providers.length ? auth.ai_providers.map((p) => (p === "gemini" && auth.gemini_keys > 1 ? `Gemini (${auth.gemini_keys} klucze)` : AI_NAMES[p] ?? p)).join(" → ") + " ✅" : "wyłączone (brak klucza API)"}
        </p>
        {owner && <p>Home Assistant: {auth.ha_enabled ? "wysyłanie listy zakupów działa ✅" : "nie skonfigurowane"}</p>}
        {owner && (
          <p>Powiadomienia z minutników: {auth.notify_enabled ? "przez Home Assistant ✅" : "wyłączone (opcja ha_notify dodatku)"}</p>
        )}
        <p>
          Połączenie:{" "}
          {window.isSecureContext ? "https ✅" : "http – bez pracy offline i bez utrzymywania włączonego ekranu (patrz README, HTTPS)"}
        </p>
        {owner && (
          <p>
            Plan posiłków jako kalendarz (HA, Google, iPhone):{" "}
            <button type="button" className="link" onClick={copyCalendar}>
              kopiuj adres
            </button>
          </p>
        )}
        <p className="muted">Na iPhonie: w Safari stuknij „Udostępnij” → „Do ekranu początkowego”, żeby mieć aplikację jako ikonę.</p>
      </section>

      {auth.auth_required && (
        <button type="button" className="danger wide" onClick={logout}>
          Wyloguj ({auth.user_name})
        </button>
      )}
    </>
  );
}
