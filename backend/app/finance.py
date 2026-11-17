"""Proyección del mes y respuestas del Copilot calculadas sin IA."""
from __future__ import annotations

import calendar
import math
import re
from dataclasses import dataclass

from .categories import ALL_CATEGORIES, LABELS_ES
from .rule_parser import detect_category
from .schemas import FinancialSnapshot
from .text import fold

ZERO_DECIMAL_CURRENCIES = {"COP", "CLP", "PYG", "JPY", "KRW"}

BUDGET_RE = re.compile(
    r"\b(?:presupuesto|alcanza|alcanzar|sobregiro|queda|quedan|restante|proyeccion|fin de mes|ritmo)\b"
)
INCOME_RE = re.compile(r"\b(?:ingresos?|gane|ganado|entrado|entro)\b")


@dataclass(frozen=True)
class Projection:
    days_in_month: int
    days_left: int
    daily_rate: float
    projected_spend: float
    remaining: float
    overdraft_day: int | None


def format_money(amount: float, currency: str) -> str:
    decimals = 0 if currency in ZERO_DECIMAL_CURRENCIES else 2
    digits = f"{abs(amount):,.{decimals}f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{'-' if amount < 0 else ''}${digits} {currency}"


def project_month(s: FinancialSnapshot) -> Projection:
    days_in_month = calendar.monthrange(s.today.year, s.today.month)[1]
    elapsed = s.today.day
    daily_rate = s.month_spent / elapsed
    projected = daily_rate * days_in_month
    overdraft_day = None
    if s.month_budget > 0 and daily_rate > 0 and projected > s.month_budget:
        overdraft_day = min(days_in_month, max(elapsed, math.ceil(s.month_budget / daily_rate)))
    return Projection(
        days_in_month=days_in_month,
        days_left=days_in_month - elapsed,
        daily_rate=daily_rate,
        projected_spend=projected,
        remaining=s.month_budget - s.month_spent,
        overdraft_day=overdraft_day,
    )


def rule_based_answer(question: str, s: FinancialSnapshot) -> str:
    q = fold(question)
    money = lambda value: format_money(value, s.currency)  # noqa: E731

    if BUDGET_RE.search(q):
        return _budget_answer(s, project_month(s), money)
    if INCOME_RE.search(q):
        net = s.month_income - s.month_spent
        return (
            f"Este mes llevas {money(s.month_income)} en ingresos y {money(s.month_spent)} en gastos, "
            f"un flujo neto de {money(net)}."
        )

    totals = {c.category: c.total for c in s.by_category}
    category, span = detect_category(q, ALL_CATEGORIES)
    if span is None:
        category = next((c for c in ALL_CATEGORIES if fold(LABELS_ES[c]) in q and c != "other"), None)
    if category:
        spent = totals.get(category, 0.0)
        share = spent / s.month_spent * 100 if s.month_spent else 0
        return (
            f"Este mes llevas {money(spent)} en {LABELS_ES[category].lower()}, "
            f"el {share:.0f}% de tu gasto total."
        )

    top = max(s.by_category, key=lambda c: c.total, default=None)
    summary = f"Este mes llevas {money(s.month_spent)} en gastos y {money(s.month_income)} en ingresos."
    if top and top.total > 0:
        summary += f" Tu categoría más alta es {LABELS_ES[top.category].lower()} con {money(top.total)}."
    return summary + " " + _budget_answer(s, project_month(s), money)


def _budget_answer(s: FinancialSnapshot, p: Projection, money) -> str:
    if s.month_budget <= 0:
        return "Aún no tienes un presupuesto mensual. Defínelo y te aviso si vas camino a pasarte."
    if p.remaining < 0:
        return (
            f"Ya superaste tu presupuesto por {money(-p.remaining)}: llevas {money(s.month_spent)} de "
            f"{money(s.month_budget)}. A este ritmo cerrarías el mes en {money(p.projected_spend)}."
        )
    if p.overdraft_day:
        daily_limit = max(p.remaining, 0) / max(p.days_left, 1)
        return (
            f"Llevas {money(s.month_spent)} de {money(s.month_budget)}. A tu ritmo actual "
            f"({money(p.daily_rate)} por día) cerrarías el mes en {money(p.projected_spend)} y "
            f"agotarías el presupuesto hacia el día {p.overdraft_day}. Para evitar el sobregiro, "
            f"tu límite diario desde hoy sería {money(daily_limit)}."
        )
    return (
        f"Vas bien: te quedan {money(p.remaining)} y la proyección de cierre es "
        f"{money(p.projected_spend)}, dentro de tu presupuesto."
    )
