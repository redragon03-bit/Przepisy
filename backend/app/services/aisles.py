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
                         "natk", "bazyli", "mięt", "miet", "kolendr", "imbir", "batat", "szparag", "rabarbar"]),
    ("Pieczywo", ["chleb", "bułk", "bulk", "bagietk", "tortill", "pita", "rogal", "pieczyw"]),
    ("Nabiał i jajka", ["mleko", "mleka", "jaj", "masł", "masl", "śmietan", "smietan", "jogurt", "kefir",
                        "maślank", "maslank", "ser", "twaróg", "twarog", "mozzarell", "parmezan", "feta",
                        "mascarpone", "ricott", "serek"]),
    ("Mięso i ryby", ["kurczak", "kurczę", "kurcze", "indyk", "wołow", "wolow", "wieprzow", "schab", "boczek",
                      "boczku", "szynk", "kiełbas", "kielbas", "mięs", "mies", "mielon", "karkówk", "karkowk",
                      "łopatk", "lopatk", "filet", "pierś", "piers", "udk", "skrzydeł", "skrzydel", "łosoś",
                      "losos", "dorsz", "tuńczyk", "tunczyk", "krewet", "ryb", "śledź", "sledz", "makrel",
                      "salami", "parówk", "parowk"]),
    ("Mrożonki", ["mrożon", "mrozon", "lody"]),
    ("Sypkie i makarony", ["mąk", "mak=", "maku=", "cukier", "cukru", "ryż", "ryz", "makaron", "kasz", "płatk", "platk",
                           "bułka tart", "bulka tart", "skrobi", "kakao", "otręb", "otreb", "musli", "granol",
                           "spaghetti", "penne", "lasagne", "kuskus", "quinoa", "komos"]),
    ("Puszki i słoiki", ["puszk", "pomidory z puszki", "passat", "ciecierzyc", "fasola", "fasoli", "soczewic",
                         "kukurydza konserw", "oliwk", "kapar", "dżem", "dzem", "miód", "miod", "mleko kokos",
                         "pesto"]),
    ("Słodycze i bakalie", ["czekolad", "orzech", "migdał", "migdal", "rodzynk", "żurawin", "zurawin", "daktyl",
                            "biszkopt", "herbatnik", "ciastk", "sezam", "słonecznik", "slonecznik", "pestk",
                            "siemi", "chia", "wiórk", "wiork"]),
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


def aisle(text: str) -> str:
    """Dział sklepu dla nazwy produktu albo linijki listy zakupów."""
    words = fold(text).split()
    folded = " ".join(words) + " "
    for name, stems in _FOLDED:
        for stem in stems:
            if stem.endswith("="):  # całe słowo: "mak=" to mak, ale nie makaron
                if stem[:-1] in words:
                    return name
            elif " " in stem:  # kilka słów ("bulka tart", "kawa ") szukamy w całym tekście
                if stem in folded:
                    return name
            elif any(word.startswith(stem) for word in words):  # początek słowa łapie odmianę
                return name
    return OTHER


def aisle_order() -> list[str]:
    return [name for name, _ in AISLES] + [OTHER]
