// "Jak używać": krótki przewodnik po najważniejszych funkcjach i miejscach, gdzie je znaleźć.
// Sam tekst - bez wywołań API, więc działa też bez internetu.

const SECTIONS: { icon: string; title: string; items: string[] }[] = [
  {
    icon: "➕",
    title: "Dodaj",
    items: [
      "Wklej link do strony z przepisem albo do filmu (TikTok, YouTube, Instagram) – AI odczyta przepis, przetłumaczy go na polski i przeliczy miary na gramy i mililitry.",
      "Możesz też wkleić sam tekst przepisu albo dodać zdjęcia czy screeny (np. z książki).",
      "Jeśli link jest już w bazie (nawet zapisany inaczej), aplikacja to powie i pokaże przepis.",
    ],
  },
  {
    icon: "🏷️",
    title: "Promocje",
    items: [
      "Więcej → Promocje: jedzenie, pieluchy i środki czystości w promocji z gazetek Lidla, Biedronki i Kauflandu, pogrupowane na sklepy. Przyciski sklepów i grup (🍎 / 👶 / 🧽) chowają je na liście. Produkty są w działach jak w sklepie, największe rabaty na górze; zdjęcie to wycinek z gazetki (gdy AI przeczytało stronę), inaczej ikonka działu. Wybrane sklepy i dział aplikacja pamięta. Stuknij produkt → „⭐ Ulubione”, a takie rzeczy (każdej marki) będą na górze listy. Stuknij produkt, żeby dodać go do listy zakupów.",
      "Aplikacja sama sprawdza nowe gazetki co 12 godzin, a AI czyta tylko te, których jeszcze nie było. Nocą (1:00–6:00) czyta też obrazki stron głównych gazetek, do 50 stron na noc, żeby uzupełnić ceny. Sklepy zmienisz w opcjach dodatku (promo_stores).",
      "W „Co ugotuję?” sekcja „Z promocji” pokazuje Twoje przepisy ze składnikami w promocji, a „✨ Nowe pomysły z promocji” prosi AI o 3 nowe obiady.",
      "Przy składnikach przepisu i na liście zakupów plakietka 🏷️ pokazuje, gdzie produkt jest teraz taniej.",
    ],
  },
  {
    icon: "📖",
    title: "Przepisy",
    items: [
      "Szukaj po nazwie, składniku, opisie, krokach albo notatkach – „zurawina” znajdzie też „żurawinę”.",
      "„Filtry” obok wyszukiwania: kategorie, ❤️ ulubione, sortowanie i przepisy z wybranymi składnikami.",
      "W przepisie: +/− zmienia liczbę porcji, stuknięcie w składnik go odhacza, a przytrzymanie podpowiada zamiennik.",
      "❤️ dodaje przepis do ulubionych, a ⋯ obok niego to edycja, zaplanowanie, dodanie do zakupów, udostępnienie (tekst albo obrazek), wariant od AI (np. wege), zdjęcie, kalorie.",
      "„✅ Ugotowane” zapisuje gotowanie w dzienniku – z oceną, notatką i zdjęciem.",
      "⋯ → Zdjęcie: zdjęcie z telefonu albo „🔍 Znajdź w internecie”. Gdy żadne z propozycji nie pasuje, „🔄 Pokaż inne” szuka kolejnych, a „📷 Własne zdjęcie” wgrywa Twoje.",
      "W edycji „+ Sekcja” dzieli składniki i kroki na części (np. „Omlet”, „Krem”), a „✨ Podziel na sekcje (AI)” robi to za Ciebie. Kolejność zmienisz, przeciągając za numer kroku albo ⠿.",
      "Ustawienia → Porządki → „🧩 Podziel przepisy na sekcje” przechodzi po kolei przez stare przepisy: obok siebie jest przepis teraz i propozycja AI, do wyboru Pomiń albo Akceptuj.",
    ],
  },
  {
    icon: "👨‍🍳",
    title: "Tryb gotowania",
    items: [
      "Pomarańczowy przycisk „👨‍🍳 Gotuj” w prawym dolnym rogu przepisu: duża czcionka, jeden krok na ekranie, pasek postępu kroków.",
      "Przy każdym kroku widać składniki, których potrzebuje.",
      "„10 min” w kroku to przycisk minutnika. W ostatniej minucie minutnik robi się żółty, po czasie czerwony; „+1” dodaje minutę. Gdy minutnik się skończy, przyjdzie też powiadomienie z Home Assistant.",
      "🔊 czyta krok na głos. Ekran nie gaśnie, a aplikacja pamięta, na którym kroku skończyłeś.",
    ],
  },
  {
    icon: "💬",
    title: "Czat",
    items: [
      "Zapytaj, np. „mam ochotę na coś ostrego bez ryżu” – czat poleci Twoje przepisy albo wymyśli nowy, który zapiszesz jednym stuknięciem.",
      "Czat zna promocje z gazetek: napisz np. „obiad z mięsa z promocji z Kauflandu”.",
    ],
  },
  {
    icon: "🛒",
    title: "Zakupy",
    items: [
      "Na górze przełącznik: „Do kupienia” to lista zakupów, „W domu” to spiżarnia – to, co masz teraz w domu.",
      "Lista jest ułożona według działów w sklepie i działa bez internetu. Przesuń pozycję w lewo, żeby ją usunąć (z możliwością cofnięcia).",
      "Stuknięcie odhacza pozycję: kupione jedzenie od razu trafia do spiżarni (chemia i rzeczy dla domu – nie). „Cofnij” albo ponowne stuknięcie zabiera je ze spiżarni.",
      "Dopisanie czegoś do listy (ręcznie, z promocji albo w Home Assistant) znaczy, że tego nie masz – produkt znika ze spiżarni. Z przepisu do listy trafia tylko to, czego w spiżarni nie ma, a „zawsze w domu” (sól, olej…) jest pomijane.",
      "Listę można wysłać do Home Assistant; odhaczone tam też trafia do spiżarni.",
    ],
  },
  {
    icon: "🏠",
    title: "Spiżarnia (Zakupy → W domu)",
    items: [
      "Produkty są w działach jak w sklepie, a te z bliskim terminem – na górze w „⏰ Zużyj najpierw”.",
      "Stuknij produkt, żeby ustawić, do kiedy go zużyć, albo „Kończy się – dopisz do zakupów”. Przesuń w lewo, gdy się skończy („Zużyte”, z możliwością cofnięcia).",
      "Coś kupione bez listy dopiszesz w polu na górze.",
      "Spiżarnia działa w całej aplikacji: składnik, którego nie masz, ma w przepisie znacznik „brak”, „Co ugotuję?” szuka przepisów z tego, co masz, a czat i plan od AI biorą ją pod uwagę.",
      "📷 Dodaj z paragonu (włączasz w Ustawieniach → Spiżarnia): zrób zdjęcie paragonu (długi – w 2–3 częściach). AI odczyta produkty, wagę i podpowie termin. Przed dodaniem sprawdzasz listę: odznacz zbędne, popraw nazwy – aplikacja zapamięta poprawki na następny paragon z tego sklepu. Zdjęcie nie jest zapisywane.",
      "Każde konto ma swoją spiżarnię, a paragony włącza się osobno na każdym koncie.",
    ],
  },
  {
    icon: "📅",
    title: "Plan (pod „Więcej”)",
    items: [
      "Przepisy na każdy dzień tygodnia; „N por.” ustawia, na ile osób gotujesz.",
      "„✨ Zaplanuj z AI” układa tydzień z Twoich przepisów, a „🛒 Składniki z tygodnia” robi z niego listę zakupów.",
      "Przepisy z planu na 7 dni telefon trzyma w pamięci – otworzysz je bez internetu.",
    ],
  },
  {
    icon: "🥕",
    title: "Co ugotuję? (pod „Więcej”)",
    items: [
      "Przepisy z tego, co masz w spiżarni. „Może brakować” pozwala dopuścić 1–3 brakujące składniki.",
      "Przepisy, które zużyją produkty z krótkim terminem, są na górze („Zużyj najpierw”). Spiżarnię zmienisz linkiem „Zmień” (Zakupy → W domu).",
    ],
  },
  {
    icon: "⚙️",
    title: "Ustawienia (pod „Więcej”)",
    items: [
      "Wygląd: wielkość tytułów, tekstu, składników i zakupów, małych napisów, trybu gotowania, minutnika, kółek i odstępów – każda osobno, co 5% (przycisk „Przywróć 100%” cofa wszystko).",
      "Promocje: przełącznik „Ceny z gazetek przy składnikach” chowa plakietki 🏷️ w przepisach i na liście zakupów.",
      "Spiżarnia: przełącznik „Dodawanie z paragonu” (domyślnie wyłączony, osobno dla każdego konta; do 10 paragonów dziennie).",
      "„Zawsze w domu” (sól, olej…), kopia zapasowa i przywracanie, porządki w składnikach i kategoriach.",
      "Adres kalendarza z planem posiłków – do Home Assistant, Google albo iPhone'a.",
    ],
  },
  {
    icon: "🏠",
    title: "Home Assistant",
    items: [
      "Lista zakupów w HA, czujnik „Dziś na obiad”, powiadomienia z minutników i plan posiłków w kalendarzu HA.",
    ],
  },
  {
    icon: "📶",
    title: "Bez internetu",
    items: [
      "Ikona z ekranu początkowego otwiera się także bez sieci – z przepisami, które ostatnio oglądałeś, i z planem na tydzień.",
      "Żeby dodawać i zapisywać zmiany, potrzebny jest internet i włączony Tailscale.",
      "Podczas aktualizacji dodatku albo restartu Home Assistanta zobaczysz ekran „Trwa aktualizacja” – aplikacja sama się odświeży, gdy serwer wróci. „Pracuj bez połączenia” pozwala w tym czasie korzystać z listy zakupów i zapisanych przepisów.",
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <header className="topbar">
        <h1>Jak używać</h1>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.title} className="box">
          <h2>
            {section.icon} {section.title}
          </h2>
          <ul className="help-list">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
