# Zmiany

## 0.9.2

- Promocje: z Blixa tylko oferty z ceną (krótsza lista, 2–3 razy mniej pracy dla AI);
  gazetki odczytane wcześniej bez cen są czytane jeszcze raz.
- Promocje: gazetki czytane na zmianę ze wszystkich sklepów, żeby Kaufland nie czekał
  na wszystkie gazetki Biedronki; na ekranie widać, którą gazetkę AI teraz czyta.
- Czytanie gazetek najpierw lżejszym modelem Gemini (wyższe darmowe limity).

## 0.9.1

- Lista zakupów: „Wyślij do HA” nie kończy się błędem 400, gdy lista zadań w HA
  nie obsługuje opisu pozycji (wysyłka ponawiana bez opisu).
- iPhone: pole daty nie wystaje poza okno.
- Aktualizacje zależności: FastAPI 0.162.0, SQLAlchemy 2.1.6, pytest 9.2.0,
  ruff 0.17.3, pakiety frontendu (grupa „all”) oraz akcje GitHub
  (upload-artifact 7, docker/build-push-action 7, docker/login-action 4).

## 0.9.0

- Promocje z gazetek (Lidl, Biedronka, Kaufland) i przepisy z produktów w promocji.
