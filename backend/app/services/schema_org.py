"""Eksport przepisów w formacie schema.org/Recipe (JSON-LD).

To ten sam format, w którym strony z przepisami opisują je dla Google. Rozumieją go
inne aplikacje (Mealie, Tandoor, Paprika), więc plik pozwala przenieść przepisy,
gdyby kiedyś trzeba było zmienić aplikację. Zdjęć w pliku nie ma - są w kopii ZIP.
"""

from ..models import Recipe


def _duration(minutes: int | None) -> str | None:
    """15 -> "PT15M" (czas w formacie ISO 8601, takiego używa schema.org)."""
    return f"PT{minutes}M" if minutes else None


def recipe_json(recipe: Recipe) -> dict:
    data: dict = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": recipe.title,
        "description": recipe.description or None,
        "recipeYield": recipe.servings or None,
        "prepTime": _duration(recipe.prep_minutes),
        "cookTime": _duration(recipe.cook_minutes),
        "totalTime": _duration(recipe.total_minutes),
        "recipeCategory": [c.name for c in recipe.categories] or None,
        "recipeIngredient": [ri.text for ri in recipe.ingredients],
        "recipeInstructions": [{"@type": "HowToStep", "text": step.text} for step in recipe.steps],
        "url": recipe.source_url or None,
        "dateCreated": recipe.created_at.date().isoformat() if recipe.created_at else None,
        "comment": [{"@type": "Comment", "text": recipe.notes}] if recipe.notes else None,
    }
    if recipe.kcal is not None:
        data["nutrition"] = {
            "@type": "NutritionInformation",
            "servingSize": "1 porcja",
            "calories": f"{recipe.kcal} kcal",
            **{f"{name}Content": f"{value} g" for name, value in
               (("protein", recipe.protein), ("fat", recipe.fat), ("carbohydrate", recipe.carbs))
               if value is not None},
        }
    if recipe.rating:
        data["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": recipe.rating, "ratingCount": 1}
    # Puste pola pomijamy - inne aplikacje lepiej znoszą brak pola niż null
    return {key: value for key, value in data.items() if value is not None}


def export(recipes: list[Recipe]) -> list[dict]:
    return [recipe_json(r) for r in recipes]
