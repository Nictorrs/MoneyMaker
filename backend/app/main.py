"""API de IA de MoneyMaker.

Servicio sin estado: no guarda transacciones ni imágenes y no registra el
contenido de las solicitudes. La fuente de verdad vive en el dispositivo.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hmac
import json
import logging
from datetime import date
from pathlib import Path

import anthropic
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import TypeAdapter, ValidationError

from . import ai, finance, rule_parser
from .config import Settings, get_settings
from .schemas import (
    CategoryHint,
    CopilotRequest,
    CopilotResponse,
    FeedbackBatch,
    FeedbackResponse,
    LineItem,
    ParseResponse,
    ParseTextRequest,
    ReceiptResponse,
)
from .text import normalize

log = logging.getLogger("moneymaker.api")

_HINTS_ADAPTER = TypeAdapter(list[CategoryHint])
_FEEDBACK_LOCK = asyncio.Lock()

# En producción no se publica la documentación interactiva ni el esquema OpenAPI.
_expose_docs = not get_settings().is_production
app = FastAPI(
    title="MoneyMaker AI",
    version="0.1.0",
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
)


def require_app_token(
    x_moneymaker_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    if settings.app_token is None:
        if settings.is_production:
            # Mejor fallar cerrado que exponer la API (y la cuenta de IA) sin autenticación.
            raise HTTPException(status_code=503, detail="Servicio sin configurar")
        return
    if not hmac.compare_digest((x_moneymaker_key or "").encode(), settings.app_token.encode()):
        raise HTTPException(status_code=401, detail="Token de app inválido")


def sniff_image_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


@app.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {"status": "ok", "ai": settings.use_ai}


@app.post("/v1/parse/text", response_model=ParseResponse, dependencies=[Depends(require_app_token)])
async def parse_text(req: ParseTextRequest, settings: Settings = Depends(get_settings)) -> ParseResponse:
    text = normalize(req.text)
    today = req.today or date.today()
    currency = (req.currency or settings.default_currency).upper()

    if settings.use_ai:
        try:
            items = await ai.extract_from_text(text, today, currency, settings.model, req.hints)
            return ParseResponse(
                source="claude",
                text=text,
                transactions=[ai.to_parsed(item, text, today, currency) for item in items],
            )
        except (anthropic.APIError, ai.AIRefusal, ValueError) as exc:
            log.warning("NLP con Claude no disponible (%s); se usa el parser de reglas", type(exc).__name__)

    tx = rule_parser.parse(text, today, currency)
    return ParseResponse(source="rules", text=text, transactions=[tx] if tx else [])


@app.post("/v1/parse/receipt", response_model=ReceiptResponse, dependencies=[Depends(require_app_token)])
async def parse_receipt(
    file: UploadFile = File(...),
    today: date | None = Form(default=None),
    currency: str | None = Form(default=None, min_length=3, max_length=3),
    hints: str | None = Form(default=None, max_length=8000),
    settings: Settings = Depends(get_settings),
) -> ReceiptResponse:
    try:
        category_hints = _HINTS_ADAPTER.validate_json(hints) if hints else []
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Preferencias de categoría inválidas") from exc

    data = await file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(status_code=413, detail="La imagen supera el tamaño máximo permitido")
    media_type = sniff_image_type(data)
    if media_type is None:
        raise HTTPException(status_code=415, detail="Formato no soportado: usa JPEG, PNG, WebP o GIF")
    if not settings.use_ai:
        raise HTTPException(status_code=503, detail="El escáner de recibos requiere la IA configurada")

    today = today or date.today()
    currency = (currency or settings.default_currency).upper()
    try:
        result = await ai.extract_from_receipt(data, media_type, today, currency, settings.model, category_hints)
    except ai.AIRefusal as exc:
        raise HTTPException(status_code=422, detail="No se pudo leer el recibo") from exc
    except anthropic.RateLimitError as exc:
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes, intenta en un momento") from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(status_code=503, detail="Servicio de IA no disponible") from exc
    except anthropic.APIStatusError as exc:
        log.error("OCR falló: HTTP %s (request_id=%s)", exc.status_code, exc.request_id)
        raise HTTPException(status_code=502, detail="Error del servicio de IA") from exc

    if not result.is_receipt:
        raise HTTPException(status_code=422, detail="La imagen no parece un recibo")
    return ReceiptResponse(
        source="claude",
        transaction=ai.to_parsed(result.transaction, "", today, currency),
        line_items=[LineItem(name=i.name, amount=i.amount) for i in result.line_items],
        tax=result.tax,
    )


@app.post("/v1/copilot/chat", response_model=CopilotResponse, dependencies=[Depends(require_app_token)])
async def copilot_chat(req: CopilotRequest, settings: Settings = Depends(get_settings)) -> CopilotResponse:
    question = normalize(req.question)
    if settings.use_ai:
        try:
            answer = await ai.copilot_answer(question, req.snapshot, req.history, settings.model)
            return CopilotResponse(source="claude", answer=answer)
        except (anthropic.APIError, ai.AIRefusal) as exc:
            log.warning("Copilot con Claude no disponible (%s); se responde con reglas", type(exc).__name__)
    return CopilotResponse(source="rules", answer=finance.rule_based_answer(question, req.snapshot))


@app.post("/v1/feedback", response_model=FeedbackResponse, dependencies=[Depends(require_app_token)])
async def category_feedback(batch: FeedbackBatch, settings: Settings = Depends(get_settings)) -> FeedbackResponse:
    """Recibe correcciones de categoría que el usuario eligió compartir (opt-in).

    Solo se guardan si el operador configuró MONEYMAKER_FEEDBACK_PATH. No se registra
    IP, token ni texto libre del usuario: únicamente los campos etiquetados.
    """
    if not settings.feedback_path:
        raise HTTPException(status_code=503, detail="La recolección de correcciones está desactivada")

    received_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    lines = "".join(
        json.dumps({**item.model_dump(mode="json"), "received_at": received_at}, ensure_ascii=False) + "\n"
        for item in batch.items
    )
    path = Path(settings.feedback_path)
    async with _FEEDBACK_LOCK:
        await asyncio.to_thread(_append_text, path, lines)
    return FeedbackResponse(accepted=len(batch.items))


def _append_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(text)
