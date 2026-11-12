// "~520 kcal · B 30 g · T 20 g · W 45 g" - szacunek AI na 1 porcję
export function nutritionText(n) {
    if (n.kcal == null)
        return "";
    const parts = [`~${n.kcal} kcal`];
    if (n.protein != null)
        parts.push(`B ${n.protein} g`);
    if (n.fat != null)
        parts.push(`T ${n.fat} g`);
    if (n.carbs != null)
        parts.push(`W ${n.carbs} g`);
    return parts.join(" · ");
}
