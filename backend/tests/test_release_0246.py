"""0.24.6: marka albo odmiana w domu pokrywa składnik z rodzajem przed nią ("almette" = "serek almette")."""

from app.services.matching import covers, in_stock


def test_marka_po_rodzaju():
    assert covers("almette", "serek almette")
    assert covers("feta", "ser feta")
    assert covers("almette", "1 serek almette")
    assert covers("feta", "sera feta")
    assert covers("spaghetti", "makaron spaghetti")
    assert covers("almette", "serek Almette (np. ziołowy)")
    assert covers("basmati", "ryż basmati")
    assert in_stock(["almette"], "serek almette lub bieluch (lub pół na pół)")
    assert in_stock(["bieluch"], "serek almette lub bieluch (lub pół na pół)")


def test_bez_rodzaju_dalej_osobno():
    assert not covers("almette", "serek")
    assert not covers("wieprzowa", "karkówka wieprzowa")
    assert not covers("kurczak", "pierś z kurczaka")
    assert not covers("feta", "ser")
    assert not covers("rosół", "makaron do rosołu")
    assert not covers("pierogi", "mąka do pierogów")
    assert not covers("spaghetti", "sos do spaghetti")
    assert not covers("pomidory", "sos z pomidorów")
    assert not covers("kurczak", "kiełbasa z kurczaka")
    assert not covers("curry", "pasta curry")
    assert not covers("chili", "sos chili")
