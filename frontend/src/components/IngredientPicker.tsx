import { useEffect, useState } from "react";
import { api, Ingredient } from "../api";

interface Props {
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
}

// Pole do wybierania składników: wpisujesz, dostajesz podpowiedzi z bazy,
// wybrane składniki pokazują się jako "chipsy" do usunięcia jednym tapnięciem.
export default function IngredientPicker({ value, onChange, placeholder }: Props) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Ingredient[]>([]);

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    // Czekamy chwilę po ostatnim znaku, żeby nie pytać serwera przy każdej literze
    const timer = setTimeout(() => {
      api.listIngredients(q).then((list) => setSuggestions(list.filter((i) => !value.includes(i.name))));
    }, 200);
    return () => clearTimeout(timer);
  }, [text, value]);

  const add = (name: string) => {
    const clean = name.trim().toLowerCase();
    if (clean && !value.includes(clean)) onChange([...value, clean]);
    setText("");
    setSuggestions([]);
  };

  return (
    <div className="picker">
      {value.length > 0 && (
        <div className="chips">
          {value.map((name) => (
            <button key={name} type="button" className="chip" onClick={() => onChange(value.filter((n) => n !== name))}>
              {name} ✕
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? "Dodaj składnik…"}
          autoCapitalize="none"
          enterKeyHint="done"
        />
      </form>
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.slice(0, 8).map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => add(s.name)}>
                {s.name} <span className="muted">({s.recipe_count})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
