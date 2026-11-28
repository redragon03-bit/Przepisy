"""0.28.0: produkt z tekstu Blixa i ten sam ze strony gazetki łączymy w jeden, ze zdjęciem."""

from app.models import Promotion
from app.services import promotions


def promo(id_: int, name: str, price: str, image: str = "", ingredient: str = "herbata", leaflet: int = 1) -> Promotion:
    row = Promotion(name=name, price=price, image=image, ingredient=ingredient)
    row.id, row.leaflet_id = id_, leaflet
    return row


def test_same_product_needs_price_and_brand():
    text = promo(1, "Herbata Basilur", "34,99 zł")
    page = promo(2, "BASILUR Herbata różne rodzaje 75 g puszka", "34,99 zł", "a.jpg")
    assert promotions.same_product(text, page)
    # Inna cena - inny produkt
    assert not promotions.same_product(text, promo(3, "BASILUR Herbata 75 g", "19,99 zł", "b.jpg"))
    # Wspólne tylko słowo składnika ("herbata") to za mało
    assert not promotions.same_product(promo(4, "Herbata owocowa Teekanne", "4,99 zł"),
                                       promo(5, "VITAX Herbata korzenne przyprawy", "4,99 zł", "c.jpg"))


def test_photo_twins_merge_within_leaflet():
    rows = [
        promo(1, "Herbata Earl Grey Twinings", "24,99 zł"),
        promo(2, "Herbata English Breakfast Twinings", "24,99 zł"),
        promo(3, "TWININGS Herbata Earl Grey, English Breakfast 160 g opakowanie", "24,99 zł", "t.jpg"),
        promo(4, "Twinings Herbata Earl Grey", "24,99 zł", leaflet=2),  # inna gazetka - bez zdjęcia
    ]
    shown, photo_of = promotions.with_photo_twins(rows)
    assert [r.id for r in shown] == [1, 2, 4]
    assert photo_of[1].id == 3 and photo_of[2].id == 3
    assert 4 not in photo_of
