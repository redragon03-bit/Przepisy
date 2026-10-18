from pathlib import Path

from app.services.ingredients import guess_ingredient_name
from app.services.scraper import read_page

HTML = (Path(__file__).parent / "recipe_page.html").read_text()


def test_reads_structured_recipe():
    page = read_page(HTML, "https://example.com/pancakes")
    assert page.recipe is not None
    assert page.recipe.title == "Fluffy Pancakes"
    assert page.recipe.ingredients[0] == "1 1/2 cups all-purpose flour"
    assert page.recipe.steps == ["Mix the flour and salt.", "Whisk in eggs and milk.", "Fry on a hot pan."]
    assert page.recipe.total_minutes == 25


def test_collects_images_without_icons():
    page = read_page(HTML, "https://example.com/pancakes")
    assert page.image_urls == ["https://example.com/pancakes.jpg", "https://example.com/step1.jpg"]


def test_page_without_recipe():
    page = read_page("<html><body><p>Hello</p></body></html>", "https://example.com")
    assert page.recipe is None
    assert "Hello" in page.text


def test_guess_ingredient_name():
    assert guess_ingredient_name("1 1/2 cups all-purpose flour") == "all-purpose flour"
    assert guess_ingredient_name("200 g mąki pszennej, przesianej") == "mąki pszennej"
    assert guess_ingredient_name("2 eggs") == "eggs"
