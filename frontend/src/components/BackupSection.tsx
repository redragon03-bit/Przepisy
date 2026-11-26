import { useEffect, useRef, useState } from "react";
import { api, BackupFile } from "../api";
import { useToast } from "../lib/toast";

/** Ustawienia → Kopia zapasowa (tylko właściciel). */
export default function BackupSection() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [restoring, setRestoring] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const { toast, run } = useToast();

  useEffect(() => {
    api.listBackups().then(setBackups, () => undefined);
  }, []);

  // Przywrócenie kopii to duża zmiana, więc tu (wyjątkowo) pytamy. Obecne dane i tak
  // trafiają najpierw do kopii automatycznych - można do nich wrócić.
  const restore = async (file: File | undefined) => {
    if (restoreInput.current) restoreInput.current.value = "";
    if (!file || !window.confirm(`Zastąpić wszystkie przepisy zawartością pliku „${file.name}”? Obecne dane zostaną zapisane jako kopia automatyczna.`)) return;
    setRestoring(true);
    const result = await run(() => api.restoreBackup(file));
    setRestoring(false);
    if (result) {
      toast(`Przywrócono kopię: ${result.recipes} przepisów.`);
      api.listBackups().then(setBackups, () => undefined);
    }
  };

  return (
    <section className="box">
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
      <button type="button" className="wide" disabled={restoring} onClick={() => restoreInput.current?.click()}>
        {restoring ? "Przywracam…" : "Przywróć z pliku…"}
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
  );
}
