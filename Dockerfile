# Obraz z całą aplikacją: frontend (zbudowany) + backend.
# Budowanie:   docker build -t przepisy .
# Uruchomienie: docker run -p 8000:8000 -v przepisy-data:/data -e APP_PASSWORD=... przepisy

# --- Etap 1: budujemy frontend (React -> statyczne pliki HTML/JS/CSS) ---
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Etap 2: backend w Pythonie + gotowy frontend ---
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

ENV DATA_DIR=/data \
    STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1
VOLUME /data
# 8000 = http, 8443 = https (tylko gdy podano certyfikat, patrz app/serve.py)
EXPOSE 8000 8443

CMD ["python", "-m", "app.serve"]
