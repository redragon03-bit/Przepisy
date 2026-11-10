# Zmiany

## 0.9.7

- Import nie wisi już bez końca na „czytam przepis…”: każde zapytanie do AI w tle ma limit
  czasu, a import trwający ponad 15 minut kończy się błędem z przyciskiem „Ponów”.
- W „Ostatnich importach” można anulować trwający import („anuluj”) i usunąć nieudany
  („usuń z listy”).

## 0.9.6

- Promocje: wybór działu (np. tylko „Mięso i ryby”), przycisk × w wyszukiwaniu,
  wybrane sklepy, grupy i dział zapamiętane w telefonie (też w „Z promocji”).
- Ulubione: w okienku produktu „⭐ Ulubione” – takie produkty (każda marka, np. każda herbata)
  są na górze w sekcji „⭐ Ulubione w promocji”.
- Trafniejsze ikonki (herbata ☕, jajka 🥚, kurczak 🍗…), dział po pełnej nazwie
  („owoce mrożone” to mrożonki); przy czytaniu stron AI musi zaznaczyć produkt (wycinki).

## 0.9.5

- Promocje pogrupowane w działy jak w sklepie (warzywa, pieczywo, mięso…), w dziale największe
  rabaty na górze; rabat w % widać przy cenie.
- Miniaturka przy produkcie: wycinek z gazetki (AI zaznacza produkt na stronie czytanej nocą),
  a gdy go nie ma – ikonka działu.
- Bez ceny doklejonej do nazwy i bez powtórzeń tego samego produktu z dwóch gazetek.

## 0.9.4

- Czat zna promocje: gdy pytasz o promocje albo sklep (np. „obiad z mięsa z promocji
  z Kauflandu”), AI dostaje aktualne jedzenie w promocji z cenami i proponuje z niego dania.

## 0.9.3

- „Co ugotuję?” → „Z promocji”: przyciski sklepów – schowany sklep znika z plakietek,
  a przepis tylko z jego promocjami znika z sekcji; „Nowe pomysły” zaczynają od wybranych sklepów.

## 0.9.2

- Promocje: z Blixa tylko oferty z ceną (krótsza lista, 2–3 razy mniej pracy dla AI);
  gazetki odczytane wcześniej bez cen są czytane jeszcze raz.
- Promocje: gazetki czytane na zmianę ze wszystkich sklepów, żeby Kaufland nie czekał
  na wszystkie gazetki Biedronki; na ekranie widać, którą gazetkę AI teraz czyta.
- Czytanie gazetek najpierw lżejszym modelem Gemini (wyższe darmowe limity).
- Promocje: nocą (1:00–6:00) AI czyta obrazki stron głównych gazetek tygodnia z Blixa,
  do 50 stron na noc, i dopisuje produkty z cenami; strony już przeczytane pomija.
- Promocje: tylko jedzenie, pieluchy i chusteczki dla dzieci oraz środki czystości, zawsze z ceną;
  przyciski 🍎 Jedzenie / 👶 Dziecko / 🧽 Czystość chowają grupę na liście.

## 0.9.1

- Lista zakupów: „Wyślij do HA” nie kończy się błędem 400, gdy lista zadań w HA
  nie obsługuje opisu pozycji (wysyłka ponawiana bez opisu).
- iPhone: pole daty nie wystaje poza okno.
- Aktualizacje zależności: FastAPI 0.162.0, SQLAlchemy 2.1.6, pytest 9.2.0,
  ruff 0.17.3, pakiety frontendu (grupa „all”) oraz akcje GitHub
  (upload-artifact 7, docker/build-push-action 7, docker/login-action 4).

## 0.9.0

- Promocje z gazetek (Lidl, Biedronka, Kaufland) i przepisy z produktów w promocji.
