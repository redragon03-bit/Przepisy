"""0.10.1: cena schabu nie trafia do soli i pieprzu (AI przypisało produktowi zły składnik)."""

from types import SimpleNamespace

from app.services import ai, promotions


def _promo(ingredient, name):
    return SimpleNamespace(ingredient=ingredient, name=name)


def test_name_fits():
    assert not promotions.name_fits("Schab wieprzowy bez kości", "sól")
    assert not promotions.name_fits("Schab wieprzowy bez kości", "pieprz")
    assert promotions.name_fits("Schab wieprzowy bez kości", "schab")
    assert promotions.name_fits("Jaja z wolnego wybiegu M", "jajko")
    assert promotions.name_fits("Udka z kurczaka", "udo z kurczaka")
    assert promotions.name_fits("Ser Gouda plastry", "ser żółty")
    assert promotions.name_fits("", "sól")


def test_find_for_skips_wrongly_assigned_promo():
    promos = [_promo("sól", "Schab wieprzowy bez kości"), _promo("schab", "Schab wieprzowy bez kości")]
    assert promotions.find_for("sól", promos) is None
    assert promotions.find_for("schab", promos) is promos[1]


def test_saved_promo_drops_wrong_ingredient():
    product = ai.AiPromotion(name="Schab wieprzowy bez kości 14,99 zł", category="jedzenie", ingredient="sól",
                             price="14,99 zł/kg", note="")
    assert promotions._promotion(product).ingredient == ""
