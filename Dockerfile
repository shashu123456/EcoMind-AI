FROM node:20-slim AS fe
WORKDIR /src/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build:static

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# Generate the demo catalog at build time, not at container start. The seed is
# deterministic and idempotent — it skips any dataset already registered — so
# this bakes the SQLite database and both campus CSVs into the image and a cold
# start only has to start uvicorn. Left out of the runtime CMD, a boot spent
# minutes regenerating 440k rows before the port opened.
RUN python seed.py
COPY --from=fe /src/frontend/dist /app/frontend/dist
ENV ECOMIND_PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1
CMD ["sh", "-c", "python seed.py && python run.py"]