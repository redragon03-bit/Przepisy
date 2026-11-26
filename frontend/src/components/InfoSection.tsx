import { api, AuthStatus } from "../api";
import { useToast } from "../lib/toast";

const AI_NAMES: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", xai: "Grok", groq: "Groq", mistral: "Mistral" };

/** Dostawcy AI po kolei, np. "Claude → Gemini (2 klucze)"; pusty napis, gdy AI wyłączone. */
export function aiProviders(auth: AuthStatus): string {
  return auth.ai_providers.map((p) => (p === "gemini" && auth.gemini_keys > 1 ? `Gemini (${auth.gemini_keys} klucze)` : AI_NAMES[p] ?? p)).join(" → ");
}

/** Ustawienia → Informacje: AI, Home Assistant, połączenie, kalendarz. */
export default function InfoSection({ auth }: { auth: AuthStatus }) {
  const { toast, run } = useToast();
  const owner = auth.is_owner;
  const ai = aiProviders(auth);

  // Adres z tokenem - kalendarz pobiera go sam, bez logowania. `app` = adres do linków w wydarzeniach.
  const copyCalendar = async () => {
    const link = await run(() => api.calendarLink());
    if (!link) return;
    const url = `${location.origin}${link.path}&app=${encodeURIComponent(location.origin)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Skopiowano adres kalendarza.");
    } catch {
      window.prompt("Adres kalendarza:", url);
    }
  };

  return (
    <section className="box small">
      <p>AI (pytane po kolei): {ai ? ai + " ✅" : "wyłączone (brak klucza API)"}</p>
      {owner && <p>Home Assistant: {auth.ha_enabled ? "wysyłanie listy zakupów działa ✅" : "nie skonfigurowane"}</p>}
      {owner && <p>Powiadomienia z minutników: {auth.notify_enabled ? "przez Home Assistant ✅" : "wyłączone (opcja ha_notify dodatku)"}</p>}
      <p>
        Połączenie:{" "}
        {window.isSecureContext ? "https ✅" : "http – bez pracy offline i bez utrzymywania włączonego ekranu (patrz README, HTTPS)"}
      </p>
      {owner && (
        <p>
          Plan posiłków jako kalendarz (HA, Google, iPhone):{" "}
          <button type="button" className="link" onClick={copyCalendar}>
            kopiuj adres
          </button>
        </p>
      )}
      <p className="muted">Na iPhonie: w Safari stuknij „Udostępnij” → „Do ekranu początkowego”, żeby mieć aplikację jako ikonę.</p>
    </section>
  );
}
