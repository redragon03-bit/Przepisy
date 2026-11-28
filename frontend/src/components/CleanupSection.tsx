import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AuthStatus, DuplicateGroup, ImageSearchProgress, ImageUpgradeProgress } from "../api";
import { useToast } from "../lib/toast";

/** Ustawienia → Porządki (tylko właściciel): kategorie, sekcje, zdjęcia i podwójne składniki. */
export default function CleanupSection({ auth }: { auth: AuthStatus }) {
  const [uncategorized, setUncategorized] = useState(0);
  const [images, setImages] = useState<ImageSearchProgress | null>(null);
  const [upgrade, setUpgrade] = useState<ImageUpgradeProgress | null>(null);
  const [working, setWorking] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateGroup[] | null>(null);
  const { toast, run } = useToast();

  useEffect(() => {
    api.imageUpgradeStatus().then(setUpgrade, () => undefined);
    if (auth.ai_enabled) {
      api.recipeStats().then((s) => setUncategorized(s.uncategorized), () => undefined);
      api.imageSearchStatus().then(setImages, () => undefined);
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

  const merge = async (group: DuplicateGroup, keep: string, others: string[]) => {
    // run() zwraca undefined także po błędzie, więc odpowiedź bez treści zamieniamy na true
    if (await run(() => api.mergeIngredients(keep, others).then(() => true))) {
      setDuplicates((list) => list && list.filter((g) => g !== group));
      toast(`Połączono w „${keep}”.`);
    }
  };

  const skip = (group: DuplicateGroup) => setDuplicates((list) => list && list.filter((g) => g !== group));

  // Postęp poprawiania zdjęć odświeżamy co kilka sekund, dopóki trwa
  const upgrading = upgrade?.running ?? false;
  useEffect(() => {
    if (!upgrading) return;
    const timer = window.setInterval(() => {
      api.imageUpgradeStatus().then((status) => {
        setUpgrade(status);
        if (!status.running) toast(status.improved ? `Poprawiono zdjęcia: ${status.improved}` : "Nie znalazłem większych wersji tych zdjęć.");
      }, () => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [upgrading, toast]);

  const upgradeImages = async () => {
    const status = await run(() => api.startImageUpgrade());
    if (status) setUpgrade({ ...status, running: true });
  };

  const findImages = async () => {
    const status = await run(() => api.startImageSearch());
    if (status) {
      setImages(status);
      toast("Szukam zdjęć w tle - postęp widać na liście przepisów.");
    }
  };

  return (
    <section className="box">
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
      <button type="button" className="wide" disabled={!upgrade || upgrade.running || !upgrade.low_res} onClick={upgradeImages}>
        {upgrade?.running
          ? `🖼️ Poprawiam zdjęcia… ${upgrade.done}/${upgrade.total}`
          : `🖼️ Popraw rozmazane zdjęcia (${upgrade?.low_res ?? 0})`}
      </button>
      {!!upgrade?.low_res && !upgrade.running && (
        <p className="muted small">
          Szuka na stronie, z której jest przepis, tego samego zdjęcia w większym rozmiarze. Przepisom bez linku do
          źródła zmień zdjęcie na stronie przepisu („Znajdź lepsze”).
        </p>
      )}
      <button type="button" className="wide" disabled={working === "duplicates"} onClick={findDuplicates}>
        {working === "duplicates" ? "Szukam…" : "🧹 Znajdź podwójne składniki"}
      </button>
      {duplicates && duplicates.length > 0 && (
        <>
          <p className="muted small">
            Ten sam produkt zapisany inaczej psuje wyszukiwanie i „Co ugotuję?”. Odznacz nazwy, które są innym produktem,
            wybierz nazwę, która zostanie, i stuknij „Połącz”.
          </p>
          {duplicates.map((g) => (
            <DuplicateCard key={g.keep} group={g} onMerge={(keep, others) => merge(g, keep, others)} onSkip={() => skip(g)} />
          ))}
        </>
      )}
    </section>
  );
}

/** Jedna grupa podobnych nazw: które połączyć i która nazwa zostaje. */
function DuplicateCard({
  group,
  onMerge,
  onSkip,
}: {
  group: DuplicateGroup;
  onMerge: (keep: string, others: string[]) => void;
  onSkip: () => void;
}) {
  const names = [group.keep, ...group.others];
  const [picked, setPicked] = useState(() => new Set(names));
  const [keep, setKeep] = useState(group.keep);
  const chosen = names.filter((n) => picked.has(n));
  const target = picked.has(keep) ? keep : chosen[0];
  const toggle = (name: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  return (
    <div className="duplicate-card">
      <div className="chips">
        {names.map((n) => (
          <button key={n} type="button" className={`chip ${picked.has(n) ? "selected" : ""}`} aria-pressed={picked.has(n)} onClick={() => toggle(n)}>
            {picked.has(n) ? "✓ " : ""}
            {n} <span className="muted small">({group.counts[n] ?? 0})</span>
          </button>
        ))}
      </div>
      {chosen.length >= 2 ? (
        <label className="small">
          Zostaje nazwa
          <select value={target} onChange={(e) => setKeep(e.target.value)}>
            {chosen.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted small">Zaznacz co najmniej dwie nazwy tego samego produktu.</p>
      )}
      <div className="duplicate-actions">
        <button type="button" disabled={chosen.length < 2} onClick={() => onMerge(target, chosen.filter((n) => n !== target))}>
          Połącz {chosen.length >= 2 ? `(${chosen.length})` : ""}
        </button>
        <button type="button" onClick={onSkip}>
          To różne produkty
        </button>
      </div>
    </div>
  );
}
