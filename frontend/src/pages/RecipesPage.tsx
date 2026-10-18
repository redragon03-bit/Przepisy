import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, RecipeSummary } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";

// Strona główna: lista przepisów z wyszukiwaniem po nazwie i po składnikach.
export default function RecipesPage() {
  const [q, setQ] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.listRecipes(q, ingredients).then(setRecipes);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, ingredients]);

  return (
    <>
      <header className="topbar">
        <h1>Przepisy</h1>
        <Link to="/nowy" className="button small">
          + Ręcznie
        </Link>
      </header>
      <div className="search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwie…" />
        <button type="button" className={showFilters || ingredients.length ? "active" : ""} onClick={() => setShowFilters(!showFilters)}>
          🥕{ingredients.length ? ` ${ingredients.length}` : ""}
        </button>
      </div>
      {(showFilters || ingredients.length > 0) && (
        <section className="box">
          <p className="muted small">Przepisy, które mają wszystkie te składniki:</p>
          <IngredientPicker value={ingredients} onChange={setIngredients} />
        </section>
      )}
      {recipes === null ? (
        <p className="muted center">Ładowanie…</p>
      ) : recipes.length === 0 ? (
        <p className="muted center">
          {q || ingredients.length ? "Nic nie znaleziono." : "Nie masz jeszcze przepisów. Dodaj pierwszy w zakładce „Dodaj”."}
        </p>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </>
  );
}
