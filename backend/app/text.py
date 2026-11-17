"""Utilidades de texto que conservan posiciones para resaltar fragmentos."""
from __future__ import annotations

import unicodedata


def fold(text: str) -> str:
    """Minúsculas y sin tildes, carácter por carácter.

    La salida tiene exactamente la misma longitud que la entrada, así que un
    índice encontrado en el texto plegado sirve para el texto original.
    """
    out = []
    for ch in text:
        base = unicodedata.normalize("NFD", ch)[0].lower()
        out.append(base if len(base) == 1 else ch)
    return "".join(out)


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text).strip()
