import { useRef, useState } from "react";
import { api, Recipe } from "../../api";
import { clearProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import AutoTextarea from "../AutoTextarea";
import Sheet from "../Sheet";
import Stars from "../Stars";

// "Ugotowane": wpis w dzienniku gotowania. Ocena, notatka ("za słone") i zdjęcie
// są opcjonalne - samo "Zapisz" działa jak dawny przycisk.
export default function CookedSheet({ recipe, onSaved, onClose }: { recipe: Recipe; onSaved: (r: Recipe) => void; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const { toast, run } = useToast();

  const save = async () => {
    setSaving(true);
    const saved = await run(() => api.markCooked(recipe.id, { rating: rating || null, note, photo }));
    setSaving(false);
    if (saved) {
      clearProgress(recipe.id);
      onSaved(saved);
      toast("Zapisane! Smacznego 🙂");
    }
  };

  return (
    <Sheet title="Jak wyszło?" onClose={onClose} list>
      <div className="cooked-form">
        <Stars value={rating || null} onChange={setRating} />
        <AutoTextarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Notatka na następny raz (np. „mniej soli”)" />
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <button type="button" className="sheet-row" onClick={() => photoInput.current?.click()}>
          {photo ? "✅ Zdjęcie dodane (zmień)" : "📷 Dodaj zdjęcie"}
        </button>
        <button type="button" className="primary wide" disabled={saving} onClick={save}>
          {saving ? "Zapisuję…" : "✅ Zapisz"}
        </button>
      </div>
    </Sheet>
  );
}
