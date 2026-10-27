import { api, Recipe } from "../../api";
import { useToast } from "../../lib/toast";
import Sheet from "../Sheet";
import Stars from "../Stars";

// Dziennik gotowania: kiedy, jak wyszło, notatki i zdjęcia. Najnowsze na górze.
export default function CookLogSheet({ recipe, onChange, onClose }: { recipe: Recipe; onChange: (r: Recipe) => void; onClose: () => void }) {
  const { undoable } = useToast();

  // Usunięcie z "Cofnij" - np. "Ugotowane" wciśnięte przez pomyłkę
  const remove = (entryId: number) => {
    const before = recipe;
    onChange({ ...recipe, cook_log: recipe.cook_log.filter((e) => e.id !== entryId) });
    undoable(
      "Usunięto wpis z dziennika",
      async () => onChange(await api.deleteCooked(recipe.id, entryId)),
      () => onChange(before),
    );
  };

  return (
    <Sheet title="Dziennik gotowania" onClose={onClose} list>
      {recipe.cook_log.length === 0 && <p className="muted">Wcześniejsze gotowania nie mają wpisów w dzienniku.</p>}
      <ul className="cook-log">
        {recipe.cook_log.map((entry) => (
          <li key={entry.id}>
            <div className="row">
              <strong>{new Date(entry.cooked_at).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</strong>
              {entry.rating && <Stars value={entry.rating} />}
              <span className="grow" />
              <button type="button" className="link muted" aria-label="Usuń wpis" onClick={() => remove(entry.id)}>
                ✕
              </button>
            </div>
            {entry.note && <p>{entry.note}</p>}
            {entry.image_url && <img src={entry.image_url} alt="" loading="lazy" />}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
