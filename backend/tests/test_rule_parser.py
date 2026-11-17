from datetime import date

import pytest

from app.rule_parser import parse

TODAY = date(2026, 9, 13)  # domingo


def slice_for(text, tx, field):
    h = next(h for h in tx.highlights if h.field == field)
    return text[h.start:h.end]


@pytest.mark.parametrize(
    ("text", "amount"),
    [
        ("Gasté 45.000 en almuerzo", 45000),
        ("almuerzo 45 mil", 45000),
        ("taxi 18k", 18000),
        ("me pagaron el sueldo, 3.500.000", 3500000),
        ("mercado en el Éxito por 250.000,50", 250000.5),
        ("cincuenta mil de gasolina", 50000),
        ("2 millones de arriendo", 2000000),
        ("compré 2 cafés de 8000", 8000),
    ],
)
def test_amounts(text, amount):
    tx = parse(text, TODAY, "COP")
    assert tx is not None
    assert tx.amount == pytest.approx(amount)


def test_foreign_currency_and_brand():
    tx = parse("pagué $12.50 dólares de Netflix", TODAY, "COP")
    assert (tx.amount, tx.currency, tx.category, tx.merchant) == (12.5, "USD", "subscriptions", "Netflix")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("ayer gasté 20 mil en taxi", date(2026, 9, 12)),
        ("antier pagué 30 mil de luz", date(2026, 9, 11)),
        ("el lunes pagué 30 mil de luz", date(2026, 9, 7)),
        ("hace 3 días gasté 15 mil en cine", date(2026, 9, 10)),
        ("el 5 de septiembre compré ropa por 120 mil", date(2026, 9, 5)),
        ("25/12 regalo 80 mil", date(2025, 12, 25)),
        ("almuerzo 20 mil", TODAY),
    ],
)
def test_dates(text, expected):
    tx = parse(text, TODAY, "COP")
    assert tx.date == expected


def test_date_numbers_are_not_amounts():
    assert parse("hace 3 días gasté 15 mil en cine", TODAY, "COP").amount == 15000
    assert parse("25/12 regalo 80 mil", TODAY, "COP").amount == 80000


def test_income_and_category():
    tx = parse("me pagaron el sueldo, 3.500.000", TODAY, "COP")
    assert (tx.type, tx.category) == ("income", "salary")
    # Pagar el salario de otra persona es un gasto.
    assert parse("pagué el salario de la empleada 1.300.000", TODAY, "COP").type == "expense"


def test_merchant_and_highlights():
    text = "ayer almuerzo en Crepes & Waffles 62.000"
    tx = parse(text, TODAY, "COP")
    assert tx.merchant == "Crepes & Waffles"
    assert tx.category == "food"
    assert slice_for(text, tx, "amount") == "62.000"
    assert slice_for(text, tx, "date") == "ayer"
    assert slice_for(text, tx, "merchant") == "Crepes & Waffles"
    assert slice_for(text, tx, "category") == "almuerzo"


def test_highlights_survive_accents():
    text = "gasté 45 mil en almuerzo ayer"
    tx = parse(text, TODAY, "COP")
    assert slice_for(text, tx, "amount") == "45 mil"
    assert tx.description == "Almuerzo"


def test_no_amount_returns_none():
    assert parse("hoy fui al cine con mis amigos", TODAY, "COP") is None
