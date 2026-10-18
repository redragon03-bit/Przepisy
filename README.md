# Przepisy 🍲

Aplikacja do przechowywania przepisów. Wrzucasz link albo zdjęcie/screen, a aplikacja sama
odczytuje przepis, tłumaczy go na polski, przelicza miary na metryczne i zapisuje jako
instrukcję krok po kroku (razem ze zdjęciami ze strony). Potem możesz:

- szukać przepisów po nazwie i po składnikach,
- wpisać, co masz w lodówce, i zobaczyć, co z tego ugotujesz („Co ugotuję?”).

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
                                       │    └─ Claude (AI)     → tłumaczy, przelicza miary, czyta zdjęcia
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
- Testy: `pytest`

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
| `ANTHROPIC_API_KEY` | Klucz z https://console.anthropic.com. Puste = bez AI             | puste             |
| `CLAUDE_MODEL`      | Model AI. Tańsza opcja: `claude-haiku-5-5`                        | `claude-opus-5-5` |
| `DATA_DIR`          | Folder na bazę i zdjęcia                                          | `./data` (`/data` w Dockerze) |
| `STATIC_DIR`        | Folder ze zbudowanym frontendem (ustawiony w Dockerze)            | puste             |

**Koszt AI**: płacisz za użycie w konsoli Anthropic. Import jednego przepisu na domyślnym
modelu to zwykle kilkanaście–kilkadziesiąt groszy; `claude-haiku-5-5` jest wielokrotnie
tańszy, ale może częściej mylić się przy przeliczaniu miar.

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
4. Zakładka *Konfiguracja*: ustaw `app_password` i `anthropic_api_key`.
5. Uruchom. Aplikacja działa pod `http://<adres-HA>:8000`.

Aktualizacja: po zmianach w kodzie podnieś `version` w `ha-addon/config.yaml` –
HA pokaże wtedy przycisk „Aktualizuj”.

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

**Uwaga o HTTPS:** przez zwykłe `http://` aplikacja działa w pełni (także dodana do
ekranu głównego), ale Safari wyłącza wtedy dwie rzeczy: pamięć podręczną offline
(service worker) i przycisk „Wklej” (link wklejasz ręcznie). Gdy przeniesiesz się na
Synology, możesz dodać HTTPS za darmo poleceniem
`tailscale serve --bg --https=443 http://localhost:8000` – dostaniesz adres
`https://<nazwa>.<twoja-sieć>.ts.net`.

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
    routers/           ← ADRESY API, każdy plik to grupa endpointów
      recipes.py       ←   /api/recipes      lista, wyszukiwanie, dodawanie, edycja, usuwanie
      ingredients.py   ←   /api/ingredients, /api/cook
      imports.py       ←   /api/imports      import z linku/zdjęć
      auth.py          ←   /api/auth         logowanie
      backup.py        ←   /api/backup       kopia ZIP
    services/          ← LOGIKA, bez wiedzy o HTTP
      importer.py      ←   cały proces importu (koordynuje pozostałe)
      fetcher.py       ←   pobieranie stron i obrazków
      scraper.py       ←   czytanie przepisu z HTML
      ai.py            ←   rozmowa z Claude + prompt + format odpowiedzi
      images.py        ←   zapis/zmniejszanie zdjęć
      ingredients.py   ←   normalizacja nazw składników
      matching.py      ←   algorytm „Co ugotuję?”
  tests/               ← testy (pytest); AI i internet są w nich podmienione
frontend/
  src/
    api.ts             ← wszystkie zapytania do backendu + typy danych
    App.tsx            ← routing (adresy stron) i dolny pasek zakładek
    pages/             ← jedna strona = jeden plik
    components/        ← elementy używane na kilku stronach
    styles.css         ← wszystkie style (kolory w zmiennych na górze)
  vite.config.ts       ← build, PWA (manifest, ikony, service worker), proxy do API
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
   SQLite nie doda kolumny do istniejącej tabeli samo. Na początku najprościej:
   `sqlite3 data/przepisy.db "ALTER TABLE recipes ADD COLUMN rating INTEGER;"`.
   (Przy większej liczbie zmian warto dodać narzędzie do migracji, np. Alembic.)
2. **API** – `backend/app/schemas.py`: dodaj `rating: int | None = None` do `RecipeIn`
   i `rating: int | None` do `RecipeOut`.
3. **Router** – `backend/app/routers/recipes.py`: w `to_out()` dodaj
   `rating=recipe.rating`, a w `_apply()` dopisz `"rating"` do listy pól.
4. **Test** – w `backend/tests/test_api.py` sprawdź, że ocena się zapisuje. Uruchom `pytest`.
5. **Frontend** – `frontend/src/api.ts`: dodaj `rating` do typów `Recipe` i `RecipeInput`;
   w `pages/EditRecipePage.tsx` dodaj pole formularza, w `pages/RecipePage.tsx` wyświetl gwiazdki.
6. Sprawdź w przeglądarce (`npm run dev`) i na http://localhost:8000/docs.

Zmiana zachowania AI (np. inne zaokrąglanie miar) = edycja `SYSTEM_PROMPT` i opisów pól
w `backend/app/services/ai.py`.

---

## Kopia zapasowa i przywracanie

- **Pobranie:** *Ustawienia → Pobierz kopię* – plik ZIP z bazą (`przepisy.db`) i folderem `images/`.
- **Przywrócenie:** zatrzymaj aplikację, rozpakuj ZIP do folderu danych (`DATA_DIR`,
  w Dockerze `/data`), uruchom ponownie.
- W Home Assistant dane dodatku są też w zwykłych kopiach zapasowych HA.

---

## Znane ograniczenia

- **Instagram, TikTok, YouTube, Facebook** – przepis jest zwykle w filmie albo za
  logowaniem; link nie zadziała. Zrób screen opisu i zaimportuj zdjęcie.
- **Strony blokujące roboty / z paywallem** – import pokaże błąd; użyj screena.
- **Przeliczanie „cups” na gramy** jest przybliżone (zależy od produktu). Oryginalne
  miary zobaczysz w przepisie („Pokaż oryginalne miary”) i poprawisz w edycji.
- **AI może się pomylić** – każdy przepis da się edytować.
- **Wyszukiwanie po składnikach** działa na nazwach kanonicznych; „ser” znajdzie
  „ser żółty”, ale nie „serek”. Nazwę do wyszukiwania można poprawić w edycji przepisu.
