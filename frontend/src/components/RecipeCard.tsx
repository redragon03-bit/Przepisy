import { TouchEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMinutes, RecipeSummary } from "../api";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
import PlanDaySheet from "./PlanDaySheet";
import Sheet, { SheetTile } from "./Sheet";

const LONG_PRESS_MS = 500;

// Karta przepisu na liście. Przytrzymanie palcem otwiera szybkie menu
// (ulubione, plan, zakupy) bez wchodzenia w przepis.
export default function RecipeCard({ recipe, children }: { recipe: RecipeSummary; children?: React.ReactNode }) {
  const [menu, setMenu] = useState<"menu" | "plan" | null>(null);
  const [favorite, setFavorite] = useState(recipe.favorite);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pressed = useRef(false);
  const { toast, run } = useToast();
  useEffect(() => setFavorite(recipe.favorite), [recipe.favorite]);

  const onTouchStart = (e: TouchEvent) => {
    pressed.current = false;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    timer.current = setTimeout(() => {
      pressed.current = true;
      navigator.vibrate?.(10);
      setMenu("menu");
    }, LONG_PRESS_MS);
  };
  const onTouchMove = (e: TouchEvent) => {
    const from = start.current;
    // Przewijanie listy to nie przytrzymanie
    if (from && Math.hypot(e.touches[0].clientX - from.x, e.touches[0].clientY - from.y) > 10) clearTimeout(timer.current);
  };
  const onTouchEnd = () => clearTimeout(timer.current);

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
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (pressed.current) e.preventDefault(); // puszczenie palca po przytrzymaniu nie otwiera przepisu
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
