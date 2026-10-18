import { Link } from "react-router-dom";
import { formatMinutes, RecipeSummary } from "../api";

export default function RecipeCard({ recipe, children }: { recipe: RecipeSummary; children?: React.ReactNode }) {
  return (
    <Link to={`/przepis/${recipe.id}`} className="card">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" loading="lazy" />
      ) : (
        <div className="card-placeholder">🍽️</div>
      )}
      <div className="card-body">
        <strong>{recipe.title}</strong>
        {recipe.total_minutes ? <span className="muted">⏱ {formatMinutes(recipe.total_minutes)}</span> : null}
        {children}
      </div>
    </Link>
  );
}
