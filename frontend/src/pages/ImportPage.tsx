import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, ImportJob } from "../api";
import AutoTextarea from "../components/AutoTextarea";
import Sheet, { SheetTile } from "../components/Sheet";
import { hideRecipe, unhideRecipe } from "../lib/hidden";
import { forgetRecipe } from "../lib/recipeCache";
import { useToast } from "../lib/toast";

const STATUS_LABEL: Record<ImportJob["status"], string> = {
  pending: "⏳ w kolejce",
  running: "⏳ czytam przepis…",
  done: "✅ gotowe",
  failed: "❌ nie udało się",
  duplicate: "♻️ już masz ten przepis",
};

// Polska odmiana: 2-4 przepisy, 5-21 przepisów, 22-24 przepisy...
function recipesWord(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "przepisy" : "przepisów";
}

function findUrl(text: string): string {
  return text.match(/https?:\/\/\S+/)?.[0] ?? "";
}

// Sam link (ewentualnie z krótkim podpisem, jak przy udostępnianiu z TikToka) = import z linku;
// dłuższy tekst = przepis wklejony jako tekst (np. z Messengera)
function isJustLink(text: string): boolean {
  const url = findUrl(text);
  return !!url && text.replace(url, "").trim().length < 80;
}

const JOB_ICON: Record<ImportJob["kind"], string> = { url: "", image: "📷 ", text: "📝 " };

// Dodawanie przepisów: z linku (strona albo film z TikToka/YouTube/Instagrama),
// z wklejonego tekstu albo ze zdjęć/screenów.
// Import trwa kilkanaście sekund, więc działa w tle - lista poniżej pokazuje postęp.
export default function ImportPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [params, setParams] = useSearchParams();
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [menuJob, setMenuJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { undoable } = useToast();

  const refresh = () => api.listImports().then(setJobs);

  const startUrlImport = async (link: string, force = false) => {
    setError("");
    setBusy(true);
    try {
      if (isJustLink(link) || force) await api.importUrl(findUrl(link) || link.trim(), force);
      else await api.importText(link.trim());
      setUrl("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
    } else {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dopóki coś się importuje, co 2 sekundy pytamy serwer o postęp
  const working = jobs.some((j) => j.status === "pending" || j.status === "running");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [working]);

  const retry = async (id: number) => {
    setError("");
    try {
      await api.retryImport(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Anulowanie (także zawieszonego importu) albo usunięcie wpisu z listy
  const remove = async (id: number) => {
    setError("");
    try {
      await api.deleteImport(id);
      setJobs((list) => list.filter((j) => j.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Usunięcie zaimportowanego przepisu razem z wpisem na liście, z "Cofnij" (jak w menu przepisu)
  const removeRecipe = (job: ImportJob) => {
    const recipeId = job.recipe_id;
    if (!recipeId) return;
    setError("");
    hideRecipe(recipeId);
    setJobs((list) => list.filter((j) => j.id !== job.id));
    undoable(
      "Usunięto przepis",
      async () => {
        await api.deleteRecipe(recipeId).catch((e: unknown) => {
          // Przepis usunięty już wcześniej (np. z jego menu) - wystarczy zdjąć wpis z listy
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        });
        forgetRecipe(recipeId);
        unhideRecipe(recipeId);
        await api.deleteImport(job.id);
      },
      () => {
        unhideRecipe(recipeId);
        refresh();
      },
    );
  };

  const paste = async () => {
    try {
      setUrl((await navigator.clipboard.readText()) || url);
    } catch {
      setError("Przeglądarka nie pozwoliła odczytać schowka - wklej link ręcznie.");
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      await api.importImages(Array.from(files));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <>
      <header className="topbar">
        <h1>Dodaj przepis</h1>
        <Link to="/nowy" className="button small">
          ✍️ Ręcznie
        </Link>
      </header>

      {!aiEnabled && (
        <p className="box warning small">
          AI jest wyłączone (brak klucza API). Działa tylko import ze stron z danymi przepisu, bez tłumaczenia. Zdjęcia nie będą odczytane.
        </p>
      )}

      <section className="box">
        <h2>Z linku albo tekstu</h2>
        <p className="muted small">Link do strony albo filmu (TikTok, YouTube, Instagram) – albo cały przepis wklejony jako tekst.</p>
        <div className="row import-input">
          <AutoTextarea
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… albo tekst przepisu"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            rows={1}
          />
          {"clipboard" in navigator && "readText" in navigator.clipboard && (
            <button type="button" onClick={paste}>
              Wklej
            </button>
          )}
        </div>
        <button className="primary wide" disabled={!url.trim() || busy || (!isJustLink(url) && !aiEnabled)} onClick={() => startUrlImport(url)}>
          {url.trim() && !isJustLink(url) ? "Importuj tekst" : "Importuj"}
        </button>
      </section>

      <section className="box">
        <h2>Ze zdjęć lub screenów</h2>
        <p className="muted small">Możesz wybrać kilka zdjęć jednego przepisu (np. składniki i kroki na osobnych screenach).</p>
        <button className="primary wide" disabled={busy || !aiEnabled} onClick={() => fileInput.current?.click()}>
          Wybierz zdjęcia
        </button>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => uploadImages(e.target.files)} />
      </section>

      {error && <p className="error">{error}</p>}

      {jobs.length > 0 && (
        <section>
          <h2>Ostatnie importy</h2>
          <ul className="jobs">
            {jobs.map((job) => (
              <li key={job.id}>
                {job.status === "done" && job.recipe_count <= 1 && job.recipe_id ? (
                  // Gotowy import: jeden zwarty wiersz - miniatura, nazwa przepisu, ⋯ z usuwaniem
                  <div className="job-row">
                    <Link to={`/przepis/${job.recipe_id}`} className="job-recipe">
                      {job.recipe_thumb ? <img src={job.recipe_thumb} alt="" loading="lazy" /> : <span className="job-thumb">🍽️</span>}
                      <span className="job-title">{job.recipe_title || job.source}</span>
                    </Link>
                    <button type="button" className="link job-more" aria-label="Opcje importu" onClick={() => setMenuJob(job)}>
                      ⋯
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="job-source">{JOB_ICON[job.kind] + job.source}</div>
                    <div className="small">
                      {STATUS_LABEL[job.status]}
                      {job.status === "done" && job.recipe_count > 1 && (
                        <>
                          {" · "}
                          <Link to="/">{job.recipe_count} {recipesWord(job.recipe_count)} - zobacz listę</Link>
                          {" · "}
                          <button type="button" className="link" onClick={() => remove(job.id)}>
                            usuń z listy
                          </button>
                        </>
                      )}
                      {job.status === "done" && !job.recipe_id && job.recipe_count <= 1 && (
                        <>
                          {" · "}
                          <button type="button" className="link" onClick={() => remove(job.id)}>
                            usuń z listy
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                {job.status === "duplicate" && job.recipe_id && (
                  <div className="small">
                    <Link to={`/przepis/${job.recipe_id}`}>otwórz</Link>
                    {" · "}
                    <button type="button" className="link" onClick={() => startUrlImport(job.source, true)}>
                      importuj mimo to
                    </button>
                    {" · "}
                    <button type="button" className="link" onClick={() => remove(job.id)}>
                      usuń z listy
                    </button>
                  </div>
                )}
                {job.error && job.status !== "duplicate" && <div className="error small">{job.error}</div>}
                {(job.status === "pending" || job.status === "running") && (
                  <button type="button" className="link small" onClick={() => remove(job.id)}>
                    anuluj
                  </button>
                )}
                {job.status === "failed" && (
                  <div className="row">
                    <button className="small-button" onClick={() => retry(job.id)}>
                      Ponów
                    </button>
                    <button type="button" className="link small" onClick={() => remove(job.id)}>
                      usuń z listy
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {menuJob && (
        <Sheet title={menuJob.recipe_title || "Import"} onClose={() => setMenuJob(null)}>
          <SheetTile
            icon="🧹"
            label="Usuń z listy"
            onClick={() => {
              remove(menuJob.id);
              setMenuJob(null);
            }}
          />
          <SheetTile
            icon="🗑️"
            label="Usuń przepis"
            danger
            onClick={() => {
              removeRecipe(menuJob);
              setMenuJob(null);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
