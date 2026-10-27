import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMinutes, RecipeSummary } from "../api";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
import { useLongPress } from "../lib/useLongPress";
import PlanDaySheet from "./PlanDaySheet";
import Sheet, { SheetTile } from "./Sheet";

// Karta przepisu na liście. Przytrzymanie palcem otwiera szybkie menu
// (ulubione, plan, zakupy) bez wchodzenia w przepis.
export default function RecipeCard({ recipe, children }: { recipe: RecipeSummary; children?: React.ReactNode }) {
  const [menu, setMenu] = useState<"menu" | "plan" | null>(null);
  const [favorite, setFavorite] = useState(recipe.favorite);
  const { toast, run } = useToast();
  const { wasLongPress, ...longPress } = useLongPress(() => setMenu("menu"));
  useEffect(() => setFavorite(recipe.favorite), [recipe.favorite]);

  const toggleFavorite = async () => {
    setMenu(null);
    const saved = await run(() => api.patchRecipe(recipe.id, { favorite: !favorite }));
    if (saved) setFavorite(saved.favorite);
  };

  const toShopping = async () => {
    setMenu(null);
    const result = await run(() => api.addRecipeToShopping(recipe.id));
    if (result) toast(shoppingMessage(result));
  };

  return (
    <>
      <Link
        to={`/przepis/${recipe.id}`}
        className="card"
        {...longPress}
        onClick={(e) => {
          if (wasLongPress()) e.preventDefault(); // puszczenie palca po przytrzymaniu nie otwiera przepisu
        }}
      >
        {recipe.thumb_url ? (
          <img src={recipe.thumb_url} alt="" loading="lazy" />
        ) : (
          <div className="card-placeholder">🍽️</div>
        )}
        <div className="card-body">
          <strong>
            {favorite && "❤️ "}
            {recipe.title}
          </strong>
          {recipe.rating ? <span className="stars small">{"★".repeat(recipe.rating)}</span> : null}
          {recipe.total_minutes ? <span className="muted">⏱ {formatMinutes(recipe.total_minutes)}</span> : null}
          {children}
        </div>
      </Link>
      {menu === "menu" && (
        <Sheet title={recipe.title} onClose={() => setMenu(null)}>
          <SheetTile icon={favorite ? "🤍" : "❤️"} label={favorite ? "Usuń z ulubionych" : "Do ulubionych"} onClick={toggleFavorite} />
          <SheetTile icon="📅" label="Zaplanuj" onClick={() => setMenu("plan")} />
          <SheetTile icon="🛒" label="Do zakupów" onClick={toShopping} />
        </Sheet>
      )}
      {menu === "plan" && <PlanDaySheet recipeId={recipe.id} onClose={() => setMenu(null)} />}
    </>
  );
}
