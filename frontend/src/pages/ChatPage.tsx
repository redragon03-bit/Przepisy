import { useEffect, useRef, useState } from "react";
import AutoTextarea from "../components/AutoTextarea";
import NewRecipeCard from "../components/NewRecipeCard";
import RecipeCard from "../components/RecipeCard";
import { newConversation, retryChat, sendChat, useChat } from "../lib/chatStore";

// Czat z asystentem: "mam ochotę na...", "coś bez ryżu". Asystent poleca przepisy z bazy,
// a gdy nic nie pasuje - wymyśla nowy, który można zapisać.
// Rozmowa i trwające zapytanie są w lib/chatStore.ts, więc zmiana zakładki ich nie kasuje.

const SUGGESTIONS = [
  "Mam ochotę na coś słodkiego",
  "Szybki obiad do 30 minut",
  "Co zrobię z tego, co mam w domu?",
  "Coś lekkiego na kolację, bez mięsa",
];

export default function ChatPage({ aiEnabled }: { aiEnabled: boolean }) {
  const { messages, thinking, error } = useChat();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Po wejściu na ekran od razu na dół rozmowy, potem płynnie przy nowych wiadomościach
    bottom.current?.scrollIntoView({ behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [messages, thinking]);

  const send = (question: string) => {
    if (sendChat(question)) setText("");
  };

  // Po błędzie ostatnia wiadomość użytkownika została bez odpowiedzi - wysyłamy ją jeszcze raz
  const canRetry = error && !thinking && messages[messages.length - 1]?.role === "user";

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
          <button type="button" className="link" onClick={newConversation}>
            Nowa rozmowa
          </button>
        )}
      </header>

      {messages.length === 0 && (
        <section className="box">
          <p className="small">
            Napisz, na co masz ochotę albo czego nie chcesz. Najpierw poszukam w Twoich przepisach, a jeśli nic nie pasuje,
            wymyślę nowy. Biorę pod uwagę to, co masz w domu (Zakupy → W domu).
          </p>
          <div className="chat-suggestions">
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
            {m.recipe && <NewRecipeCard recipe={m.recipe} />}
          </div>
        ))}
        {thinking && (
          <div className="bubble assistant typing" role="status" aria-label="Myślę…">
            <i />
            <i />
            <i />
          </div>
        )}
        {error && (
          <p className="error small">
            {error}{" "}
            {canRetry && (
              <button type="button" className="link" onClick={retryChat}>
                Spróbuj ponownie
              </button>
            )}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {/* Pole rośnie z treścią; Enter wysyła (nowa linia nie jest w czacie potrzebna) */}
        <AutoTextarea
          singleLine
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(text)}
          placeholder="Na co masz ochotę?"
          enterKeyHint="send"
          aria-label="Wiadomość"
        />
        <button className="primary chat-send" disabled={thinking || !text.trim()} aria-label="Wyślij">
          ↑
        </button>
      </form>
    </>
  );
}
