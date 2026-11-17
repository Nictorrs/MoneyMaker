"""Configuración leída de variables de entorno en cada solicitud."""
from __future__ import annotations

import os
from dataclasses import dataclass

CREDENTIAL_ENV_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE")


@dataclass(frozen=True)
class Settings:
    environment: str  # "development" | "production"
    model: str
    ai_mode: str  # "auto" | "claude" | "rules"
    app_token: str | None
    default_currency: str
    max_image_bytes: int
    # Archivo JSONL donde se acumulan las correcciones compartidas (opt-in). None = desactivado.
    feedback_path: str | None

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def use_ai(self) -> bool:
        if self.ai_mode == "rules":
            return False
        if self.ai_mode == "claude":
            return True
        return any(os.getenv(name) for name in CREDENTIAL_ENV_VARS)


def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("MONEYMAKER_ENV", "development").strip().lower(),
        model=os.getenv("MONEYMAKER_MODEL", "claude-opus-5"),
        ai_mode=os.getenv("MONEYMAKER_AI_MODE", "auto").strip().lower(),
        app_token=os.getenv("MONEYMAKER_APP_TOKEN") or None,
        default_currency=os.getenv("MONEYMAKER_DEFAULT_CURRENCY", "COP").strip().upper(),
        max_image_bytes=int(float(os.getenv("MONEYMAKER_MAX_IMAGE_MB", "8")) * 1024 * 1024),
        feedback_path=os.getenv("MONEYMAKER_FEEDBACK_PATH") or None,
    )
