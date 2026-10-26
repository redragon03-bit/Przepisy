import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatMinutes, Recipe } from "../../api";
import { hideRecipe, unhideRecipe } from "../../lib/hidden";
import { forgetRecipe } from "../../lib/recipeCache";
import { scaleStep, scaleText } from "../../lib/scale";
import { recipeAsText, shareText } from "../../lib/share";
import { shareAsImage } from "../../lib/shareImage";
import { shoppingMessage } from "../../lib/shopping";
import { useToast } from "../../lib/toast";
import PlanDaySheet from "../PlanDaySheet";
import Sheet, { SheetTile } from "../Sheet";
import VariantSheet from "./VariantSheet";

type Panel = "menu" | "plan" | "photo" | "share" | "variant" | null;

// Menu "⋯" na ekranie przepisu: rzadziej używane akcje w jednym panelu zamiast rzędu przycisków.
export default function RecipeMenu({ recipe, scale, servings, onChange, onSearchImages, aiEnabled }: {
  recipe: Recipe;
  aiEnabled: boolean;
  scale: number;
  // Porcje po przeliczeniu, np. "6 porcji" (do udostępniania)
  servings: string;
  onChange: (r: Recipe) => void;
  onSearchImages: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast, undoable, run } = useToast();
  const close = () => setPanel(null);

  const toShopping = async () => {
    close();
    const result = await run(() => api.addRecipeToShopping(recipe.id, scale));
    if (result) toast(shoppingMessage(result));
  };

  // Składniki i kroki po przeliczeniu porcji
  const scaled = {
    ingredients: recipe.ingredients.map((i) => scaleText(i.text, i.amount, scale)),
    steps: recipe.steps.map((s) => scaleStep(s.text, scale)),
  };

  const share = async () => {
    close();
    const result = await shareText(recipe.title, recipeAsText({ ...recipe, ...scaled, servings }));
    if (result) toast(result);
  };

  const shareImage = async () => {
    close();
    const meta = [servings, formatMinutes(recipe.total_minutes)].filter(Boolean).join(" · ");
    const result = await run(() => shareAsImage({ title: recipe.title, meta, ...scaled, imageUrl: recipe.image_url }));
    if (result) toast(result);
  };

  const nutrition = async () => {
    close();
    toast("Liczę kalorie…");
    const saved = await run(() => api.calculateNutrition(recipe.id));
    if (saved) {
      onChange(saved);
      toast("Kalorie policzone.");
    }
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    const saved = await run(() => api.uploadRecipeImage(recipe.id, file));
    if (saved) onChange(saved);
  };

  // Usunięcie z "Cofnij": przepis znika od razu, a serwer usuwa go po kilku sekundach
  const remove = () => {
    close();
    hideRecipe(recipe.id);
    navigate("/", { replace: true });
    undoable(
      `Usunięto „${recipe.title}”`,
      async () => {
        await api.deleteRecipe(recipe.id);
        forgetRecipe(recipe.id);
        unhideRecipe(recipe.id);
      },
      () => {
        unhideRecipe(recipe.id);
        navigate(`/przepis/${recipe.id}`);
      },
    );
  };

  return (
    <>
      <button type="button" className="link more-button" onClick={() => setPanel("menu")} aria-label="Więcej akcji">
        ⋯
      </button>
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
      {panel === "menu" && (
        <Sheet onClose={close}>
          <SheetTile icon="✏️" label="Edytuj" onClick={() => navigate(`/przepis/${recipe.id}/edytuj`)} />
          <SheetTile icon="📅" label="Zaplanuj" onClick={() => setPanel("plan")} />
          <SheetTile icon="🛒" label="Do zakupów" onClick={toShopping} />
          <SheetTile icon="📤" label="Udostępnij" onClick={() => setPanel("share")} />
          {aiEnabled && <SheetTile icon="🔀" label="Wariant" onClick={() => setPanel("variant")} />}
          <SheetTile icon="🖼️" label="Zdjęcie" onClick={() => setPanel("photo")} />
          <SheetTile icon="🔥" label={recipe.kcal == null ? "Kalorie" : "Kalorie od nowa"} onClick={nutrition} />
          <SheetTile icon="🗑️" label="Usuń" onClick={remove} danger />
        </Sheet>
      )}
      {panel === "plan" && <PlanDaySheet recipeId={recipe.id} onClose={close} />}
      {panel === "variant" && <VariantSheet recipe={recipe} onClose={close} />}
      {panel === "share" && (
        <Sheet title="Udostępnij przepis" onClose={close} list>
          <button type="button" className="sheet-row" onClick={shareImage}>
            🖼️ Jako obrazek (ze zdjęciem)
          </button>
          <button type="button" className="sheet-row" onClick={share}>
            📝 Jako tekst
          </button>
        </Sheet>
      )}
      {panel === "photo" && (
        <Sheet title="Zdjęcie przepisu" onClose={close} list>
          <button
            type="button"
            className="sheet-row"
            onClick={() => {
              close();
              photoInput.current?.click();
            }}
          >
            📷 Z telefonu (aparat albo galeria)
          </button>
          <button
            type="button"
            className="sheet-row"
            onClick={() => {
              close();
              onSearchImages();
            }}
          >
            🔍 Znajdź w internecie
          </button>
        </Sheet>
      )}
    </>
  );
}
