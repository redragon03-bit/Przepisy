import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ImportJob } from "../api";

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

// Dodawanie przepisów: z linku albo ze zdjęć/screenów.
// Import trwa kilkanaście sekund, więc działa w tle - lista poniżej pokazuje postęp.
export default function ImportPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [params, setParams] = useSearchParams();
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => api.listImports().then(setJobs);

  const startUrlImport = async (link: string, force = false) => {
    setError("");
    setBusy(true);
    try {
      await api.importUrl(link.trim(), force);
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
    const shared = params.get("url") || findUrl(params.get("text") ?? "");
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

  const paste = async () => {
    try {
      setUrl(findUrl(await navigator.clipboard.readText()) || url);
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
        <h2>Z linku</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            startUrlImport(url);
          }}
        >
          {/* Zwykła klawiatura zamiast "url" - ma spację, którą przesuwa się kursor w linku */}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          {"clipboard" in navigator && "readText" in navigator.clipboard && (
            <button type="button" onClick={paste}>
              Wklej
            </button>
          )}
        </form>
        <button className="primary wide" disabled={!url.trim() || busy} onClick={() => startUrlImport(url)}>
          Importuj
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
                <div className="job-source">{job.kind === "url" ? job.source : `📷 ${job.source}`}</div>
                <div className="small">
                  {STATUS_LABEL[job.status]}
                  {job.status === "done" && job.recipe_count > 1 && (
                    <>
                      {" · "}
                      <Link to="/">{job.recipe_count} {recipesWord(job.recipe_count)} - zobacz listę</Link>
                    </>
                  )}
                  {job.status === "done" && job.recipe_count <= 1 && job.recipe_id && (
                    <>
                      {" · "}
                      <Link to={`/przepis/${job.recipe_id}`}>otwórz przepis</Link>
                    </>
                  )}
                </div>
                {job.status === "duplicate" && job.recipe_id && (
                  <div className="small">
                    <Link to={`/przepis/${job.recipe_id}`}>otwórz</Link>
                    {" · "}
                    <button type="button" className="link" onClick={() => startUrlImport(job.source, true)}>
                      importuj mimo to
                    </button>
                  </div>
                )}
                {job.error && job.status !== "duplicate" && <div className="error small">{job.error}</div>}
                {job.status === "failed" && (
                  <button className="small-button" onClick={() => retry(job.id)}>
                    Ponów
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
