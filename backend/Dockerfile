FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MONEYMAKER_ENV=production

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt \
    && useradd --create-home --uid 10001 moneymaker

COPY app ./app

USER moneymaker
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

# Detrás del balanceador HTTPS de la nube: confiar en X-Forwarded-* y ocultar el header Server.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
