# Przepisy 🍲

Aplikacja do przechowywania przepisów. Wrzucasz link albo zdjęcie/screen, a aplikacja sama
odczytuje przepis, tłumaczy go na polski, przelicza miary na metryczne i zapisuje jako
instrukcję krok po kroku (razem ze zdjęciami ze strony). Potem możesz:

- szukać przepisów po nazwie, składnikach, krokach i notatkach,
- wpisać, co masz w domu (spiżarnia), i zobaczyć, co z tego ugotujesz („Co ugotuję?”),
- zapytać czat („mam ochotę na coś ostrego, ale bez ryżu”) – poleca Twoje przepisy albo
  wymyśla nowy, który zapisujesz jednym przyciskiem,
- gotować w trybie krok po kroku (duża czcionka, minutniki, ekran nie gaśnie),
- planować tydzień, robić listę zakupów (pomija to, co masz w domu) i wysyłać ją do HA,
- zobaczyć szacunkowe kalorie i makro na porcję, udostępnić przepis jako tekst.

Działa w przeglądarce (Safari na iPhonie, Chrome na Androidzie) i można ją dodać do ekranu
głównego jak zwykłą aplikację (PWA).

---

## Spis treści

1. [Jak to działa (architektura)](#jak-to-działa-architektura)
2. [Uruchomienie na komputerze (dla programisty)](#uruchomienie-na-komputerze-dla-programisty)
3. [Instalacja na Home Assistant](#instalacja-na-home-assistant)
4. [Dostęp z telefonu spoza domu](#dostęp-z-telefonu-spoza-domu)
5. [Dodanie do ekranu iPhone'a i Skrót „Udostępnij”](#dodanie-do-ekranu-iphonea-i-skrót-udostępnij)
6. [Struktura kodu](#struktura-kodu)
7. [Jak dopisać nową funkcję (przykład)](#jak-dopisać-nową-funkcję-przykład)
8. [Kopia zapasowa i przywracanie](#kopia-zapasowa-i-przywracanie)
9. [Znane ograniczenia](#znane-ograniczenia)

---

## Jak to działa (architektura)

```
Telefon (Safari / PWA)  ──HTTP(S)──▶  Jeden kontener Docker (port 8000)
                                       ├─ frontend/  React + TypeScript (zbudowany do plików statycznych)
                                       ├─ backend/   Python + FastAPI (API pod /api)
                                       │    ├─ recipe-scrapers → czyta dane przepisu ze strony
                                       │    └─ AI: Gemini albo Claude → tłumaczy, przelicza miary, czyta zdjęcia
                                       └─ /data      baza SQLite (przepisy.db) + folder images/
```

**Import z linku** przebiega tak (`backend/app/services/importer.py`):

1. Pobieramy stronę (`fetcher.py`).
2. Szukamy na niej ukrytych danych przepisu w standardzie schema.org (`scraper.py`) –
   ma je większość stron kulinarnych. Zbieramy też tekst strony i listę obrazków.
3. Wysyłamy to do AI (`ai.py`), które zwraca uporządkowany przepis po polsku: składniki
   (z „nazwą kanoniczną” do wyszukiwania, np. `mąka pszenna`), kroki, numer zdjęcia dania
   i zdjęć kroków.
4. Pobieramy wybrane zdjęcia (`images.py`) i zapisujemy wszystko w bazie.

Jedna strona może mieć **kilka przepisów** (np. „6 deserów chia”). AI zwraca wtedy listę
(`AiResult.recipes`), a każdy przepis trafia do bazy osobno.

**Kategorie** (np. „Deser”, „Zupa”) AI przypisuje przy imporcie, wybierając najpierw spośród
kategorii, które już są w bazie (domyślna lista: `services/categories.py`). Przepisom bez
kategorii można je nadać przyciskiem „Przypisz kategorie automatycznie” na liście
(`POST /api/categories/auto`), a ręcznie - w edycji przepisu.

**Pozostałe funkcje** (gdzie szukać kodu):

| Funkcja | Backend | Frontend |
|---|---|---|
| Lista zakupów (działy sklepu, działa offline, dwustronna synchronizacja z listą `todo` w HA) | `routers/shopping.py`, `services/shopping.py` | `pages/ShoppingPage.tsx` |
| Plan posiłków na tydzień; „Zaplanuj z AI” (w tle, wynik w pamięci serwera do zapisania) | `routers/plan.py`, `ai.suggest_plan` | `pages/PlanPage.tsx`, `components/PlanSuggestSheet.tsx` |
| Plan na dziś w HA: czujnik `sensor.przepisy_dzis` (stan = tytuły, atrybuty: składniki, plan na jutro), odświeżany co 15 min i po zmianie planu | `services/plan_sensor.py` | – |
| Import z wklejonego tekstu (to samo pole co link) | `POST /api/imports/text`, `ai.recipes_from_text` | `pages/ImportPage.tsx` |
| Import z filmu (TikTok, YouTube, Instagram): opis i napisy przez yt-dlp | `services/video.py` | – |
| Dziennik gotowania („Ugotowane” z oceną, notatką, zdjęciem; ocena przepisu = średnia z 5 ostatnich) | `models.CookLogEntry`, `POST/DELETE .../cooked` | `components/recipe/CookedSheet.tsx`, `CookLogSheet.tsx` |
| Warianty przepisu od AI („wege”, „na 8 osób”) - przy przepisie głównym, nie na liście | `Recipe.variant_of`, `POST .../variant` | `components/recipe/VariantSheet.tsx` |
| Zamienniki składników (przytrzymaj składnik) | `POST .../substitute` | `components/recipe/SubstituteSheet.tsx` |
| Spiżarnia z terminami: „Zużyj najpierw” w „Co ugotuję?”, czacie i planie od AI | `routers/pantry.py`, `services/matching.py` | `pages/CookPage.tsx` |
| Czytanie kroków na głos (🔊 w trybie gotowania, głos telefonu) | – | `lib/speech.ts` |
| Udostępnianie jako obrazek (rysowany w telefonie) | – | `lib/shareImage.ts` |
| Przeliczanie porcji | `services/shopping.py` (`scale_text`) | `lib/scale.ts` |
| Ulubione, ocena, notatki | `PATCH /api/recipes/{id}` | `pages/RecipePage.tsx` |
| Minutniki w krokach („10 min” → przycisk) | – | `lib/timers.ts` |
| Szukanie zdjęć w internecie dla przepisów bez zdjęcia (AI wyszukuje strony, bierzemy ich `og:image`; zapas: Openverse). Automatycznie po imporcie, hurtowo z listy, ręcznie w przepisie | `services/image_search.py`, `ai.search_recipe_pages` | `RecipePage.tsx`, `RecipesPage.tsx` |
| Wykrywanie duplikatów linków (także `m.`/`www.`, `utm_…`, `youtu.be` – `url_key`) | `routers/imports.py` (status `duplicate`), `services/urls.py` | `pages/ImportPage.tsx` |
| Szukanie w tytule, składnikach, opisie, krokach i notatkach | `GET /api/recipes?q=` | `pages/RecipesPage.tsx` |
| Plan posiłków jako kalendarz `.ics` (adres z tokenem, np. dla „Remote calendar” w HA) | `routers/calendar.py`, `services/calendar_feed.py` | `pages/SettingsPage.tsx` |
| Eksport przepisów w formacie schema.org (JSON) – przeprowadzka do Mealie/Tandoor | `GET /api/backup/schema-org`, `services/schema_org.py` | `pages/SettingsPage.tsx` |
| Świeży yt-dlp: raz w tygodniu aplikacja pobiera najnowszy do `data/pylib` (bez przebudowy obrazu) | `services/ytdlp_update.py` | – |
| Przewodnik „Jak używać” (pod „Więcej”) | – | `pages/HelpPage.tsx` |

Wysyłka do HA: jako dodatek HA działa sama (`homeassistant_api: true` daje token).
Poza HA ustaw `HA_URL` i `HA_TOKEN` (token długoterminowy z profilu użytkownika HA).

Gdy **Gemini jest przeciążony** (błąd 503 „high demand”), `ai.py` ponawia zapytanie dwa razy
(po 2 i 6 s), a potem próbuje modelu zapasowego (`GEMINI_FALLBACK_MODEL`). Jeśli i to
zawiedzie, pyta **kolejnych AI**, do których podano klucz (np. darmowe Groq i Mistral –
`GROQ_API_KEY`, `MISTRAL_API_KEY`). Gdy zawiodą wszystkie, nieudany import da się ponowić przyciskiem **Ponów** (`POST /api/imports/{id}/retry`).
Zdjęcia z nieudanego importu czekają na ponowienie 7 dni.

**Bez klucza AI** aplikacja też działa, ale tylko dla stron z danymi schema.org i bez
tłumaczenia; import ze zdjęć wymaga AI.

**Import ze zdjęć**: zdjęcia trafiają do AI razem; AI odczytuje przepis i wskazuje, które
zdjęcie (jeśli któreś) pokazuje gotowe danie.

Import trwa kilkanaście sekund, więc działa **w tle**: frontend dostaje numer zadania
i co 2 sekundy pyta o status.

---

## Uruchomienie na komputerze (dla programisty)

Potrzebujesz: **Python 3.12+**, **Node.js 22+**, git.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp ../.env.example .env              # i uzupełnij hasło oraz klucz API
uvicorn app.main:app --reload
```

- API działa na http://localhost:8000
- **Dokumentacja API z możliwością klikania: http://localhost:8000/docs** – tu najłatwiej
  zobaczyć, co backend potrafi.
- Dane lądują w `backend/data/` (baza + zdjęcia).
- Testy: `pytest`, lint: `ruff check .`
- Po zmianie `schemas.py` wygeneruj typy dla frontendu:
  `python -m app.export_types > ../frontend/src/api-types.ts` (CI sprawdza, czy są aktualne).

### Frontend

W drugim terminalu:

```bash
cd frontend
npm install
npm run dev
```

Otwórz adres, który pokaże Vite (zwykle http://localhost:5173). Zapytania do `/api`
są automatycznie przekazywane do backendu na porcie 8000 (`vite.config.ts`).
Dzięki opcji `--host` możesz otworzyć aplikację z telefonu w tej samej sieci Wi-Fi:
`http://<IP-komputera>:5173`.

- Lint: `npm run lint` (oxlint – działa z TypeScriptem 7, w przeciwieństwie do ESLint).
- Testy w przeglądarce (Playwright, widok iPhone'a): `npm run build`, potem
  `npx playwright install chromium` (raz) i `npm run test:e2e`. Testy same uruchamiają
  backend na pustej bazie; ścieżkę do Pythona z zależnościami podaj w `PYTHON=...`.

### Całość w Dockerze

```bash
cp .env.example .env    # uzupełnij
docker compose up -d --build
```

Aplikacja: http://localhost:8000. Dane są w folderze `./data`.

### Zmienne konfiguracyjne

| Zmienna             | Co robi                                                           | Domyślnie         |
|---------------------|-------------------------------------------------------------------|-------------------|
| `APP_PASSWORD`      | Hasło do aplikacji. Puste = brak logowania (tylko do testów!)     | puste             |
| `AI_PROVIDER`       | Które AI pytać najpierw: `auto`, `gemini`, `groq`, `mistral`, `anthropic`; gdy zawiedzie, pytane są kolejne z kluczem | `auto`            |
| `GEMINI_API_KEY`    | Klucz z https://aistudio.google.com (darmowy limit)               | puste             |
| `GEMINI_MODEL`      | Model Gemini                                                      | `gemini-flash-latest` |
| `GEMINI_FALLBACK_MODEL` | Model próbowany, gdy główny jest przeciążony                  | `gemini-flash-lite-latest` |
| `GROQ_API_KEY`      | Darmowy klucz z https://console.groq.com (zapasowe AI)            | puste             |
| `GROQ_MODEL`        | Model Groq (darmowe nie czytają zdjęć; wycofany zastępujemy domyślnym) | `openai/gpt-oss-120b` |
| `MISTRAL_API_KEY`   | Darmowy klucz z https://console.mistral.ai (zapasowe AI)          | puste             |
| `MISTRAL_MODEL`     | Model Mistral                                                     | `mistral-small-latest` |
| `HA_URL`, `HA_TOKEN` | Home Assistant do wysyłki listy zakupów (poza dodatkiem HA)     | puste |
| `HA_TODO_ENTITY`    | Lista w HA, do której trafiają zakupy                             | `todo.shopping_list` |
| `ANTHROPIC_API_KEY` | Klucz z https://console.anthropic.com (płatny za użycie)          | puste             |
| `CLAUDE_MODEL`      | Model Claude. Tańszy: `claude-haiku-5-5`, droższy: `claude-opus-5-5` | `claude-sonnet-5-5` |
| `DATA_DIR`          | Folder na bazę i zdjęcia                                          | `./data` (`/data` w Dockerze) |
| `STATIC_DIR`        | Folder ze zbudowanym frontendem (ustawiony w Dockerze)            | puste             |
| `YTDLP_AUTO_UPDATE` | Raz w tygodniu pobieraj najnowszy yt-dlp do `DATA_DIR/pylib`      | `true`            |

**Które AI wybrać?** Wystarczy jeden klucz.

- **Gemini (Google)** – klucz z Google AI Studio ma **darmowy limit** zapytań, który przy
  kilku przepisach dziennie zwykle wystarcza. Subskrypcja Gemini Pro/Advanced nie daje
  dostępu do API – to osobna usługa. Na darmowym planie Google może używać wysłanych
  treści do ulepszania modeli.
- **Claude (Anthropic)** – konto API doładowujesz kwotą i płacisz za użycie (subskrypcja
  Claude nie obejmuje API). Import przepisu na domyślnym modelu to zwykle kilkanaście–
  kilkadziesiąt groszy; `claude-haiku-5-5` jest wielokrotnie tańszy.

Jak zdobyć klucz Gemini: https://aistudio.google.com → zaloguj się kontem Google →
*Get API key* → *Create API key* → skopiuj.

---

## Instalacja na Home Assistant

Repozytorium jest jednocześnie **repozytorium dodatków HA** (pliki `repository.yaml`
i folder `ha-addon/`). Dodatek nie buduje aplikacji od zera – pobiera gotowy obraz
`ghcr.io/redragon03-bit/przepisy:latest`, który GitHub Actions buduje po każdej zmianie
w gałęzi `main` (`.github/workflows/ci.yml`).

**Jednorazowo na GitHubie** (po pierwszym udanym buildzie na `main`):
GitHub → Twój profil → *Packages* → `przepisy` → *Package settings* → *Change visibility*
→ **Public**. Bez tego HA nie pobierze obrazu.

**W Home Assistant:**

1. *Ustawienia → Dodatki → Sklep z dodatkami → ⋮ (prawy górny róg) → Repozytoria*.
2. Wklej `https://github.com/redragon03-bit/Przepisy` i dodaj.
3. Odśwież stronę, znajdź dodatek **Przepisy**, zainstaluj.
4. Zakładka *Konfiguracja*: ustaw `app_password` i klucz AI (`gemini_api_key` albo `anthropic_api_key`).
5. Uruchom. Aplikacja działa pod `http://<adres-HA>:8000`.

Aktualizacja: po zmianach w kodzie podnieś `version` w `ha-addon/config.yaml`.
GitHub Actions zbuduje obraz z tym numerem (np. `przepisy:0.2.1`), a HA pokaże przycisk
„Aktualizuj”. **Aktualizuj dopiero, gdy build na GitHubie (zakładka Actions) jest zielony** –
wcześniej obrazu z nowym numerem jeszcze nie ma i instalacja się nie uda.

Dane dodatku (baza i zdjęcia) są w jego folderze `/data` i **wchodzą do kopii
zapasowych Home Assistant**.

> Panel HA (ingress) nie jest używany celowo – źle obsługuje wysyłanie plików i PWA.
> Aplikację otwierasz bezpośrednio na porcie 8000.

**Później na Synology**: ten sam obraz uruchomisz w Container Manager albo przez
`docker-compose.yml` (zamień `build: .` na `image: ghcr.io/redragon03-bit/przepisy:latest`).
Żeby przenieść dane, skopiuj folder `/data` albo przywróć kopię ZIP (niżej).

---

## Dostęp z telefonu spoza domu

Nie potrzebujesz własnej domeny. Najprostsza i darmowa droga to **Tailscale**
(prywatna sieć VPN między Twoimi urządzeniami):

1. W HA zainstaluj oficjalny dodatek **Tailscale** i zaloguj się.
2. Na iPhonie zainstaluj aplikację **Tailscale** z App Store i zaloguj się tym samym kontem.
3. Otwórz w Safari `http://<nazwa-HA-w-tailscale>:8000` (nazwę i adres 100.x.x.x
   zobaczysz w aplikacji Tailscale).

Działa z każdego miejsca, a aplikacja nie jest wystawiona publicznie do internetu.

### HTTPS (zalecane)

Przez zwykłe `http://` aplikacja działa, ale Safari wyłącza wtedy kilka rzeczy:
- aplikacja nie otwiera się z ikony bez internetu (service worker działa tylko przez https),
- ekran gaśnie w trybie gotowania (blokada wygaszania – Wake Lock),
- nie działa przycisk „Wklej” i kopiowanie adresu kalendarza.

Najprościej dać HTTPS przez **usługę Tailscale** (Tailscale Services): Tailscale sam
wystawia certyfikat, obsługuje https i przekazuje ruch do aplikacji. W HA z dodatkiem
**Tailscale with features**:

1. Panel Tailscale (login.tailscale.com) → **DNS**: włącz **MagicDNS** i **HTTPS Certificates**.
2. **Access controls** → JSON editor: dopisz właściciela tagu i automatyczne zatwierdzanie usługi:
   ```json
   "tagOwners": { "tag:ha": ["autogroup:admin"] },
   "autoApprovers": { "services": { "svc:przepisy": ["tag:ha"] } },
   ```
   Jeśli używasz **Funnel** na tym samym HA (np. dla serwera MCP), dopisz `"tag:ha"` do
   `target` w `nodeAttrs` z `"funnel"` – otagowane urządzenie przestaje należeć do
   `autogroup:member` i bez tego Funnel przestaje działać.
3. **Services**: zdefiniuj usługę `przepisy`, port `443`.
4. Dopiero teraz w opcjach dodatku Tailscale ustaw (kolejność jest ważna – tag bez
   kroku 2 zatrzymuje dodatek):
   ```yaml
   advertise_tags: ["tag:ha"]
   services:
     - name: svc:przepisy
       target: http://127.0.0.1:8000
       protocol: https
       port: 443
   ```
   i uruchom go ponownie.
5. Otwórz `https://przepisy.<twoja-sieć>.ts.net` (pierwsze wejście trwa dłużej – powstaje
   certyfikat), zaloguj się i dodaj stronę do ekranu początkowego.

Adres działa tylko z włączonym Tailscale (także w domu). Stary `http://…:8000` dalej działa
w domowej sieci (np. dla Skrótu iOS), ale bez trybu offline.

**Dlaczego nie `share_homeassistant: serve` i własny port aplikacji?** Próbowaliśmy:
dodatek Tailscale przekazuje ruch IPv6 z sieci Tailscale na adres link-local hosta i tam
się on gubi, a Safari łączy się z nazwą `….ts.net` właśnie przez IPv6 – strona ładuje się
bez końca. Do tego przy włączonym `serve` Tailscale sam zajmuje port 8443. Usługa
Tailscale obsługuje połączenie u siebie, więc tych problemów nie ma.

Aplikacja umie też sama obsłużyć HTTPS (port 8443 w kontenerze), gdy dostanie pliki
certyfikatu w `SSL_CERTFILE` i `SSL_KEYFILE` (w dodatku: opcje `certfile`/`keyfile`, pliki
z folderu `/ssl`). To przydaje się poza HA, np. w `docker compose` z certyfikatem z
`tailscale cert`. Aplikacja co godzinę sprawdza, czy certyfikat się zmienił, i wczytuje nowy.

---

## Dodanie do ekranu iPhone'a i Skrót „Udostępnij”

**Ikona na ekranie głównym:** otwórz aplikację w Safari → przycisk *Udostępnij* →
*Do ekranu początkowego*.

**Wysyłanie linku z dowolnej aplikacji (Safari, Instagram…).** iPhone nie pozwala
aplikacjom webowym pojawiać się w menu *Udostępnij*, więc używamy aplikacji **Skróty**:

1. Skróty → **+** → nazwij skrót „Dodaj przepis”.
2. Kliknij ⓘ (szczegóły) → włącz **Pokaż w arkuszu udostępniania**, typ: *Adresy URL*.
3. Dodaj akcję **Pobierz zawartość adresu URL**:
   - URL: `http://<adres-aplikacji>:8000/api/imports/url`
   - Metoda: **POST**
   - Nagłówki: `X-App-Password` = *twoje hasło*
   - Treść żądania: **JSON**, pole `url` = *Wejście skrótu* (Shortcut Input)
4. (Opcjonalnie) dodaj akcję **Pokaż powiadomienie** „Przepis dodany do kolejki”.

Teraz na dowolnej stronie: *Udostępnij → Dodaj przepis*. Postęp zobaczysz w zakładce
„Dodaj”.

Prostsza wersja bez hasła w skrócie: jedna akcja **Otwórz adresy URL** z adresem
`http://<adres-aplikacji>:8000/dodaj?url=` + *Wejście skrótu* – otworzy aplikację w Safari
i od razu zacznie import (w Safari trzeba się raz zalogować).

**Android:** po dodaniu do ekranu głównego aplikacja sama pojawia się w menu
*Udostępnij* (obsługuje to `share_target` w `frontend/vite.config.ts`).

---

## Struktura kodu

```
backend/
  app/
    main.py            ← start aplikacji, podpięcie routerów, serwowanie frontendu i zdjęć
    config.py          ← ustawienia (zmienne środowiskowe / opcje Home Assistant)
    database.py        ← połączenie z SQLite, tworzenie tabel, składniki podstawowe
    models.py          ← TABELE w bazie (Recipe, Step, Ingredient, RecipeIngredient, ImportJob)
    schemas.py         ← format JSON w API (co wysyła/odbiera frontend)
    auth.py            ← logowanie hasłem (ciasteczko albo nagłówek X-App-Password)
    serve.py           ← start serwera w Dockerze: http (8000) i https (8443, gdy jest certyfikat)
    routers/           ← ADRESY API, każdy plik to grupa endpointów
      recipes.py       ←   /api/recipes      lista, wyszukiwanie, dodawanie, edycja, usuwanie
      ingredients.py   ←   /api/ingredients, /api/cook
      categories.py    ←   /api/categories   lista kategorii, automatyczne przypisanie przez AI
      imports.py       ←   /api/imports      import z linku/zdjęć
      auth.py          ←   /api/auth         logowanie
      shopping.py      ←   /api/shopping     lista zakupów, wysyłka do Home Assistant
      plan.py          ←   /api/plan         plan posiłków na tydzień
      pantry.py        ←   /api/pantry       spiżarnia (co jest w domu)
      chat.py          ←   /api/chat         czat z asystentem, zapis wymyślonego przepisu
      backup.py        ←   /api/backup(s)    kopia ZIP i kopie automatyczne
    services/          ← LOGIKA, bez wiedzy o HTTP
      importer.py      ←   cały proces importu (koordynuje pozostałe)
      fetcher.py       ←   pobieranie stron i obrazków
      scraper.py       ←   czytanie przepisu z HTML
      ai/              ←   rozmowa z AI: __init__.py (prompty, kolejność dostawców, limity czasu),
                       ←   gemini.py, claude.py, openai_style.py (Groq/OpenRouter), base.py
      images.py        ←   zapis/zmniejszanie zdjęć
      ingredients.py   ←   normalizacja nazw składników
      categories.py    ←   kategorie: domyślna lista, normalizacja nazw
      matching.py      ←   algorytm „Co ugotuję?”
      shopping.py      ←   łączenie składników na liście zakupów, synchronizacja z listą w HA
      aisles.py        ←   działy sklepu (warzywa, nabiał…) do grupowania listy zakupów
      image_search.py  ←   szukanie zdjęcia dla przepisu bez zdjęcia
      backup.py        ←   tworzenie ZIP-a, cotygodniowa kopia automatyczna
  tests/               ← testy (pytest); AI i internet są w nich podmienione
frontend/
  src/
    api.ts             ← wszystkie zapytania do backendu
    api-types.ts       ← typy danych wygenerowane z API (nie edytuj ręcznie)
    lib/               ← wspólna logika: komunikaty z „Cofnij”, minutniki, lista zakupów offline…
    App.tsx            ← routing (adresy stron) i dolny pasek zakładek
    pages/             ← jedna strona = jeden plik
    components/        ← elementy używane na kilku stronach (recipe/ = części strony przepisu)
    styles.css         ← wszystkie style (kolory w zmiennych na górze)
  vite.config.ts       ← build, PWA (manifest, ikony, service worker), proxy do API
  e2e/                 ← testy w przeglądarce (Playwright)
ha-addon/              ← dodatek Home Assistant
Dockerfile             ← obraz: buduje frontend, potem backend
```

Zasada: **router** przyjmuje zapytanie i zwraca odpowiedź, **service** robi właściwą
pracę, **models** to baza, **schemas** to kształt JSON-a. Frontend zna tylko API.

---

## Jak dopisać nową funkcję (przykład)

Przykład: chcesz dodać do przepisu **ocenę w gwiazdkach (1–5)**.

1. **Baza** – `backend/app/models.py`, w klasie `Recipe` dodaj:
   ```python
   rating: Mapped[int | None]
   ```
   SQLite nie doda kolumny do istniejącej tabeli samo, więc dopisz ją też do listy
   `ADDED_COLUMNS` w `backend/app/database.py`:
   `("recipes", "rating", "INTEGER")`. Przy starcie aplikacja doda brakującą kolumnę.
   (Przy większej liczbie zmian warto dodać narzędzie do migracji, np. Alembic.)
2. **API** – `backend/app/schemas.py`: dodaj `rating: int | None = None` do `RecipeIn`
   i `rating: int | None` do `RecipeOut`.
3. **Router** – `backend/app/routers/recipes.py`: w `to_out()` dodaj
   `rating=recipe.rating`, a w `_apply()` dopisz `"rating"` do listy pól.
4. **Test** – w `backend/tests/test_api.py` sprawdź, że ocena się zapisuje. Uruchom `pytest`.
5. **Frontend** – wygeneruj typy (`python -m app.export_types > ../frontend/src/api-types.ts`),
   w `pages/EditRecipePage.tsx` dodaj pole formularza, w `pages/RecipePage.tsx` wyświetl gwiazdki.
6. Sprawdź w przeglądarce (`npm run dev`) i na http://localhost:8000/docs.

Zmiana zachowania AI (np. inne zaokrąglanie miar) = edycja `SYSTEM_PROMPT` i opisów pól
w `backend/app/services/ai/__init__.py` – działa dla wszystkich dostawców. Nowego dostawcę AI
dodajesz jako plik w `services/ai/` (wzór: `gemini.py`) i dopisujesz go w `_ask_provider()`.

---

## Kopia zapasowa i przywracanie

Wszystkie dane są w folderze danych (`DATA_DIR`, w Dockerze i w Home Assistant `/data`):
plik bazy `przepisy.db` i folder `images/` ze zdjęciami. W HA ten folder jest wewnątrz
danych dodatku (nie widać go w File editor ani Samba) - najprościej pobrać kopię z aplikacji.

- **Pobranie:** *Ustawienia → Pobierz kopię* – plik ZIP z bazą (`przepisy.db`) i folderem `images/`.
- **Przywrócenie:** *Ustawienia → Przywróć z pliku…* – wybierz ZIP z kopii. Aplikacja
  sprawdza plik, a obecne dane najpierw zapisuje jako kopię automatyczną (można wrócić).
  Ręcznie: zatrzymaj aplikację, rozpakuj ZIP do folderu danych (`DATA_DIR`), uruchom ponownie.
- **Automatycznie:** raz w tygodniu aplikacja sama zapisuje ZIP w `DATA_DIR/backups`
  i trzyma 3 ostatnie (lista do pobrania w *Ustawieniach*). Chroni przed przypadkowym
  usunięciem przepisów; przed awarią dysku chroni kopia pobrana albo kopia HA.
- W Home Assistant dane dodatku są też w zwykłych kopiach zapasowych HA.

---

## Znane ograniczenia

- **Instagram, TikTok, YouTube, Facebook** – AI czyta tylko opis i napisy filmu (nie ogląda go).
  Gdy przepis jest wyłącznie pokazany w filmie albo film wymaga logowania (często Instagram),
  zrób screen opisu i zaimportuj zdjęcie.
- **Strony blokujące roboty / z paywallem** – import pokaże błąd; użyj screena.
- **Przeliczanie „cups” na gramy** jest przybliżone (zależy od produktu). Oryginalne
  miary zobaczysz w przepisie („Pokaż oryginalne miary”) i poprawisz w edycji.
- **AI może się pomylić** – każdy przepis da się edytować.
- **Wyszukiwanie po składnikach** działa na nazwach kanonicznych; „ser” znajdzie
  „ser żółty”, ale nie „serek”. Nazwę do wyszukiwania można poprawić w edycji przepisu.
