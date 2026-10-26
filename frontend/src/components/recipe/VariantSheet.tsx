import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Recipe } from "../../api";
import { cacheRecipe } from "../../lib/recipeCache";
import { useToast } from "../../lib/toast";
import Sheet from "../Sheet";

const IDEAS = ["wersja wege", "na 2 osoby", "bez glutenu", "bez laktozy", "lżejsza wersja", "pikantniej"];

// Wariant przepisu od AI ("wersja wege", "na 8 osób") - zapisany przy przepisie, nie jako osobny na liście.
export default function VariantSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [wish, setWish] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { run, toast } = useToast();

  const create = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    const variant = await run(() => api.createVariant(recipe.id, text.trim()));
    setBusy(false);
    if (variant) {
      cacheRecipe(variant);
      onClose();
      toast(`Zapisano wariant „${variant.variant_name}”`);
      navigate(`/przepis/${variant.id}`);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create(wish);
  };

  return (
    <Sheet title="Nowy wariant przepisu" onClose={onClose} list>
      {busy ? (
        <p className="muted">AI przerabia przepis… (do minuty)</p>
      ) : (
        <>
          <div className="chips">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="chip" onClick={() => create(idea)}>
                {idea}
              </button>
            ))}
          </div>
          <form className="row" onSubmit={submit}>
            <input value={wish} onChange={(e) => setWish(e.target.value)} placeholder="albo opisz własny, np. „z indykiem”" enterKeyHint="go" />
            <button type="submit" className="primary" disabled={!wish.trim()}>
              Zrób
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}
