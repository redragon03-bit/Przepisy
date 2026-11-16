"""0.24.3: produkt w domu pasuje do składnika mimo odmiany i dodatkowych słów, "sól i pieprz" rozbite."""

from app.services.matching import covers, in_stock


def test_odmiana_i_przymiotnik():
    assert covers("karkówka", "karkówki wieprzowej")
    assert covers("karkówka", "karkówka wieprzowa")
    assert covers("ser", "ser żółty")
    assert covers("ser feta", "ser")
    assert covers("jajko", "jajka")


def test_rozne_produkty():
    assert not covers("ser", "serek")
    assert not covers("pomidor", "koncentrat pomidorowy")
    assert not covers("jogurt grecki", "jogurt naturalny")
    assert not covers("czosnek", "bagiety czosnkowe")


def test_kilka_skladnikow_w_jednym():
    assert in_stock(["sól", "pieprz"], "sól i pieprz")
    assert not in_stock(["sól"], "sól i pieprz")
    assert in_stock(["margaryna"], "masło lub margaryna")
    assert in_stock(["sól", "pieprz czarny"], "sól, pieprz")
