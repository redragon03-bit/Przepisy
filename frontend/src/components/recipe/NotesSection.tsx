import { useState } from "react";
import { api, Recipe } from "../../api";
import { useToast } from "../../lib/toast";
import AutoTextarea from "../AutoTextarea";

export default function NotesSection({ recipe, onChange }: { recipe: Recipe; onChange: (r: Recipe) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const { run } = useToast();

  const save = async () => {
    const saved = await run(() => api.patchRecipe(recipe.id, { notes: editing ?? "" }));
    if (saved) {
      onChange(saved);
      setEditing(null);
    }
  };

  return (
    <>
      <h2>Notatki</h2>
      {editing === null ? (
        <>
          {recipe.notes ? <p className="notes">{recipe.notes}</p> : <p className="muted small">Brak notatek.</p>}
          <button type="button" className="link small" onClick={() => setEditing(recipe.notes)}>
            {recipe.notes ? "Edytuj notatki" : "+ Dodaj notatkę, np. „następnym razem mniej cukru”"}
          </button>
        </>
      ) : (
        <>
          <AutoTextarea rows={3} value={editing} onChange={(e) => setEditing(e.target.value)} autoFocus />
          <button type="button" className="primary" onClick={save}>
            Zapisz notatkę
          </button>
        </>
      )}
    </>
  );
}
