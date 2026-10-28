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
    icon: "📖",
    title: "Przepisy",
    items: [
      "Szukaj po nazwie, składniku, opisie, krokach albo notatkach – „zurawina” znajdzie też „żurawinę”.",
      "„Filtry” obok wyszukiwania: kategorie, ❤️ ulubione, sortowanie i przepisy z wybranymi składnikami.",
      "W przepisie: +/− zmienia liczbę porcji, stuknięcie w składnik go odhacza, a przytrzymanie podpowiada zamiennik.",
      "❤️ dodaje przepis do ulubionych, a ⋯ obok niego to edycja, zaplanowanie, dodanie do zakupów, udostępnienie (tekst albo obrazek), wariant od AI (np. wege), zdjęcie, kalorie.",
      "„✅ Ugotowane” zapisuje gotowanie w dzienniku – z oceną, notatką i zdjęciem.",
    ],
  },
  {
    icon: "👨‍🍳",
    title: "Tryb gotowania",
    items: [
      "Przycisk „Tryb gotowania” nad krokami przepisu: duża czcionka, jeden krok na ekranie.",
      "Przy każdym kroku widać składniki, których potrzebuje.",
      "„10 min” w kroku to przycisk minutnika. Gdy minutnik się skończy, przyjdzie też powiadomienie z Home Assistant.",
      "🔊 czyta krok na głos. Ekran nie gaśnie, a aplikacja pamięta, na którym kroku skończyłeś.",
    ],
  },
  {
    icon: "💬",
    title: "Czat",
    items: [
      "Zapytaj, np. „mam ochotę na coś ostrego bez ryżu” – czat poleci Twoje przepisy albo wymyśli nowy, który zapiszesz jednym stuknięciem.",
    ],
  },
  {
    icon: "🛒",
    title: "Zakupy",
    items: [
      "Lista jest ułożona według działów w sklepie i działa bez internetu.",
      "Stuknij, żeby odhaczyć; przesuń w lewo, żeby usunąć (z możliwością cofnięcia).",
      "Produkty, które zawsze masz w domu, są pomijane. Kupione rzeczy z przepisów trafiają do spiżarni.",
      "Listę można wysłać do Home Assistant.",
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
      "Wpisz, co masz w domu (z terminem ważności) – zobaczysz, co z tego ugotujesz. Produkty z krótkim terminem są na górze („Zużyj najpierw”).",
    ],
  },
  {
    icon: "⚙️",
    title: "Ustawienia (pod „Więcej”)",
    items: [
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
