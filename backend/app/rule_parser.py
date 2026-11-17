"""Parser offline de lenguaje natural en español.

Se usa cuando la IA no está configurada o falla. Extrae monto, moneda, fecha,
tipo, categoría y comercio con heurísticas, y devuelve las posiciones de los
fragmentos que respaldan cada campo para que la app pueda resaltarlos.
"""
from __future__ import annotations

import math
import re
from datetime import date, timedelta

from .categories import BRANDS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, KEYWORDS, LABELS_ES
from .schemas import Highlight, ParsedTransaction
from .text import fold

Span = tuple[int, int]

WEEKDAYS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")
MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
NUMBER_WORDS = {
    "un": 1, "una": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "quince": 15, "veinte": 20, "treinta": 30,
    "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80,
    "noventa": 90, "cien": 100, "doscientos": 200, "trescientos": 300, "quinientos": 500,
}
MULTIPLIERS = {
    "mil": 1_000, "k": 1_000, "lucas": 1_000,
    "millon": 1_000_000, "millones": 1_000_000, "palo": 1_000_000, "palos": 1_000_000,
}
USD_MARKERS = {"us$", "u$s", "usd", "dolar", "dolares"}
EUR_MARKERS = {"€", "eur", "euro", "euros"}

_WORD_NUMS = "|".join(sorted(NUMBER_WORDS, key=len, reverse=True))
_MONTHS = "|".join(MONTHS)

AMOUNT_RE = re.compile(
    r"(?P<pre>us\$|u\$s|usd|\$|€|eur|cop)?\s?"
    r"(?<!\w)(?P<num>\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"
    rf"|(?:{_WORD_NUMS})(?=\s+(?:mil|millon|millones)\b))"
    r"(?!\d)"
    r"(?:\s?(?P<mult>millones|millon|mil|lucas|palos|palo|k)\b)?"
    r"(?:\s?(?:de\s+)?(?P<post>dolares|dolar|usd|euros|euro|eur|pesos|peso|cop)\b)?"
)
NON_MONEY_AFTER_RE = re.compile(
    r"\s*(?:(?:dias?|semanas?|meses?|anos?|horas?|minutos?|am|pm|personas?|veces|cuotas|unidades)\b|%|/|:)"
)
SPEND_CUE_RE = re.compile(r"(?:pague|gaste|costo|cuesta|valio|vale|por|de|total)\s*$")

INCOME_VERB_RE = re.compile(
    r"\b(?:recibi|me pagaron|me pago|me consignaron|me transfirieron|me depositaron|"
    r"me entro|me entraron|cobre|gane|vendi|ingreso|ingresaron)\b"
)
EXPENSE_VERB_RE = re.compile(r"\b(?:pague|gaste|compre|invite|pagar|gastar|comprar|me cobraron)\b")
INCOME_NOUN_RE = re.compile(r"\b(?:salario|sueldo|nomina|quincena|prima|honorarios)\b")

_CAP = r"[A-ZÁÉÍÓÚÜÑ][\w'’&.-]*"
MERCHANT_RE = re.compile(
    rf"\b(?i:en|donde)\s+(?:(?:el|la|los|las)\s+)?({_CAP}(?:\s+(?:(?:&|y|de|del)\s+)?{_CAP})*)"
)

_KEYWORD_RES = {
    category: re.compile(
        r"\b(?:" + "|".join(re.escape(k) for k in sorted(words, key=len, reverse=True)) + r")\b"
    )
    for category, words in KEYWORDS.items()
}
_BRAND_RE = re.compile(
    r"\b(" + "|".join(re.escape(b) for b in sorted(BRANDS, key=len, reverse=True)) + r")\b"
)


def parse(text: str, today: date, default_currency: str) -> ParsedTransaction | None:
    """Devuelve la transacción descrita en `text`, o None si no hay monto."""
    folded = fold(text)
    tx_date, date_span = find_date(folded, today)
    found = find_amount(folded, default_currency, exclude=date_span)
    if found is None:
        return None
    amount, currency, amount_span = found

    tx_type = detect_type(folded)
    allowed = INCOME_CATEGORIES if tx_type == "income" else EXPENSE_CATEGORIES
    category, category_span = detect_category(folded, allowed)
    merchant, merchant_span = find_merchant(text, folded)

    highlights = [Highlight(field="amount", start=amount_span[0], end=amount_span[1])]
    if date_span:
        highlights.append(Highlight(field="date", start=date_span[0], end=date_span[1]))
    if category_span:
        highlights.append(Highlight(field="category", start=category_span[0], end=category_span[1]))
    if merchant_span:
        highlights.append(Highlight(field="merchant", start=merchant_span[0], end=merchant_span[1]))

    if category_span:
        keyword = text[category_span[0]:category_span[1]]
        description = keyword[:1].upper() + keyword[1:]
    else:
        description = merchant or LABELS_ES[category]

    confidence = 0.5
    confidence += 0.2 if category != "other" else 0
    confidence += 0.1 if date_span else 0
    confidence += 0.1 if merchant else 0

    return ParsedTransaction(
        type=tx_type,
        amount=round(amount, 2),
        currency=currency,
        date=tx_date,
        merchant=merchant,
        description=description,
        category=category,
        confidence=round(confidence, 2),
        highlights=sorted(highlights, key=lambda h: h.start),
    )


def find_date(folded: str, today: date) -> tuple[date, Span | None]:
    if m := re.search(r"\b(?:antier|anteayer|antes de ayer)\b", folded):
        return today - timedelta(days=2), m.span()
    if m := re.search(r"\bayer\b", folded):
        return today - timedelta(days=1), m.span()
    if m := re.search(r"\bhace\s+(\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete)\s+(dias?|semanas?)\b", folded):
        n = int(m.group(1)) if m.group(1).isdigit() else NUMBER_WORDS[m.group(1)]
        days = n * 7 if m.group(2).startswith("semana") else n
        return today - timedelta(days=days), m.span()
    if m := re.search(r"\b(?:el\s+)?(" + "|".join(WEEKDAYS) + r")(?:\s+pasado)?\b", folded):
        delta = (today.weekday() - WEEKDAYS.index(m.group(1))) % 7 or 7
        return today - timedelta(days=delta), m.span()
    if m := re.search(rf"\b(\d{{1,2}})\s+de\s+({_MONTHS})(?:\s+(?:de|del)\s+(\d{{4}}))?\b", folded):
        explicit_year = int(m.group(3)) if m.group(3) else None
        if (d := _safe_date(explicit_year, MONTHS[m.group(2)], int(m.group(1)), today)) is not None:
            return d, m.span()
    if m := re.search(r"(?<![\d.,$])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?![\d/])", folded):
        year = m.group(3)
        explicit_year = (int(year) + 2000 if len(year) == 2 else int(year)) if year else None
        if (d := _safe_date(explicit_year, int(m.group(2)), int(m.group(1)), today)) is not None:
            return d, m.span()
    if m := re.search(r"\bhoy\b|\besta\s+(?:manana|tarde|noche)\b", folded):
        return today, m.span()
    return today, None


def _safe_date(year: int | None, month: int, day: int, today: date) -> date | None:
    try:
        d = date(year or today.year, month, day)
    except ValueError:
        return None
    if year is None and d > today:
        try:
            d = d.replace(year=d.year - 1)
        except ValueError:  # 29 de febrero
            return None
    return d


def find_amount(folded: str, default_currency: str, exclude: Span | None = None) -> tuple[float, str, Span] | None:
    best: tuple[int, float, str, Span] | None = None
    for m in AMOUNT_RE.finditer(folded):
        start = m.start("pre") if m.group("pre") else m.start("num")
        end = m.end()
        if exclude and start < exclude[1] and end > exclude[0]:
            continue
        if start > 0 and folded[start - 1] in ":/":
            continue
        if NON_MONEY_AFTER_RE.match(folded, m.end("num")) and not m.group("mult"):
            continue

        num = m.group("num")
        value = float(NUMBER_WORDS[num]) if num in NUMBER_WORDS else _to_number(num)
        if m.group("mult"):
            value *= MULTIPLIERS[m.group("mult")]
        if value <= 0 or math.isinf(value):
            continue

        markers = {g for g in (m.group("pre"), m.group("post")) if g}
        score = 2 if markers or m.group("mult") else 0
        score += 1 if SPEND_CUE_RE.search(folded[max(0, start - 12):start]) else 0

        candidate = (score, value, _currency(markers, folded, default_currency), (start, end))
        if best is None or candidate[:2] > best[:2]:
            best = candidate
    if best is None:
        return None
    return best[1], best[2], best[3]


def _to_number(raw: str) -> float:
    s = raw
    if "." in s and "," in s:
        decimal = "." if s.rfind(".") > s.rfind(",") else ","
        thousands = "," if decimal == "." else "."
        s = s.replace(thousands, "").replace(decimal, ".")
    elif "." in s or "," in s:
        sep = "." if "." in s else ","
        parts = s.split(sep)
        # "45.000" y "1.250.000" usan separador de miles; "12.50" es decimal.
        s = s.replace(sep, "") if len(parts) > 2 or len(parts[1]) == 3 else s.replace(sep, ".")
    return float(s)


def _currency(markers: set[str], folded: str, default_currency: str) -> str:
    if markers & USD_MARKERS:
        return "USD"
    if markers & EUR_MARKERS:
        return "EUR"
    if not markers - {"$"} and re.search(r"\b(?:dolares|usd)\b", folded):
        return "USD"
    return default_currency


def detect_type(folded: str) -> str:
    if INCOME_VERB_RE.search(folded):
        return "income"
    if EXPENSE_VERB_RE.search(folded):
        return "expense"
    return "income" if INCOME_NOUN_RE.search(folded) else "expense"


def detect_category(folded: str, allowed: tuple[str, ...]) -> tuple[str, Span | None]:
    best, best_hits, best_span = "other", 0, None
    for category, pattern in _KEYWORD_RES.items():
        if category not in allowed:
            continue
        matches = list(pattern.finditer(folded))
        if len(matches) > best_hits:
            best, best_hits, best_span = category, len(matches), matches[0].span()
    return best, best_span


def find_merchant(text: str, folded: str) -> tuple[str | None, Span | None]:
    for m in MERCHANT_RE.finditer(text):
        name = m.group(1).rstrip(".,-")
        if fold(name) in MONTHS or fold(name) in WEEKDAYS:
            continue
        return name, (m.start(1), m.start(1) + len(name))
    if m := _BRAND_RE.search(folded):
        return BRANDS[m.group(1)], m.span()
    return None, None
