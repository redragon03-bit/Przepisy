# Przegląd kodu i sugestie rozwoju — Smocza strawa

> Dokument powstał w wyniku pełnego przeglądu kodu (`backend/app`, `frontend/src`, `ha-addon/`, `Dockerfile`, `.github/workflows/ci.yml`) pod kątem funkcjonalności, jakości kodu, refaktoryzacji, bezpieczeństwa oraz funkcji spotykanych w konkurencyjnych aplikacjach (Paprika 3, Mealie, Tandoor, Cookidoo, AnyList/Bring!, Samsung Food).
>
> **Nic nie zostało jeszcze wdrożone** — dokument służy do wspólnego przeglądu i wyboru priorytetów.

---

## Szybkie podsumowanie (Priorytety P1–P3)

### Mocne strony obecnego projektu
- **Czytelna, prosta architektura**: jeden kontener (FastAPI + SQLite WAL + React/Vite PWA), brak zbędnych serwisów i zależności.
- **Świetne dostosowanie pod iPhone 13 / Safari PWA**: limitowanie odpowiedzi AI pod 60-sekundowy timeout Safari (`ai/base.py`), przenoszenie cięższych zadań do tła, Wake Lock w trybie gotowania, powiadomienia minutnika przez Home Assistant (`timer_notify.py`), praca offline dla przepisów i listy zakupów (`recipeCache.ts`, `offlineShopping.ts`), czcionki ≥ 16 px w polach tekstowych.
- **Pragmatyczne podejście do bezpieczeństwa**: ochrona SSRF w `fetcher.py` (sprawdzanie adresu IP na każdym przekierowaniu), bezpieczne rozpakowywanie kopii zapasowej w `backup.py` (whitelist nazw `images/[0-9a-f]{32}\.jpg`, `sqlite3.backup`), `PBKDF2` (200 000 rund), `hmac.compare_digest`, podpisywane sesje z unieważnianiem po zmianie hasła.
- **Dobre testy**: testy backendu (z podmienionym AI i internetem), testy jednostkowe TypeScriptu (`node --test`) oraz testy E2E Playwright w widoku iPhone 13.

### Tabela priorytetów do wdrożenia

| Priorytet | Obszar | Temat | Wysiłek |
| --- | --- | --- | --- |
| **P1** | Bezpieczeństwo | Izolacja po `user_id` i limit rozmiaru cache w pamięci dla `/api/plan/suggest/{id}`, `/api/promotions/ideas/{id}` i `/api/timers/{id}` | Mały |
| **P1** | Bezpieczeństwo | Ograniczenie rozmiaru uploadów po stronie strumienia (`imports.py`, `receipts.py`, `backup.py`, `recipes.py`) + limit rozmiaru po rozpakowaniu ZIP (*zip bomb*) | Mały |
| **P1** | Bezpieczeństwo | Walidacja schematu `source_url` (`http://` / `https://`) na backendzie i froncie (ochrona przed `javascript:` XSS) | Mały |
| **P1** | Funkcjonalność / Bug | Kolizje ID minutników (`Date.now()` z klienta) oraz brak zapisu minutników w DB (giną przy restarcie dodatku) | Mały |
| **P2** | Bezpieczeństwo | Sprawdzenie adresu IP dla linków wideo zanim trafią do `yt-dlp` (obecnie omija hook `_only_internet` w `fetcher.py`) | Mały |
| **P2** | Bezpieczeństwo | Rate limiting za reverse proxy (uwzględnienie nagłówka zaufanego proxy / oddzielny klucz na konto) + nagłówki HTTP (`X-Content-Type-Options`, `Referrer-Policy`, CSP) | Mały |
| **P2** | Jakość / Wydajność | Wydajność zapytań listy przepisów (`selectinload`, unikanie wielokrotnego `.any()`, opcjonalna paginacja / wyszukiwanie FTS5) | Średni |
| **P2** | Refaktoryzacja | Duplikacja logiki dopasowywania składników i skalowania (`matching.py`/`ingredients.py` vs `similar.ts`, `shopping.py` vs `scale.ts`) — wspólne testy kontraktowe lub przeniesienie części na backend | Średni |
| **P2** | Refaktoryzacja | Podział dużych modułów (`services/promotions.py` 687 linii, `routers/recipes.py` 535 linii, `services/ai/__init__.py` 706 linii, `EditRecipePage.tsx`, `PromotionsPage.tsx`) | Średni |
| **P2** | Nowe funkcje | „Odhacz użyte składniki ze spiżarni” po ugotowaniu przepisu (w `CookedSheet`) | Mały |
| **P2** | Nowe funkcje | Lepsze łączenie jednostek na liście zakupów (np. `500 ml` + `1 l` → `1,5 l`, `2 łyżki` + `30 ml` itp.) i szybki podgląd powiązanych przepisów na pozycji | Mały |
| **P2** | Nowe funkcje | Historia paragonów / wydatków i prosty import/eksport przepisów w standardzie `schema.org` JSON-LD (eksport już częściowo jest w `schema_org.py`, brak endpointu/UI i importu) | Średni |
| **P3** | Nowe funkcje | Zamrażarka / porcje na zapas (*meal prep*) jako specjalna sekcja w „W domu” lub etykieta przy ugotowanym daniu | Mały–Średni |
| **P3** | Nowe funkcje | Rozmrażanie / przypomnienia w planie posiłków (np. powiadomienie HA dzień wcześniej wieczorem o wyjęciu mięsa z zamrażarki) | Mały |
| **P3** | Nowe funkcje | Tryb „Goście / Podgląd tylko do odczytu” (udostępnienie jednego przepisu linkiem bez logowania, albo tymczasowa strona) | Średni |
| **P3** | Jakość / DevOps | Rotacja tokenu kalendarza `.ics` bez konieczności zmiany `APP_PASSWORD` oraz konfiguracja w jednym miejscu (bez rozjazdu `ha-addon/config.yaml` i `config.py`) | Mały |

---

## 1. Bezpieczeństwo

### 1.1. [P1] Brak sprawdzania właściciela i limitu pamięci w słownikach zadań w tle
- **Gdzie**:
  - `backend/app/routers/plan.py` (`_suggestions`, `get_suggestion`)
  - `backend/app/routers/promotions.py` (`_ideas`, `get_ideas`)
  - `backend/app/routers/timers.py` + `backend/app/services/timer_notify.py`
- **Problem**:
  - W `services/receipts.py` zadania skanowania paragonów (`_scans`) słusznie przechowują `(user, scan)`, sprawdzają `found[0].id == user.id` przy odczycie oraz przycinają bufor do 20 ostatnich wpisów.
  - Natomiast w `routers/plan.py` (`_suggestions`) oraz `routers/promotions.py` (`_ideas`) dowolny zalogowany użytkownik (np. domownik) może odczytać propozycję drugiego użytkownika znając kolejne `id` (1, 2, 3...), a same słowniki w pamięci nigdy nie są czyszczone (wyciek RAM przy wielomiesięcznej pracy kontenera).
  - W `routers/timers.py` `DELETE /api/timers/{timer_id}` pozwala każdemu zalogowanemu użytkownikowi anulować cudzy minutnik. Ponadto frontend (`frontend/src/lib/useTimers.tsx`) generuje `timer_id` przez `Date.now()`, więc dwa telefony startujące minutnik w tej samej milisekundzie lub po kolizji ID mogą nadpisać sobie klucz w `_timers`.
- **Propozycja**:
  - Wydzielić lekki wspólny mechanizm krótkotrwałego cache zadań w pamięci (z `user_id`, limitem np. 20–50 wpisów i/lub TTL np. 2h) i użyć go w `plan.py`, `promotions.py`, `receipts.py`.
  - Dla minutników przypisać `(user_id, timer_id)` lub generować UUID / klucz złożony po stronie serwera.

### 1.2. [P1] Uploady wczytywane w całości do pamięci i brak limitu na rozpakowanie ZIP
- **Gdzie**:
  - `backend/app/routers/imports.py` (`import_images`)
  - `backend/app/routers/receipts.py` (`scan`)
  - `backend/app/routers/backup.py` (`restore_backup`)
  - `backend/app/routers/recipes.py` (`upload_main_image`, `upload_step_image`, `mark_cooked`)
  - `backend/app/services/backup.py` (`restore_zip`)
- **Problem**:
  - Sprawdzenie `(upload.size or 0) > MAX_FILE_BYTES` polega na nagłówku / metadanych `UploadFile.size`, które w Starlette/FastAPI potrafią wynosić `None` lub być zafałszowane. Następnie `upload.file.read()` wczytuje cały strumień do RAM naraz.
  - W `routers/backup.py` przy `restore_backup` brakuje w ogóle limitu rozmiaru wgrywanego pliku ZIP, a `restore_zip()` w `services/backup.py` używa `archive.read(...)` bez sprawdzenia sumarycznego rozmiaru po dekompresji (klasyczna podatność na *zip bomb*).
- **Propozycja**:
  - Dodać małą funkcję pomocniczą `read_upload_limited(upload, max_bytes)` czytającą w kawałkach (np. po 64 KB) i przerywającą natychmiast z kodem `413` po przekroczeniu limitu.
  - W `restore_zip()` sprawdzać `info.file_size` oraz sumę rozpakowanych bajtów przed zapisem na dysk / do pamięci.

### 1.3. [P1] Brak walidacji `source_url` (ryzyko XSS przez schemat `javascript:`)
- **Gdzie**:
  - `backend/app/schemas.py` (`RecipeIn.source_url: str = ""`)
  - `frontend/src/pages/RecipePage.tsx` (`<a href={recipe.source_url} target="_blank" rel="noreferrer">`)
- **Problem**:
  - Przy imporcie z URL backend wymaga `http://` lub `https://`, ale przy ręcznym tworzeniu lub edycji przepisu (`POST /api/recipes`, `PUT /api/recipes/{id}`) `source_url` akceptuje dowolny napis. Zapisanie `javascript:...` lub `data:...` i kliknięcie linku na stronie przepisu spowoduje wykonanie kodu w przeglądarce.
- **Propozycja**:
  - W `RecipeIn` walidować `source_url` (puste albo zaczynające się od `http://` / `https://`).
  - Dodatkowo w `RecipePage.tsx` renderować `<a href=...>` wyłącznie gdy URL ma bezpieczny schemat `^https?://`.

### 1.4. [P2] SSRF przy importach wideo (`yt-dlp`) i niuanse `fetcher.py`
- **Gdzie**: `backend/app/services/video.py`, `backend/app/services/fetcher.py`
- **Problem**:
  - `fetcher.py` bardzo dobrze chroni pobieranie HTML/JSON/obrazków przez hook `_only_internet` (sprawdza każdy adres IP z DNS także przy przekierowaniach).
  - Jednak `video.py` przekazuje link bezpośrednio do `yt_dlp.YoutubeDL.extract_info(url)` — `yt-dlp` używa własnego klienta HTTP i nie przechodzi przez `_only_internet`. W efekcie link z domeną z `VIDEO_SITES` lub subdomeną (lub w przyszłości rozszerzoną listą) pomija kontrolę IP sieci domowej, a także samo `yt-dlp` może wykonywać kolejne żądania sieciowe na adresy zwrócone w metadanych.
  - W `fetcher.py:_only_internet` wyjątek `socket.gaierror` jest ignorowany (`return`) z myślą o proxy — w środowisku z proxy (gdzie host nie rozwiązuje DNS lokalnie) warto to kontrolować jawną flagą, a domyślnie przy błędzie DNS blokować lub ostrożnie obsługiwać.
- **Propozycja**:
  - Przed wywołaniem `_extract_info(url)` w `video.py` uruchamiać wstępne sprawdzenie hosta (rozwiązanie DNS i weryfikacja `is_global`) analogiczne do `_only_internet`.

### 1.5. [P2] Rate limiting logowania za reverse proxy i brak nagłówków bezpieczeństwa HTTP
- **Gdzie**: `backend/app/auth.py` (`client_address`), `backend/app/main.py`, `backend/app/routers/auth.py`
- **Problem**:
  - `client_address(request)` czyta wyłącznie `request.client.host`. Gdy ruch przychodzi przez reverse proxy (np. Nginx, Caddy, Cloudflare Tunnel, lub lokalny proxy), wszyscy użytkownicy mają ten sam adres IP (`127.0.0.1` albo IP kontenera proxy) — wtedy 5 pomyłek jednej osoby blokuje logowanie wszystkim w domu (a atakujący z internetu może celowo powodować blokadę).
  - W odpowiedziach HTTP brakuje podstawowych nagłówków utwardzających: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` (lub `SAMEORIGIN` jeśli kiedykolwiek używane w iframe Ingressa HA).
  - W `routers/auth.py` nieudane próby przez nagłówek `X-App-Password` naliczają blokadę IP, ale `current_user()` zawsze zwraca `401` zamiast `429`, co utrudnia diagnostykę w Skrótach iOS.
- **Propozycja**:
  - Dodać opcjonalną konfigurację zaufanych proxy (`TRUSTED_PROXIES` / odczyt `X-Forwarded-For` tylko z zaufanych adresów) i kluczować limit prób po `(ip, nazwa_konta)`.
  - Dodać prosty middleware w `main.py` ustawiający nagłówki bezpieczeństwa.

### 1.6. [P2] Ryzyko auto-aktualizacji `yt-dlp` z PyPI (`pip install --upgrade`)
- **Gdzie**: `backend/app/services/ytdlp_update.py`
- **Problem**: Co 7 dni aplikacja pobiera `yt-dlp` bezpośrednio z PyPI komendą `pip install --upgrade yt-dlp` do `data/pylib` i dynamicznie ładuje go w procesie serwera. Z jednej strony rozwiązuje to częste zmiany TikToka/YouTube, z drugiej strony przy przejęciu paczki w ekosystemie lub uszkodzonym wydaniu nie ma żadnej weryfikacji ani automatycznego wycofania do wersji z obrazu.
- **Propozycja**:
  - Zachować mechanizm (jest bardzo praktyczny), ale po instalacji w `pylib-new` uruchomić krótki test w osobnym podprocesie (`python -c "import yt_dlp; ..."`) zanim zastąpi się `pylib`, i zachować poprzednią wersję jako `pylib-prev` na wypadek błędu importu.

### 1.7. [P2–P3] Drobne kwestie uprawnień i tokenów
- **`POST /api/promotions/refresh`** (`routers/promotions.py:139`): może zostać wywołane przez zwykłego domownika, co zużywa darmowe limity AI i wykonuje crawling zewnętrznych stron. Warto ograniczyć do właściciela (`require_owner`) lub dodać cooldown.
- **Token kalendarza `.ics`** (`routers/calendar.py`): wyliczany z `secret_key` i `_password_tag()`. Jeśli link `.ics` wycieknie, nie da się go unieważnić bez zmiany `APP_PASSWORD` lub skasowania `secret.key` (co wyloguje wszystkich). Dodanie osobnego losowego tokenu w `AppSetting` z przyciskiem „Odśwież link” w Ustawieniach rozwiąże problem.
- **Auto-logowanie bez `APP_PASSWORD`**: gdy `APP_PASSWORD` jest puste (`auth.py:143`), każdy w sieci jest właścicielem. W konfiguracji z internetem przez Tailscale Funnel może to być niebezpieczne przy przypadkowej zmianie opcji — warto w `GET /api/auth/status` lub na froncie wyraźnie ostrzegać właściciela, jeśli hasło jest puste.

---

## 2. Jakość kodu i wydajność

### 2.1. [P2] Zapytania N+1 i brak paginacji na liście przepisów
- **Gdzie**: `backend/app/routers/recipes.py` (`list_recipes`, `to_summary`), `backend/app/models.py`
- **Problem**:
  - W `list_recipes` filtrowanie wyszukuje po 5 polach/relacjach w pętli po każdym słowie zapytania za pomocą wielokrotnych podzapytań `.any()`, a dla wszystkich wyników wywołuje `to_summary()` (przy kilkuset przepisach robi się z tego sporo pracy dla SQLite i duży payload JSON dla telefonu, zwłaszcza przy słabym zasięgu).
  - Brak parametrów `limit` / `offset` (albo kursora) w `GET /api/recipes` oraz brak `selectinload(Recipe.categories)` w zapytaniu (w `models.py` jest `lazy="selectin"`, co pomaga przy listach, ale przy cięższych widokach jak `promo_recipes` czy `chat` warto jawnie kontrolować ładowane relacje).
- **Propozycja**:
  - Przy wzroście bazy (> 300–500 przepisów) rozważyć SQLite FTS5 dla wyszukiwania tekstowego lub prostą paginację / dociąganie („Pokaż więcej”), przy jednoczesnym zachowaniu pełnej listy offline dla ostatnich/ulubionych przepisów.

### 2.2. [P2] Zapisywanie całych plików i stanów synchronicznych w bazie / pamięci
- **Gdzie**: `backend/app/routers/auth.py` (`_accounts`), `backend/app/routers/pantry.py`, `backend/app/services/ai/__init__.py`
- **Obserwacje**:
  - W `auth.py:find_member` otwiera nową sesję `SessionLocal()` przy **każdym** wywołaniu `find_member` mimo że endpointy często mają już sesję `db`. Co ważniejsze, `user_from_request()` w `auth.py:164` dla konta domownika otwiera nową sesję SQLite przy **każdym** zapytaniu HTTP (nawet dla statycznych miniaturek `/media/thumb/...`!). Na stronie z 40 miniaturkami przepisów oznacza to 40 dodatkowych zapytań do SQLite równocześnie z przeglądarki.
  - W `services/ai/__init__.py`: logika kolejek i limitów czasu (`_failed_until` to globalny słownik mutowany z wielu wątków bez `threading.Lock`, podobnie jak `image_search.progress`).
- **Propozycja**:
  - Dodać lekki cache w pamięci (z krótkim TTL lub inwalidacją przy edycji konta w `routers/auth.py`) dla weryfikacji tokenów sesji domowników — wyeliminuje to otwieranie bazy przy każdym obrazku `/media/...`.
  - Owinąć dostęp do `_failed_until` i `image_search.progress` w `threading.Lock`.

### 2.3. [P2] Obsługa błędów i logowanie operacji w tle
- **Gdzie**: `backend/app/services/promotions.py`, `backend/app/services/backup.py`, `backend/app/services/image_search.py`
- **Obserwacje**:
  - Wątkowe pętle w tle (`auto-backup`, `promotions`, `plan-sensor`, `ytdlp-update`) są wątkami `daemon=True` z `while True: time.sleep(...)`. Przy wyłączaniu kontenera nie ma eleganckiego sygnału zatrzymania (`threading.Event`), a jeśli w trakcie wyłączania trwa zapis SQLite (np. backup lub import gazetek), `SIGTERM` po timeoutcie ubije proces w środku pracy.
  - W `routers/recipes.py` (`upload_main_image`, `upload_step_image`, `mark_cooked`) `except Exception` łapie wszystko i zamienia na `HTTP 400 "Nie udało się odczytać obrazka"` bez zalogowania przyczyny, co utrudnia diagnozę nietypowych formatów zdjęć z iPhone'a (np. HEIC bez wsparcia w Pillow, jeśli przeglądarka wyśle oryginał).
- **Propozycja**:
  - Logować wyjątek na poziomie `warning` przy odrzuceniu obrazka i użyć wspólnego `stop_event` w `lifespan` FastAPI dla wszystkich wątków w tle.

### 2.4. [P2] Frontend: obsługa zapytań, spójność typów i offline
- **Gdzie**: `frontend/src/lib/recipeCache.ts`, `frontend/src/lib/offlineShopping.ts`, `frontend/src/pages/RecipesPage.tsx`
- **Obserwacje**:
  - `localStorage` ma w Safari limit ok. 5 MB na domenę. `recipeCache.ts` trzyma do 60 pełnych przepisów (`LIMIT = 60`) oraz pełną listę `RecipeSummary` pod `offline-recipe-list`. Przy rozbudowanych przepisach (długie opisy, kroki, notatki) limit `localStorage` może zostać osiągnięty po cichu — wtedy `store()` przechwytuje wyjątek i przestaje zapisywać *zarówno* listę przepisów, jak i kolejkę offline zakupów (`shopping-queue`) oraz minutniki (`timers`), bo współdzielą ten sam `localStorage`!
  - `offlineShopping.ts`: w `send()` w trakcie asynchronicznej wysyłki zmian z kolejki brakuje ochrony przed wyścigiem z odświeżaniem widoku lub ponownym wpisaniem zmian w `localStorage` między odczytem a zapisem kolejki.
  - W `ShoppingPage.tsx` / `PlanPage.tsx` kilka efektów używa `// eslint-disable-next-line react-hooks/exhaustive-deps` mimo że projekt przeszedł na `oxlint` (nieaktualne komentarze).
- **Propozycja**:
  - Przenieść cache przepisów offline (`offline-recipes`, `offline-recipe-list`) do **IndexedDB** (duże limity, nie blokuje wątku głównego `JSON.parse`/`JSON.stringify`), zostawiając w `localStorage` wyłącznie drobne ustawienia, minutniki i kolejkę zakupów.

---

## 3. Refaktoryzacja (gdzie kod warto uprościć / uporządkować)

### 3.1. [P2] Duplikacja logiki między backendem (Python) a frontendem (TypeScript)
Obecnie trzy kluczowe algorytmy są zaimplementowane niezależnie w dwóch językach i wymagają ręcznego pilnowania identycznego zachowania:
1. **Dopasowywanie nazw produktów** (`backend/app/services/matching.py` + `ingredients.py` vs `frontend/src/lib/similar.ts`): niemal identyczne listy `_FILLER`, `_UNITS`, `_OTHER_PRODUCT`, `_KINDS` i funkcja `same_word`/`sameWord`. Jak widać po `CHANGELOG.md` (np. 0.24.6), poprawka w dopasowywaniu wymaga zmian w obu miejscach naraz.
2. **Przeliczanie ilości i skalowanie kroków** (`backend/app/services/shopping.py` vs `frontend/src/lib/scale.ts`): identyczne regexy na ułamki (`½`, `⅓`, `1 1/2`), `NON_FRACTION_UNITS`, zakresy `2-3`.
3. **Etykiety promocji i rabaty wielosztuk** (`backend/app/services/promotions.py` vs `frontend/src/lib/promo.ts`): przeliczanie `2+1`, `1+1`, `drugi 80% taniej` w dwóch miejscach.

- **Sugestia refaktoryzacji**:
  - **Opcja A (najmniejszy koszt)**: stworzyć wspólny plik danych testowych JSON (np. `tests/shared_cases.json`), z którego korzystają zarówno testy `pytest`, jak i `node --test`, dzięki czemu rozjazd między backendem a frontendem zostanie wykryty automatycznie przez CI.
  - **Opcja B (docelowa dla promocji i list)**: przenosić wyliczanie wartości prezentacyjnych (np. znormalizowany rabat na sztukę, sformatowana cena krótka) wyłącznie na backend w `schemas.py` (`PromotionOut`), żeby frontend tylko wyświetlał gotowe pola.

### 3.2. [P2] Rozrost pojedynczych plików („boskie moduły”)
Kilka plików przekroczyło rozmiar wygodny do dalszego rozwoju i testowania:
- `backend/app/services/promotions.py` (**687 linii**) — łączy w jednym pliku: pobieranie z Lidla, pobieranie z Blixa, wycinanie obrazków (`Pillow`), parsowanie rabatów wielosztukowych, dopasowywanie nazw składników, zarządzanie wygasaniem i harmonogram w tle.
  - *Podział*: `services/promo/lidl.py`, `services/promo/blix.py`, `services/promo/matching.py`, `services/promo/store.py` (z zachowaniem prostego interfejsu w `services/promotions.py`).
- `backend/app/services/ai/__init__.py` (**706 linii**) — łączy wszystkie modele Pydantic odpowiedzi AI, wszystkie prompty (import, czat, kalorie, zamiennik, wariant, paragony, gazetki, sekcje, kategorie, plan tygodnia) oraz logikę fallbacku dostawców.
  - *Podział*: `ai/prompts.py`, `ai/schemas.py`, `ai/router.py` (wybór dostawcy i limity czasu).
- `backend/app/routers/recipes.py` (**535 linii**) — CRUD + wyszukiwanie + warianty + kalorie + zdjęcia + gotowanie. Warto rozdzielić np. na `recipes.py` (CRUD + lista) i `recipe_actions.py` (AI: kalorie, zamiennik, wariant, sekcje + zdjęcia + dziennik gotowania).
- Frontend: `EditRecipePage.tsx`, `PromotionsPage.tsx`, `SettingsPage.tsx`, `ShoppingPage.tsx` (po 350–450 linii) — wyciągnięcie logiki formularzy / filtrów do dedykowanych hooków lub mniejszych podkomponentów jak już świetnie zrobiono w `components/recipe/`.

### 3.3. [P3] Spójność konfiguracji i powtarzalne wzorce w routerach
- **Rozjazd w konfiguracji**: każda nowa opcja wymaga aktualizacji w `backend/app/config.py` i `ha-addon/config.yaml` (sekcje `options` i `schema`). Warto dodać prosty test w `pytest`, który sprawdza czy wszystkie opcje z `ha-addon/config.yaml` mają odpowiednik w `Settings` (wyłapie literówki przed wydaniem).
- **Wzorzec uploadu plików**: powtarzająca się logika walidacji i odczytu `UploadFile` w 4 routerach (`imports.py`, `receipts.py`, `backup.py`, `recipes.py`) prosi się o jeden helper.
- **Zależność `IngredientOut` w `routers/ingredients.py`**: `update_ingredient` i `add_staple` zwracają obiekt ORM `Ingredient` polegając na domyślnym `recipe_count: int = 0` zamiast jawnego wyliczenia liczby przepisów jak w `list_ingredients`.

---

## 4. Użyteczne funkcje i braki w obecnych przepływach

Rzeczy wynikające bezpośrednio z tego, jak aplikacja już dziś działa:

1. **[P1] Trwałe minutniki w bazie danych (SQLite)**
   - *Stan obecny*: `services/timer_notify.py` trzyma zaplanowane powiadomienia tylko w słowniku `_timers` w RAM. Jeśli w trakcie gotowania zaktualizuje się dodatek HA lub zrestartuje kontener, minutnik w telefonie dojdzie do zera po czasie, ale Home Assistant nigdy nie wyśle powiadomienia.
   - *Propozycja*: lekka tabela `ActiveTimer(id, user_id, label, ends_at)` w SQLite. Po starcie aplikacji odtwarza brakujące `threading.Timer` (a jeśli czas właśnie minął w trakcie restartu — wysyła spóźnione powiadomienie).

2. **[P2] Odejście od „ręcznego sprzątania spiżarni” — zużywanie składników po ugotowaniu**
   - *Stan obecny*: odhaczenie produktu na liście zakupów automatycznie dopisuje go do „W domu”, a w `CookedSheet` zapisuje się tylko data, ocena, notatka i zdjęcie. Składniki zostają w „W domu” aż użytkownik ręcznie je usunie.
   - *Propozycja*: w oknie „Ugotowane!” (`CookedSheet`) dodać zwiniętą sekcję lub opcjonalną listę składników tego przepisu znalezionych w „W domu” (domyślnie zaznaczone np. szybko psujące się lub z terminem ważności, z jednym przyciskiem „Usuń zużyte z domu”). Nadal 0 dodatkowych przycisków na głównym ekranie przepisu!

3. **[P2] Inteligentniejsze łączenie ilości na liście zakupów + „Dlaczego to tu jest?”**
   - *Stan obecny*: `services/shopping.py` łączy identyczne jednostki bazowe (np. `g` + `kg` zamienia na `g`, `ml` + `l` na `ml`), ale nie łączy `200 g` + `1 opakowanie`, ani nie formatuje elegancko `1500 g` → `1,5 kg` lub `1500 ml` → `1,5 l` (zostaje `1500 g`). Dodatkowo w `ShoppingItemOut.recipes` jest tylko tekstowa lista nazw przepisów.
   - *Propozycja*:
     - Przeliczanie w górę przy przekroczeniu `1000 g` → `1 kg` i `1000 ml` → `1 l`.
     - Kliknięcie w podpis przepisu pod pozycją na liście zakupów mogłoby otwierać mini-podgląd / link do przepisu (lub listę przepisów, z których pochodzi pozycja).

4. **[P2] Eksport i import przepisów w standardowym formacie (JSON-LD / ZIP)**
   - *Stan obecny*: w `services/schema_org.py` jest gotowy eksporter do `schema.org/Recipe` (JSON-LD), ale nie widać go jako prostego przycisku w Ustawieniach lub eksporcie jednego przepisu (używany jest głównie lub wcale — warto go podpiąć pod „Udostępnij plik przepisu” lub eksport kolekcji).
   - *Propozycja*: możliwość wyeksportowania pojedynczego przepisu jako `.json` (JSON-LD) albo całej kolekcji w czytelnej formie (np. Markdown/HTML lub JSON-LD) oraz importu pliku `.json` / `.paprikarecipes` (przydatne przy migracji lub wymianie przepisów ze znajomymi używającymi Mealie/Tandoor/Papriki).

5. **[P2] Szybkie „Wyszukaj po czasie / kaloriach / niegotowanych dawno”**
   - *Stan obecny*: lista przepisów ma filtry po słowie, kategorii, składnikach i ulubionych, oraz sortowanie (`Najnowsze`, `Ocena`, `Czas`, `A–Z`).
   - *Propozycja*: sortowanie „Dawno niegotowane” (dane `last_cooked_at` i `cooked_count` już są w `RecipeSummary`!) oraz szybki filtr w panelu filtrów np. `≤ 30 min` — bez dokładania przycisków na główny pasek.

6. **[P3] Wyszukiwanie głosowe / dyktowanie na liście zakupów i czacie (iPhone Safari)**
   - Na iPhonie klawiatura systemowa ma mikrofon, ale dedykowane szybkie dodanie wielu pozycji jednym wpisem rozdzielonym przecinkiem lub nową linią (np. „mleko, chleb, masło” wklejone z Messengera w polu „Dodaj do listy”) rozbijałoby wpis na 3 oddzielne pozycje w odpowiednich działach sklepu. Mały koszt, ogromna wygoda.

---

## 5. Funkcje z aplikacji konkurencyjnych warte rozważenia

Poniżej zestawienie rozwiązań popularnych w **Paprika 3, Mealie, Tandoor, Cookidoo, KptnCook, AnyList i Bring!**, przefiltrowane pod kątem ograniczeń Smoczej strawy (darmowe API, jeden kontener, prosty ekran iPhone'a).

| Funkcja u konkurencji | Kto to ma | Co dałoby się zrobić u nas i jak | Koszt |
| --- | --- | --- | --- |
| **Zamrażarka / gotowe porcje (*Meal Prep*)** | Tandoor, Paprika | W „W domu” albo jako przełącznik na wpisie w „W domu” oznaczenie ❄️ *Zamrożone* + opcjonalna liczba porcji (np. `Bigos (3 porcje)`). Świetne przy gotowaniu dużych garnków na zapas i planowaniu tygodnia. | Mały |
| **Podział na posiłki dnia w Planie** (Śniadanie / Obiad / Kolacja) | Mealie, Tandoor, Paprika | Opcjonalna etykieta `slot` na `MealPlanEntry` (domyślnie „Obiad”, żeby nie komplikować widoku, a gdy w dniu jest więcej dań — czytelna kolejność). Kalendarz `.ics` i `sensor.przepisy_dzis` mogą to od razu uwzględniać. | Mały |
| **Historia cen i „dobra okazja”** | Aplikacje zakupowe / gazetkowe | Archiwizowanie historycznych cen promocyjnych wybranych podstawowych produktów (masło, pierś z kurczaka, olej, kawa) przy wygasaniu gazetek — w efekcie przy promocji aplikacja może pokazać „najtaniej od 3 miesięcy”. Bez dodatkowych zapytań do AI! | Średni |
| **„Wspólna lista zakupów domowników” (tryb pary/domu)** | Bring!, AnyList, Mealie | Dziś każdy domownik ma osobną listę zakupów i osobną spiżarnię (`kitchen.py`). Dla 2 osób mieszkających razem i robiących wspólne zakupy bardzo przydałaby się opcja w Ustawieniach: *„Wspólna lista zakupów i „W domu” z właścicielem”* (albo przełącznik „Domowa / Moja” w Zakupach). | Średni |
| **Podpowiedź przygotowania dzień wcześniej (przypomnienie HA)** | Mealie, Cookidoo | W przepisie/planie wykrywanie kroków typu „marynuj przez noc”, „namocz fasolę”, „wyjmij z zamrażarki” (albo prosta notatka przy zaplanowanym dniu) i wysyłka wieczornego powiadomienia przez HA o 20:00 dzień przed zaplanowanym obiadem. | Mały |
| **Zestawienie składników „Na teraz” w trybie gotowania (Mise en place)** | KptnCook, Cookidoo | W `CookingModePage` przy każdym kroku już pokazujecie pasujące składniki (`stepIngredients.ts`)! Można dodać w nagłówku trybu gotowania szybki podgląd łącznego czasu pozostałych kroków lub automatyczne „Następny krok” po zakończeniu minutnika dla tego kroku. | Mały |
| **Udostępnianie przepisu linkiem (tylko do odczytu)** | Mealie, Tandoor | Dziś udostępnia się przepis jako tekst lub obrazek (`share.ts`, `shareImage.ts`). Jeśli znajomi pytają o przepis, można dodać generowanie jednorazowego lub wygasającego tokenu tylko dla jednego przepisu (`/udostepniony/<token>`), działającego bez hasła aplikacji (tylko przez HTTPS Tailscale Funnel). | Średni |
| **Przelicznik wielkości formy / blachy** | Przepisy cukiernicze / Tandoor | Prosty kalkulator w przeliczniku porcji na ekranie przepisu: *„Mam tortownicę 24 cm zamiast 28 cm”* → automatycznie wylicza współczynnik `scale` (`(24/28)^2 = 0.73`). Zero bazy danych, czysty UI w panelu porcji. | Mały |
| **Własne tagi / etykiety i „Kolekcje”** | Paprika, Mealie | Dziś są kategorie („Obiad”, „Deser”). Brakuje lekkich etykiet przekrojowych (np. `na szybko`, `do pracy`, `na grilla`, `bez laktozy`), gdzie jeden przepis może mieć ich kilka, albo po prostu wielokrotne przypisanie kategorii już to częściowo realizuje — warto ocenić, czy wystarczają obecne kategorie, czy przydałyby się szybkie presety filtrów. | Mały |
| **Tryb „Zakupy na żywo” / powiadomienie z HA po wejściu do sklepu** | Bring! + Home Assistant | Skoro aplikacja już ma integrację z HA: w `plan_sensor.py` (lub nowym sensorze `sensor.przepisy_zakupy`) można wystawiać liczbę pozycji do kupienia + listę z działami, dzięki czemu prosta automatyzacja w HA (strefa Biedronka/Lidl na telefonie) sama wyśle na iPhone'a powiadomienie z linkiem do Zakupów i listą promocji z tego sklepu. | Mały |

---

## 6. Proponowana kolejność prac (jeśli zdecydujecie się wdrażać)

1. **Etap 1 — Higiena i bezpieczeństwo (1 mały PR, niski koszt)**:
   - Izolacja po `user_id` + TTL/limit dla `_suggestions` i `_ideas` oraz minutników (`timers.py`).
   - Limitowanie rozmiaru uploadów strumieniowo + kontrola rozmiaru po rozpakowaniu w `restore_zip()`.
   - Walidacja schematu `http/https` dla `source_url` (backend + front).
   - Weryfikacja DNS przed przekazaniem linku do `yt-dlp`.
2. **Etap 2 — Jakość i odporność na co dzień (1–2 PR-y)**:
   - Trwałe minutniki w SQLite (przeżywają restart kontenera/aktualizację dodatku).
   - Cache sesji domownika (bez otwierania SQLite dla każdej miniaturki).
   - Przeniesienie cache offline przepisów do IndexedDB (żeby `localStorage` nie przepełniał się kosztem kolejki zakupów).
   - Wspólny plik przypadków testowych dopasowywania składników i skalowania (Python + TypeScript).
3. **Etap 3 — Najbardziej opłacalne nowe funkcje (do wyboru po dyskusji)**:
   - Wspólna lista zakupów / spiżarnia dla domowników (opcja w ustawieniach konta).
   - „Usuń zużyte składniki z domu” po ugotowaniu przepisu (`CookedSheet`).
   - Sortowanie „Dawno niegotowane”, wklejanie wielu pozycji na listę zakupów naraz, kalkulator średnicy blachy przy skalowaniu.
   - Sensor `sensor.przepisy_zakupy` w HA pod powiadomienia lokalizacyjne przy sklepie.
