import { useRef, useState } from "react";
import { api, Recipe } from "../../api";
import { useToast } from "../../lib/toast";

// Zdjęcia z internetu do wyboru - stuknięcie ustawia zdjęcie przepisu.
// Gdy żadne nie pasuje: "Pokaż inne" szuka kolejnych (bez już pokazanych),
// a "Własne zdjęcie" pozwala wgrać zdjęcie z telefonu.
export default function ImageCandidates({ recipe, urls, onPicked, onClose }: {
  recipe: Recipe;
  urls: string[];
  onPicked: (r: Recipe) => void;
  onClose: () => void;
}) {
  const { run, toast } = useToast();
  const [shown, setShown] = useState(urls);
  const seen = useRef<string[]>(urls);
  const round = useRef(0);
  const [searching, setSearching] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const pick = async (url: string) => {
    const saved = await run(() => api.setImageFromUrl(recipe.id, url));
    if (saved) onPicked(saved);
  };

  const more = async () => {
    setSearching(true);
    round.current += 1;
    const found = await run(() => api.moreImageCandidates(recipe.id, seen.current, round.current));
    setSearching(false);
    if (!found) return;
    if (!found.length) {
      toast("Nie znalazłem już innych zdjęć - wgraj własne.");
      return;
    }
    seen.current = [...seen.current, ...found];
    setShown(found);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const saved = await run(() => api.uploadRecipeImage(recipe.id, file));
    if (saved) onPicked(saved);
  };

  return (
    <section className="box image-candidates">
      <p className="small muted">Stuknij zdjęcie, które pasuje:</p>
      <div className={searching ? "candidates loading" : "candidates"}>
        {shown.map((url) => (
          <button key={url} type="button" disabled={searching} onClick={() => pick(url)}>
            <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      <p className="small muted">Żadne nie pasuje?</p>
      <div className="candidates-actions">
        <button type="button" className="button small" disabled={searching} onClick={more}>
          {searching ? "Szukam innych…" : "🔄 Pokaż inne"}
        </button>
        <button type="button" className="button small" disabled={searching} onClick={() => photoInput.current?.click()}>
          📷 Własne zdjęcie
        </button>
        <button type="button" className="link small" onClick={onClose}>
          Zamknij
        </button>
      </div>
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </section>
  );
}
