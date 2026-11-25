import { useSyncExternalStore } from "react";
import { api, ChatMessage } from "../api";

// Rozmowa z czatem żyje tutaj, poza ekranem Czat. Dzięki temu przejście na inną zakładkę
// nie przerywa odpowiedzi: zapytanie leci dalej, a po powrocie odpowiedź już czeka.
// Wiadomości zapisujemy w localStorage - iPhone potrafi zamknąć aplikację z ekranu
// głównego w tle, a po ponownym otwarciu rozmowa ma być na miejscu.
const STORAGE_KEY = "chat-messages";
// Serwer odpowiada najpóźniej po ok. 50 s; dłużej nie czekamy, żeby "Myślę…" nie wisiało w nieskończoność
const TIMEOUT_MS = 60_000;

export interface ChatState {
  messages: ChatMessage[];
  thinking: boolean;
  error: string;
}

function loadSaved(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function initialState(): ChatState {
  const messages = loadSaved();
  // Aplikacja zamknięta w trakcie odpowiedzi: ostatnie pytanie zostało bez odpowiedzi
  const unanswered = messages[messages.length - 1]?.role === "user";
  return { messages, thinking: false, error: unanswered ? "Odpowiedź została przerwana." : "" };
}

let state: ChatState = initialState();
let pending: AbortController | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  if (patch.messages) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages));
    } catch {
      // brak dostępu do pamięci przeglądarki - rozmowa zniknie po zamknięciu, trudno
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChat(): ChatState {
  return useSyncExternalStore(subscribe, () => state);
}

export async function askChat(history: ChatMessage[]) {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  set({ error: "", thinking: true });
  try {
    const reply = await api.chat(history, controller.signal);
    if (pending === controller) {
      set({ messages: [...history, { role: "assistant", text: reply.text, recipe: reply.new_recipe, recipes: reply.recipes }] });
    }
  } catch (e) {
    if (pending === controller) {
      if (timedOut) set({ error: "AI nie odpowiedziało na czas - spróbuj jeszcze raz." });
      else if (!controller.signal.aborted) set({ error: (e as Error).message });
    }
  } finally {
    clearTimeout(timer);
    // Gdy w międzyczasie ruszyło nowe zapytanie, to ono decyduje o "Myślę…"
    if (pending === controller) {
      pending = null;
      set({ thinking: false });
    }
  }
}

export function sendChat(question: string) {
  if (!question.trim() || state.thinking) return false;
  const history: ChatMessage[] = [...state.messages, { role: "user", text: question.trim() }];
  set({ messages: history });
  askChat(history);
  return true;
}

export function retryChat() {
  askChat(state.messages);
}

export function newConversation() {
  pending?.abort();
  pending = null;
  set({ messages: [], thinking: false, error: "" });
}
