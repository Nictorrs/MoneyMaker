import json
from datetime import date
from typing import get_args

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import ai
from app.categories import ALL_CATEGORIES
from app.main import app
from app.schemas import AITransaction, Category, CategoryHint, Evidence

client = TestClient(app)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

SNAPSHOT = {
    "currency": "COP",
    "today": "2026-09-13",
    "balance": 4200000,
    "month_budget": 2000000,
    "month_spent": 1500000,
    "month_income": 3500000,
    "by_category": [
        {"category": "food", "total": 600000},
        {"category": "transport", "total": 300000},
    ],
    "recent": [],
}


@pytest.fixture(autouse=True)
def rules_mode(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_AI_MODE", "rules")
    monkeypatch.delenv("MONEYMAKER_ENV", raising=False)
    monkeypatch.delenv("MONEYMAKER_APP_TOKEN", raising=False)
    monkeypatch.delenv("MONEYMAKER_MAX_IMAGE_MB", raising=False)


def test_category_literal_matches_catalog():
    assert set(get_args(Category)) == set(ALL_CATEGORIES)


def test_health():
    assert client.get("/health").json() == {"status": "ok", "ai": False}


def test_parse_text_with_rules():
    r = client.post("/v1/parse/text", json={"text": "ayer gasté 45 mil en almuerzo", "today": "2026-09-13"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "rules"
    tx = body["transactions"][0]
    assert (tx["amount"], tx["date"], tx["category"], tx["currency"]) == (45000, "2026-09-12", "food", "COP")
    amount = next(h for h in tx["highlights"] if h["field"] == "amount")
    assert body["text"][amount["start"]:amount["end"]] == "45 mil"


def test_parse_text_without_amount_is_empty():
    r = client.post("/v1/parse/text", json={"text": "hola copilot"})
    assert r.status_code == 200
    assert r.json()["transactions"] == []


def test_claude_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_AI_MODE", "claude")

    async def boom(*args, **kwargs):
        raise anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))

    monkeypatch.setattr(ai, "extract_from_text", boom)
    r = client.post("/v1/parse/text", json={"text": "taxi 18 mil"})
    assert r.status_code == 200
    assert r.json()["source"] == "rules"
    assert r.json()["transactions"][0]["amount"] == 18000


def test_claude_result_is_converted(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_AI_MODE", "claude")
    item = AITransaction(
        type="expense", amount=-20000, currency="cop", date="2026-09-12", merchant="Uber",
        description="Viaje en Uber", category="transport", confidence=1.4,
        evidence=[Evidence(field="amount", quote="20 lucas"), Evidence(field="merchant", quote="uber")],
    )

    async def fake(*args, **kwargs):
        return [item]

    monkeypatch.setattr(ai, "extract_from_text", fake)
    body = client.post("/v1/parse/text", json={"text": "Ayer 20 lucas de Uber"}).json()
    tx = body["transactions"][0]
    assert body["source"] == "claude"
    assert (tx["amount"], tx["currency"], tx["confidence"]) == (20000, "COP", 1.0)
    spans = {h["field"]: body["text"][h["start"]:h["end"]] for h in tx["highlights"]}
    assert spans == {"amount": "20 lucas", "merchant": "Uber"}


def test_production_requires_app_token(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_ENV", "production")
    assert client.post("/v1/parse/text", json={"text": "taxi 10 mil"}).status_code == 503
    assert client.get("/health").status_code == 200

    monkeypatch.setenv("MONEYMAKER_APP_TOKEN", "secreto")
    ok = client.post("/v1/parse/text", json={"text": "taxi 10 mil"}, headers={"X-MoneyMaker-Key": "secreto"})
    assert ok.status_code == 200


def test_app_token(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_APP_TOKEN", "secreto")
    assert client.post("/v1/parse/text", json={"text": "taxi 10 mil"}).status_code == 401
    ok = client.post("/v1/parse/text", json={"text": "taxi 10 mil"}, headers={"X-MoneyMaker-Key": "secreto"})
    assert ok.status_code == 200


def test_receipt_rejects_non_images():
    r = client.post("/v1/parse/receipt", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 415


def test_receipt_rejects_large_files(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_MAX_IMAGE_MB", "0.00001")
    r = client.post("/v1/parse/receipt", files={"file": ("r.png", PNG, "image/png")})
    assert r.status_code == 413


def test_receipt_requires_ai():
    r = client.post("/v1/parse/receipt", files={"file": ("r.png", PNG, "image/png")})
    assert r.status_code == 503


def test_copilot_rules_projects_overdraft():
    r = client.post("/v1/copilot/chat", json={"question": "¿Me alcanza el presupuesto?", "snapshot": SNAPSHOT})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "rules"
    assert "día 18" in body["answer"]
    assert "$1.500.000 COP" in body["answer"]


def test_copilot_rules_category_question():
    r = client.post("/v1/copilot/chat", json={"question": "¿Cuánto llevo en comida?", "snapshot": SNAPSHOT})
    assert "$600.000 COP en comida, el 40%" in r.json()["answer"]


def test_hints_reach_the_model(monkeypatch):
    monkeypatch.setenv("MONEYMAKER_AI_MODE", "claude")
    captured = {}

    async def fake(text, today, currency, model, hints=()):
        captured["hints"] = [(h.text, h.category) for h in hints]
        return []

    monkeypatch.setattr(ai, "extract_from_text", fake)
    r = client.post(
        "/v1/parse/text",
        json={"text": "Compra en Apple 90 dólares", "hints": [{"text": "Apple", "category": "shopping"}]},
    )
    assert r.status_code == 200
    assert captured["hints"] == [("Apple", "shopping")]
    assert '"Apple" → shopping' in ai._hints_block([CategoryHint(text="Apple", category="shopping")])
    assert ai._hints_block([]) == ""


def test_invalid_hints_are_rejected():
    r = client.post("/v1/parse/text", json={"text": "taxi 10 mil", "hints": [{"text": "Apple", "category": "tecnologia"}]})
    assert r.status_code == 422
    bad = client.post(
        "/v1/parse/receipt",
        files={"file": ("r.png", PNG, "image/png")},
        data={"hints": "no es json"},
    )
    assert bad.status_code == 422


FEEDBACK = {
    "items": [
        {
            "capture": "ai",
            "model": "claude",
            "merchant": "Apple",
            "description": "Compra en Apple",
            "suggested_category": "entertainment",
            "final_category": "shopping",
            "confidence": 0.62,
            "day": "2026-09-16",
        }
    ]
}


def test_feedback_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("MONEYMAKER_FEEDBACK_PATH", raising=False)
    assert client.post("/v1/feedback", json=FEEDBACK).status_code == 503


def test_feedback_is_appended_when_enabled(monkeypatch, tmp_path):
    target = tmp_path / "feedback" / "corrections.jsonl"
    monkeypatch.setenv("MONEYMAKER_FEEDBACK_PATH", str(target))
    assert client.post("/v1/feedback", json=FEEDBACK).json() == {"accepted": 1}
    assert client.post("/v1/feedback", json=FEEDBACK).status_code == 200
    rows = [json.loads(line) for line in target.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 2
    assert rows[0]["final_category"] == "shopping" and rows[0]["suggested_category"] == "entertainment"
    assert "received_at" in rows[0]
    invalid = {"items": [{**FEEDBACK["items"][0], "final_category": "tecnologia"}]}
    assert client.post("/v1/feedback", json=invalid).status_code == 422


def test_to_parsed_invalid_date_uses_today():
    item = AITransaction(
        type="expense", amount=1, currency="??", date="mañana", merchant=None,
        description="", category="other", confidence=0.2, evidence=[],
    )
    tx = ai.to_parsed(item, "", date(2026, 9, 13), "COP")
    assert (tx.date, tx.currency, tx.description) == (date(2026, 9, 13), "COP", "Otros")


@pytest.mark.parametrize(
    ("tx_type", "category", "expected"),
    [("income", "food", "other"), ("expense", "salary", "other"), ("income", "transfer", "transfer"),
     ("expense", "food", "food")],
)
def test_to_parsed_keeps_category_valid_for_the_type(tx_type, category, expected):
    item = AITransaction(
        type=tx_type, amount=1000, currency="COP", date="2026-09-13", merchant=None,
        description="Movimiento", category=category, confidence=0.9, evidence=[],
    )
    assert ai.to_parsed(item, "", date(2026, 9, 13), "COP").category == expected
