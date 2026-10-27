// Czytanie na głos wbudowanym głosem telefonu (bez AI, bez internetu, za darmo).
// iOS ma polskie głosy (np. "Zosia"); gdy ich brak, czyta głos domyślny.

const PREFERENCE_KEY = "read-aloud";

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

function polishVoice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("pl"));
}

export function speak(text: string) {
  if (!canSpeak) return;
  speechSynthesis.cancel(); // poprzedni krok przestaje być czytany
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pl-PL";
  const voice = polishVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}

// Czy czytać kroki na głos - zapamiętane między gotowaniami
export function readAloudPreference(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveReadAloudPreference(on: boolean) {
  try {
    localStorage.setItem(PREFERENCE_KEY, on ? "1" : "0");
  } catch {
    // tryb prywatny - zapomnimy przy następnym gotowaniu
  }
}
