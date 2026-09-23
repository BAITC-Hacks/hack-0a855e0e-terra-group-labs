$ErrorActionPreference = "Stop"

Write-Host "Preparing generic HackAlem scaffold (no task-specific core solution)..."

if (-not (Test-Path "backend")) { New-Item -ItemType Directory backend | Out-Null }
if (-not (Test-Path "frontend")) { New-Item -ItemType Directory frontend | Out-Null }
if (-not (Test-Path "tests")) { New-Item -ItemType Directory tests | Out-Null }

# Backend
if (-not (Test-Path "backend\pyproject.toml")) {
    Push-Location backend
    uv init
    uv add fastapi uvicorn pydantic pydantic-settings httpx
    uv add --dev pytest pytest-asyncio ruff
    Pop-Location
}

# Frontend
if (-not (Test-Path "frontend\package.json")) {
    npm create vite@latest frontend -- --template react-ts
    Push-Location frontend
    npm install
    npm install tailwindcss @tailwindcss/vite lucide-react clsx tailwind-merge zod
    npm install -D @playwright/test
    npx playwright install chromium
    Pop-Location
}

# Warm Playwright MCP package cache so tomorrow does not start with a package download.
npx -y @playwright/mcp@latest --help | Out-Null

Write-Host ""
Write-Host "Base scaffold ready."
Write-Host "Task-gated dependencies (DO NOT install unless challenge needs them):"
Write-Host "  Backend graph: uv add networkx"
Write-Host "  OpenAI API:    uv add openai"
Write-Host "  Frontend graph: npm install @xyflow/react"
Write-Host "  Charts:         npm install recharts"
