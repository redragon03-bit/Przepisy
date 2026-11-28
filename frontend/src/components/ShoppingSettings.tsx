import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ReceiptSettings } from "../api";
import { usePromoBadges } from "../lib/promoBadges";
import { useToast } from "../lib/toast";

/** Ustawienia → Zakupy i promocje: ceny z gazetek przy składnikach i dodawanie z paragonu. */
export default function ShoppingSettings() {
  const { run } = useToast();
  const [showPromos, setShowPromos] = usePromoBadges();
  const [receipts, setReceipts] = useState<ReceiptSettings | null>(null);

  useEffect(() => {
    api.receiptSettings().then(setReceipts, () => undefined);
  }, []);

  return (
    <>
      <section className="box">
        <label className="toggle switch-row">
          <span className="grow">
            Ceny z gazetek przy składnikach
            <span className="muted small block">Plakietki „🏷️ Biedronka 5,99 zł” w przepisach i na liście zakupów.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={showPromos}
            onChange={(e) => setShowPromos(e.target.checked)}
            aria-label="Pokazuj ceny z promocji przy składnikach"
          />
        </label>
      </section>

      {receipts && (
        <section className="box">
          <label className="toggle switch-row">
            <span className="grow">
              Dodawanie z paragonu
              <span className="muted small block">
                {receipts.ai_enabled
                  ? `Zakupy → W domu → „📷 Dodaj z paragonu”: AI odczytuje zdjęcie paragonu, a Ty sprawdzasz listę. Do ${receipts.daily_limit} paragonów dziennie (dziś: ${receipts.used_today}). Tylko na tym koncie.`
                  : "Paragon odczytuje AI - najpierw ustaw klucz API do AI w opcjach dodatku."}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={receipts.enabled}
              disabled={!receipts.ai_enabled}
              onChange={async (e) => {
                const next = await run(() => api.setReceiptsEnabled(e.target.checked));
                if (next) {
                  setReceipts(next);
                  // Zakupy czytają to ustawienie z pamięci telefonu, zanim zapytają serwer
                  try {
                    localStorage.setItem("receipts-enabled", JSON.stringify(next.enabled && next.ai_enabled));
                  } catch {
                    // prywatne okno - Zakupy i tak zapytają serwer
                  }
                }
              }}
              aria-label="Dodawanie produktów do „W domu” z paragonu"
            />
          </label>
        </section>
      )}
      <p className="muted small settings-note">
        „Zawsze w domu” (sól, olej…) jest na dole <Link to="/zakupy?widok=dom">Zakupy → W domu</Link>.
      </p>
    </>
  );
}
