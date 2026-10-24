import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

// Krótkie komunikaty u góry ekranu, wspólne dla całej aplikacji:
// - toast("Zapisane!") - zwykła informacja albo błąd,
// - undoable("Usunięto przepis", commit, undo) - zmiana wykona się za kilka sekund,
//   chyba że użytkownik stuknie "Cofnij" (zamiast pytania "Na pewno?").

const SHOW_MS = 3000;
const UNDO_MS = 5000;

interface Message {
  id: number;
  text: string;
  undo?: () => void;
}

interface Toasts {
  toast: (text: string) => void;
  undoable: (text: string, commit: () => unknown, undo?: () => void) => void;
  // Uruchamia akcję i pokazuje jej błąd jako komunikat (zamiast cichej porażki)
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
}

const ToastContext = createContext<Toasts | null>(null);

export function useToast(): Toasts {
  const toasts = useContext(ToastContext);
  if (!toasts) throw new Error("useToast działa tylko wewnątrz ToastProvider");
  return toasts;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Zmiana czekająca na wykonanie - wykonujemy ją od razu, gdy pojawi się kolejna
  const pending = useRef<{ id: number; commit: () => unknown } | null>(null);

  const flush = useCallback(() => {
    const waiting = pending.current;
    pending.current = null;
    if (waiting) Promise.resolve(waiting.commit()).catch((e: Error) => show({ id: Date.now(), text: e.message }, SHOW_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = (next: Message, ms: number) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => {
      if (pending.current?.id === next.id) flush();
      setMessage((current) => (current?.id === next.id ? null : current));
    }, ms);
  };

  // Wyjście z aplikacji (np. przełączenie na inną) nie może zgubić zmiany czekającej na "Cofnij"
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const toasts: Toasts = {
    toast: (text) => show({ id: Date.now(), text }, SHOW_MS),
    undoable: (text, commit, undo) => {
      flush();
      const id = Date.now();
      pending.current = { id, commit };
      show(
        {
          id,
          text,
          undo: () => {
            pending.current = null;
            undo?.();
            setMessage(null);
          },
        },
        UNDO_MS,
      );
    },
    run: async (action) => {
      try {
        return await action();
      } catch (e) {
        show({ id: Date.now(), text: (e as Error).message }, SHOW_MS);
        return undefined;
      }
    },
  };

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message.text}
          {message.undo && (
            <button type="button" className="toast-undo" onClick={message.undo}>
              Cofnij
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
