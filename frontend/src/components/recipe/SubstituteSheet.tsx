import { useEffect, useState } from "react";
import { api } from "../../api";
import Sheet from "../Sheet";

// "Nie mam śmietany - czym zastąpić?" - odpowiedź AI dla tego konkretnego przepisu.
// Otwierane przytrzymaniem składnika na liście.
export default function SubstituteSheet({ recipeId, ingredient, onClose }: { recipeId: number; ingredient: string; onClose: () => void }) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .substitute(recipeId, ingredient)
      .then((r) => setAnswer(r.text))
      .catch((e: Error) => setError(e.message));
  }, [recipeId, ingredient]);

  return (
    <Sheet title={`Czym zastąpić: ${ingredient}?`} onClose={onClose} list>
      {error ? <p className="error">{error}</p> : answer ? (
        <div className="substitute">
          {answer.split("\n").filter((line) => line.trim()).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : <p className="muted">Pytam AI…</p>}
    </Sheet>
  );
}
