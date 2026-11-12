# Zmiany

## 0.13.1

- Podczas aktualizacji dodatku albo restartu Home Assistanta zamiast czarnego ekranu jest ekran
  „Trwa aktualizacja”. Aplikacja co 3 s sprawdza serwer i sama się odświeża, gdy wróci
  (w formularzu przepisu tylko chowa ekran, żeby wpisany tekst nie przepadł).
  „Pracuj bez połączenia” pozwala w tym czasie korzystać z listy zakupów i zapisanych przepisów.
- Przy otwieraniu aplikacji od razu widać tło w kolorze aplikacji i „Ładowanie…”, a gdy skrypt
  aplikacji nie wczyta się w 10 s, też pokazuje się „Trwa aktualizacja”.
- Błędy AI (np. Gemini nie odpowiada) nie włączają tego ekranu - tylko prawdziwy brak serwera.

## 0.12.1

- Wybór zdjęcia przepisu: gdy żadne nie pasuje, są teraz przyciski „🔄 Pokaż inne” (szuka kolejnych,
  innym zapytaniem i bez zdjęć, które już były) i „📷 Własne zdjęcie” (wgrywa zdjęcie z telefonu).
  „Zamknij” chowa propozycje jak dawniej.

## 0.12.0

- Ustawienia → Wygląd: własna wielkość tytułów, tekstu, składników i zakupów, małych napisów,
  trybu gotowania, minutnika, kółek do odhaczania i odstępów, każda osobno, co 5% (50–200%).
  Działa od razu i zostaje w telefonie; „Przywróć 100%” cofa wszystko.
- Ustawienia wyglądu (z wielkością ekranu) trafiają do logu dodatku i do pliku appearance.json,
  żeby było wiadomo, co jest ustawione.

## 0.11.1

- Składniki w przepisie i lista zakupów mają mniejsze litery, takie jak linijka z kaloriami, i mniejsze kółka do odhaczania.
- Mniejsze odstępy między akapitami, nagłówkami, ramkami i krokami; mniejsze przyciski −/+ przy porcjach.

## 0.11.0

- Konta dla domowników (Ustawienia → Konta): właściciel dodaje konto z nazwą i hasłem.
  Przepisy są wspólne; plan posiłków, lista zakupów, spiżarnia, ulubione, oceny i dziennik
  gotowania każdy ma swoje. Domownik zmienia i usuwa tylko przepisy, które sam dodał,
  i nie widzi kopii zapasowych ani Home Assistant (lista w HA, kalendarz, czujnik
  i powiadomienia z minutników zostają przy właścicielu).
- Logowanie: nazwa konta + hasło. Właściciel loguje się jak dotąd hasłem z opcji dodatku
  (nazwę można zostawić pustą albo wpisać swoją - zmienisz ją w Ustawieniach → Konta).
  Dotychczasowe dane zostają przy właścicielu, zapamiętane logowanie działa dalej.
- Domownik może zmienić swoje hasło w Ustawieniach.

## 0.10.1

- Ustawienia → Promocje: przełącznik „Ceny z gazetek przy składnikach” (zapamiętany w telefonie)
  chowa żółte cenówki w przepisach i na liście zakupów.
- Poprawka: cena z gazetki trafia do składnika tylko wtedy, gdy nazwa produktu do niego pasuje
  (wcześniej sól i pieprz mogły dostać cenę schabu, bo AI źle opisało produkt).

## 0.10.0

- Nowy wygląd do kuchni: większe pola do odhaczania składników i zakupów (okrągłe, cały wiersz
  do stuknięcia), większe litery na listach i w trybie gotowania, czytelniejsze kolory (kontrast AA).
- Minutnik: ciemna pastylka z paskiem postępu i przyciskiem „+1” (dodaje minutę, przypomnienie w HA też),
  żółty w ostatniej minucie, czerwony po czasie. Nie zasłania już pola wpisywania w czacie.
- Przy składnikach, których nie ma w spiżarni, jest czerwony znaczek „brak”; promocje mają żółtą cenówkę.
- Przepis: przycisk „👨‍🍳 Gotuj” w rogu ekranu zamiast przycisku nad krokami.
- Tryb gotowania: pasek postępu kroków, odhaczanie składników przed startem, większe przyciski.
- Czat: animowane „piszę…”, pole rośnie z treścią, okrągły przycisk wysyłania.

## 0.9.8

- Import przy przeciążonym Gemini nie trwa już kilkanaście minut: jedno AI ma najwyżej
  ok. 3 minuty (razem z ponownymi próbami), potem import od razu pyta następne (Groq, Mistral).

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
