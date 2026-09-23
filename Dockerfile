FROM node:24-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY backend/ backend/
COPY ["data_for_case/data (1)/data/", "data_for_case/data (1)/data/"]
COPY --from=frontend /app/frontend/dist/ frontend/dist/
RUN uv sync --project backend --no-dev --frozen
EXPOSE 8000
CMD ["sh", "-c", "uv run --project backend --no-sync pipeline && exec uv run --project backend --no-sync uvicorn backend.api:app --host 0.0.0.0 --port 8000"]
