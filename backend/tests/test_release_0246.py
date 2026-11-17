"""0.24.6: marka albo odmiana w domu pokrywa składnik z rodzajem przed nią ("almette" = "serek almette")."""

from app.services.matching import covers, in_stock


def test_marka_po_rodzaju():
    assert covers("almette", "serek almette")
    assert covers("feta", "ser feta")
    assert covers("feta", "sera feta")
    assert covers("spaghetti", "makaron spaghetti")
    assert covers("basmati", "ryż basmati")
    assert in_stock(["almette"], "serek almette lub bieluch (lub pół na pół)")
    assert in_stock(["bieluch"], "serek almette lub bieluch (lub pół na pół)")


def test_bez_rodzaju_dalej_osobno():
    assert not covers("almette", "serek")
    assert not covers("wieprzowa", "karkówka wieprzowa")
    assert not covers("kurczak", "pierś z kurczaka")
    assert not covers("feta", "ser")
