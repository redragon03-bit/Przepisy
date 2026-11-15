"""Działy sklepu dla listy zakupów: "200 g mąki" -> "Sypkie i makarony".

Zwykły słownik początków słów (bez AI - działa od razu i bez limitów).
Porównujemy bez ogonków i wielkości liter, a początki słów łapią polską odmianę:
"pomidor" pasuje do "pomidory" i "pomidorów". Działy sprawdzamy w kolejności CHECK_ORDER i pierwszy pasujący wygrywa,
więc "sok z cytryny" trafia do napojów, a "pomidory z puszki" do puszek, nie do warzyw.
"""

from ..database import fold

OTHER = "Inne"

# Kolejność działów = kolejność na liście zakupów (mniej więcej jak w sklepie).
# "slowo=" pasuje tylko do całego słowa, "dwa slowa" - do fragmentu tekstu, reszta - do początku słowa.
AISLES: list[tuple[str, list[str]]] = [
    ("Napoje", ["sok", "woda mineraln", "napoj", "piwo", "wino=", "wina=", "kawa=", "kawy=", "kawa ", "herbat",
                "lemoniad"]),
    ("Przyprawy i sosy", ["sol=", "soli=", "pieprz", "papryka slodk", "papryka ostr", "papryka wedzon", "oregano",
                          "bazyli suszon", "majeranek", "tymianek", "kmin", "cynamon", "curry", "kurkum",
                          "imbir mielon", "galk", "ziele angielsk", "lisc laurow", "przyprawa", "musztard",
                          "ketchup", "majonez", "sos sojow", "ocet", "koncentrat", "bulion", "kostk",
                          "chili", "goździk", "gozdzik", "wanili", "ekstrakt", "drożdż", "drozdz",
                          "proszek do piecz", "soda"]),
    ("Warzywa i owoce", ["pomidor", "ogór", "ogor", "cebul", "czosn", "ziemniak", "marchew", "marchwi",
                         "pietrusz", "seler", "por=", "pory=", "papryk", "cukini", "bakłażan", "baklazan",
                         "dyni", "dynia", "kapust", "brokuł", "brokul", "kalafior", "szpinak", "sałat", "salat",
                         "rukol", "rzodkiew", "burak", "groszek", "fasolk", "kukurydz", "pieczark", "grzyb",
                         "jabł", "jabl", "grusz", "banan", "cytryn", "limonk", "pomarańcz", "pomarancz",
                         "truskaw", "malin", "borówk", "borowk", "jagod", "winogron", "awokado", "mango",
                         "ananas", "kiwi", "śliwk", "sliwk", "wiśni", "wisni", "koperek", "koper", "szczypior",
                         "natk", "bazyli", "mięt", "miet", "kolendr", "imbir", "batat", "szparag", "rabarbar",
                         "pomelo", "pomel", "grejpfrut", "mandaryn", "klementyn", "arbuz", "melon", "brzoskwi",
                         "nektaryn", "morel", "granat", "figi=", "figa=", "persymon", "kaki=", "marakuj", "liczi",
                         "agrest", "porzeczk", "czereśn", "czeresn", "jarmuż", "jarmuz", "kalarep", "rzepa",
                         "brukselk", "fenkuł", "fenkul", "topinambur", "chrzan", "ziemniaczk", "kartof",
                         "owoc", "warzyw"]),
    ("Pieczywo", ["chleb", "bułk", "bulk", "bułecz", "bulecz", "bagiet", "tortill", "pita", "rogal", "pieczyw",
                  "kajzer", "grahamk", "chałk", "chalk", "croissant", "bajgl", "bajgiel", "ciabatt", "focacci",
                  "pumpernikiel", "wek=", "weka=", "drożdżówk", "drozdzowk"]),
    ("Nabiał i jajka", ["mleko", "mleka", "jaj", "masł", "masl", "śmietan", "smietan", "jogurt", "kefir",
                        "maślank", "maslank", "ser", "twaróg", "twarog", "mozzarell", "mozarell", "parmezan", "feta",
                        "mascarpone", "ricott", "serek", "gorgonzol", "goud", "edam", "brie=",
                        "camembert", "cheddar", "emmental", "halloumi", "burrat", "grana padano", "pecorino",
                        "oscypek", "oscypk", "bundz", "skyr", "budyń", "budyn", "deser mleczn"]),
    ("Mięso i ryby", ["kurczak", "kurczę", "kurcze", "indyk", "wołow", "wolow", "wieprzow", "schab", "boczek",
                      "boczku", "szynk", "kiełbas", "kielbas", "mięs", "mies", "mielon", "karkówk", "karkowk",
                      "łopatk", "lopatk", "filet", "pierś", "piers", "udk", "skrzydeł", "skrzydel", "łosoś",
                      "losos", "dorsz", "tuńczyk", "tunczyk", "krewet", "ryb", "śledź", "sledz", "makrel",
                      "salami", "parówk", "parowk", "pasztet", "wędlin", "wedlin", "kabanos", "polędwic", "poledwic",
                      "golonk", "golonek", "żeberk", "zeberk", "kaszank", "salceson", "mortadel", "baleron",
                      "wątrób", "watrob", "wątróbk", "watrobk", "flaki", "pieczeń", "pieczen", "owoce morza",
                      "kaczk", "gęś=", "gęsi=", "gęsin", "królik", "krolik", "cielęc", "cielec", "jagnię", "jagnie",
                      "baranin", "konin", "pstrąg", "pstrag", "halibut", "mintaj", "tilapi", "sandacz",
                      "kalmar", "małż", "malz", "sushi", "surimi", "frankfurter", "chorizo", "prosciutto",
                      "pancett", "bekon", "kiszk"]),
    ("Mrożonki", ["mrożon", "mrozon", "lody"]),
    ("Sypkie i makarony", ["mąk", "mak=", "maku=", "cukier", "cukru", "ryż", "ryz", "makaron", "kasz", "płatk", "platk",
                           "bułka tart", "bulka tart", "skrobi", "kakao", "otręb", "otreb", "musli", "granol",
                           "spaghetti", "penne", "lasagne", "kuskus", "quinoa", "komos"]),
    ("Puszki i słoiki", ["puszk", "puszc", "konserw", "pomidory z puszki", "passat", "ciecierzyc",
                         "fasola", "fasoli", "soczewic",
                         "kukurydza konserw", "oliwk", "kapar", "dżem", "dzem", "miód", "miod", "mleko kokos",
                         "pesto"]),
    ("Słodycze i bakalie", ["czekolad", "orzech", "migdał", "migdal", "rodzynk", "żurawin", "zurawin", "daktyl",
                            "biszkopt", "herbatnik", "ciastk", "sezam", "słonecznik", "slonecznik", "pestk",
                            "siemi", "chia", "wiórk", "wiork", "wafel", "wafl", "wafelk", "cukierk", "żelk", "zelk",
                            "baton", "lizak", "krówk", "krowk", "ptasie mleczko", "pralin", "trufl", "chałw",
                            "chalw", "draż", "draz", "tort=", "torty=", "tortu=", "sernik", "piernik",
                            "rurki waflow", "chips", "czipsy", "paluszk", "krakers", "precl", "popcorn", "nachos",
                            "słodycz", "slodycz", "pistacj", "nerkow", "laskow", "pekan", "makadami", "figi suszon",
                            "morele suszon", "śliwki suszon", "sliwki suszon", "bakali"]),
    ("Tłuszcze", ["olej", "oliw", "smalec", "margaryn"]),
    ("Chemia i dom", ["papier", "folia", "folii", "worki", "workó", "rękaw", "rekaw", "płyn", "plyn", "gąbk",
                      "gabk", "ręcznik", "recznik", "serwetk"]),
]

# Najpierw działy z nazwami, które zaczynają się jak produkty z innych działów
# ("serwetki" to nie ser, "mleko kokosowe" to nie nabiał)
CHECK_ORDER = ["Chemia i dom", "Napoje", "Przyprawy i sosy", "Puszki i słoiki", "Mrożonki",
               "Słodycze i bakalie", "Warzywa i owoce", "Pieczywo", "Nabiał i jajka", "Mięso i ryby",
               "Sypkie i makarony", "Tłuszcze"]

# Ten sam słownik bez ogonków (porównujemy teksty przepuszczone przez fold)
_STEMS = dict(AISLES)
_FOLDED = [(name, [fold(stem) for stem in _STEMS[name]]) for name in CHECK_ORDER]

# Końcówki przymiotników: "bagiety czosnkowe" to pieczywo, nie czosnek, a "mielony pieprz" - przyprawa.
# Takie słowa sprawdzamy dopiero, gdy żadne inne nie pasuje ("rurki waflowe" -> wafle -> słodycze).
_ADJECTIVE_ENDINGS = ("owy", "owa", "owe", "owej", "owego", "owych", "ony", "ona", "one", "onych", "ane",
                      "ski", "ska", "skie", "cki", "cka", "ckie")
# Słowa, które same mówią o dziale, gdziekolwiek stoją ("mrożone truskawki" leżą w zamrażarce,
# "pomidory z puszki" - przy puszkach)
_ALWAYS = {fold(s) for s in _STEMS["Mrożonki"] + ["puszk", "puszc", "konserw"]}

# Działy, które AI odgadło dla nazw spoza słownika (patrz services/aisle_guess.py): fold(nazwa) -> dział
learned: dict[str, str] = {}


def _word_matches(word: str, stem: str) -> bool:
    if stem.endswith("="):  # całe słowo: "mak=" to mak, ale nie makaron
        return word == stem[:-1]
    return word.startswith(stem)  # początek słowa łapie odmianę


def _word_aisle(word: str) -> str | None:
    for name, stems in _FOLDED:
        if any(" " not in stem and _word_matches(word, stem) for stem in stems):
            return name
    return None


def _adjective(word: str) -> bool:
    return len(word) > 4 and word.endswith(_ADJECTIVE_ENDINGS)


def known_aisle(text: str) -> str:
    """Dział ze słownika, bez AI; OTHER, gdy słownik nie zna produktu.

    Najważniejsze jest pierwsze pasujące słowo, które nie wygląda na przymiotnik - zwykle to sam produkt
    ("bagiety czosnkowe", "sok z cytryny", "olej z pestek dyni"). Zwroty z kilku słów ("pomidory z puszki",
    "mleko kokosowe") i mrożonki sprawdzamy przed pojedynczymi słowami.
    """
    words = fold(text).split()
    folded = " ".join(words) + " "
    for name, stems in _FOLDED:
        for stem in stems:
            if " " in stem and stem in folded:  # kilka słów ("bulka tart", "kawa ") w całym tekście
                return name
            if stem in _ALWAYS and any(_word_matches(w, stem) for w in words):
                return name
    for nouns_only in (True, False):
        for word in words:
            if nouns_only and _adjective(word):
                continue
            found = _word_aisle(word)
            if found:
                return found
    return OTHER


def aisle(text: str) -> str:
    """Dział sklepu dla nazwy produktu albo linijki listy zakupów (słownik, a gdy go nie zna - podpowiedź AI)."""
    found = known_aisle(text)
    if found == OTHER:
        return learned.get(guess_key(text), OTHER)
    return found


_UNITS = {"szt", "g", "dag", "kg", "ml", "l", "op", "opak", "opakowanie", "opakowania", "x"}


def guess_key(text: str) -> str:
    """Klucz podpowiedzi AI: nazwa bez ogonków, wielkości liter, liczb i jednostek ("Rurki waflowe 2+1 szt." =
    "rurki waflowe")."""
    words = [w for w in fold(text).replace("/", " ").split()
             if not any(ch.isdigit() for ch in w) and w.rstrip(".") not in _UNITS]
    return " ".join(words)[:200]


def aisle_order() -> list[str]:
    return [name for name, _ in AISLES] + [OTHER]
