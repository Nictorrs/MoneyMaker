"""Modelos de la API y de la salida estructurada de la IA."""
from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal[
    "food",
    "groceries",
    "transport",
    "housing",
    "utilities",
    "health",
    "entertainment",
    "subscriptions",
    "shopping",
    "education",
    "travel",
    "transfer",
    "salary",
    "freelance",
    "other",
]
TxType = Literal["expense", "income"]
EvidenceField = Literal["amount", "date", "merchant", "category", "type"]
Source = Literal["claude", "rules"]


# --- Salida estructurada que Claude debe producir -----------------------------


class Evidence(BaseModel):
    field: EvidenceField
    quote: str = Field(description="Fragmento copiado literalmente del mensaje del usuario")


class AITransaction(BaseModel):
    type: TxType
    amount: float = Field(description="Monto positivo sin separadores de miles; 45.000 COP es 45000")
    currency: str = Field(description="Código ISO 4217 de tres letras, p. ej. COP, USD, EUR")
    date: str = Field(description="Fecha de la transacción en formato YYYY-MM-DD")
    merchant: str | None = Field(description="Comercio o contraparte; null si no se menciona")
    description: str = Field(description="Descripción breve en español, de 2 a 5 palabras, sin el monto")
    category: Category
    confidence: float = Field(description="Confianza en la extracción, entre 0 y 1")
    evidence: list[Evidence]


class AITextExtraction(BaseModel):
    transactions: list[AITransaction]


class AILineItem(BaseModel):
    name: str
    amount: float


class AIReceiptExtraction(BaseModel):
    is_receipt: bool = Field(description="false si la imagen no es un recibo, factura o comprobante")
    transaction: AITransaction
    line_items: list[AILineItem]
    tax: float | None = Field(description="Impuestos totales (IVA/INC) si aparecen; null si no")


# --- API pública -------------------------------------------------------------


class Highlight(BaseModel):
    field: EvidenceField
    start: int
    end: int


class ParsedTransaction(BaseModel):
    type: TxType
    amount: float
    currency: str
    date: dt.date
    merchant: str | None = None
    description: str
    category: Category
    confidence: float
    highlights: list[Highlight] = Field(default_factory=list)


class CategoryHint(BaseModel):
    """Corrección previa del usuario: este comercio o concepto va en esta categoría."""

    text: str = Field(min_length=1, max_length=60)
    category: Category


class ParseTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    today: dt.date | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    hints: list[CategoryHint] = Field(default_factory=list, max_length=30)


class ParseResponse(BaseModel):
    source: Source
    text: str
    transactions: list[ParsedTransaction]


class LineItem(BaseModel):
    name: str
    amount: float


class ReceiptResponse(BaseModel):
    source: Source
    transaction: ParsedTransaction
    line_items: list[LineItem]
    tax: float | None = None


class CategoryTotal(BaseModel):
    category: Category
    total: float


class SnapshotTransaction(BaseModel):
    date: dt.date
    type: TxType
    amount: float
    category: Category
    merchant: str | None = None


class FinancialSnapshot(BaseModel):
    """Resumen agregado que la app calcula en el dispositivo.

    El Copilot nunca recibe la base de datos completa: solo totales del mes y
    un número acotado de movimientos recientes.
    """

    currency: str = Field(min_length=3, max_length=3)
    today: dt.date
    balance: float
    month_budget: float
    month_spent: float
    month_income: float
    by_category: list[CategoryTotal] = Field(default_factory=list)
    recent: list[SnapshotTransaction] = Field(default_factory=list, max_length=60)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class CopilotRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    snapshot: FinancialSnapshot
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class CopilotResponse(BaseModel):
    source: Source
    answer: str


class CategoryFeedback(BaseModel):
    """Corrección de categoría etiquetada en el dispositivo para re-entrenar el modelo."""

    capture: Literal["ai", "voice", "receipt", "sms", "notification"]
    model: Literal["claude", "rules", "bank-parser", "learned"]
    merchant: str | None = Field(default=None, max_length=60)
    description: str = Field(min_length=1, max_length=80)
    suggested_category: Category
    final_category: Category
    confidence: float | None = Field(default=None, ge=0, le=1)
    day: dt.date


class FeedbackBatch(BaseModel):
    items: list[CategoryFeedback] = Field(min_length=1, max_length=100)


class FeedbackResponse(BaseModel):
    accepted: int
