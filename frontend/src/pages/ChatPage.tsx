import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AiRecipe, api, ChatMessage, formatMinutes } from "../api";
import RecipeCard from "../components/RecipeCard";
import { nutritionText } from "../lib/nutrition";

// Czat z asystentem: "mam ochotę na...", "coś bez ryżu". Asystent poleca przepisy z bazy,
// a gdy nic nie pasuje - wymyśla nowy, który można zapisać.
// Rozmowę trzymamy w pamięci karty przeglądarki, żeby przejście do przepisu jej nie kasowało.
const STORAGE_KEY = "chat-messages";

const SUGGESTIONS = [
  "Mam ochotę na coś słodkiego",
  "Szybki obiad do 30 minut",
  "Co zrobię z tego, co mam w domu?",
  "Coś lekkiego na kolację, bez mięsa",
];

function loadSaved(): ChatMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function NewRecipe({ recipe }: { recipe: AiRecipe }) {
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      setSavedId((await api.saveChatRecipe(recipe)).id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const meta = [recipe.servings, formatMinutes(recipe.total_minutes), nutritionText(recipe)].filter(Boolean);
  return (
    <div className="box new-recipe">
      <strong>{recipe.title}</strong>
      {recipe.description && <p className="small">{recipe.description}</p>}
      {meta.length > 0 && <p className="muted small">{meta.join(" · ")}</p>}
      <details>
        <summary>Składniki i przygotowanie</summary>
        <ul>
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>{ing.text}</li>
          ))}
        </ul>
        <ol>
          {recipe.steps.map((step, i) => (
            <li key={i}>{step.text}</li>
          ))}
        </ol>
      </details>
      {savedId ? (
        <Link to={`/przepis/${savedId}`} className="button wide">
          ✅ Zapisany - otwórz przepis
        </Link>
      ) : (
        <button type="button" className="primary wide" disabled={saving} onClick={save}>
          {saving ? "Zapisuję…" : "💾 Zapisz przepis"}
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

export default function ChatPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadSaved);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // brak dostępu do pamięci przeglądarki - rozmowa zniknie po wyjściu, trudno
    }
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = async (question: string) => {
    if (!question.trim() || thinking) return;
    const history: ChatMessage[] = [...messages, { role: "user", text: question.trim() }];
    setMessages(history);
    setText("");
    setError("");
    setThinking(true);
    try {
      const reply = await api.chat(history);
      setMessages([...history, { role: "assistant", text: reply.text, recipe: reply.new_recipe, recipes: reply.recipes }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  if (!aiEnabled) {
    return (
      <>
        <header className="topbar">
          <h1>Czat</h1>
        </header>
        <p className="muted center">Czat wymaga AI - dodaj klucz Gemini albo Anthropic w ustawieniach dodatku.</p>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>Czat</h1>
        {messages.length > 0 && (
          <button type="button" className="link" onClick={() => setMessages([])}>
            Nowa rozmowa
          </button>
        )}
      </header>

      {messages.length === 0 && (
        <section className="box">
          <p className="small">
            Napisz, na co masz ochotę albo czego nie chcesz. Najpierw poszukam w Twoich przepisach, a jeśli nic nie pasuje,
            wymyślę nowy. Biorę pod uwagę to, co masz w domu (spiżarnia w „Co ugotuję?”).
          </p>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.recipes && m.recipes.length > 0 && (
              <div className="grid">
                {m.recipes.map((r) => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>
            )}
            {m.recipe && <NewRecipe recipe={m.recipe} />}
          </div>
        ))}
        {thinking && <div className="bubble assistant muted">Myślę…</div>}
        {error && <p className="error small">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Na co masz ochotę?" enterKeyHint="send" />
        <button className="primary" disabled={thinking || !text.trim()}>
          Wyślij
        </button>
      </form>
    </>
  );
}
