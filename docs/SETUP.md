# JobHunt OS — Developer Setup Guide

**Phase:** Phases 0–10 (Complete End-to-End Implementation)

---

## 1. Prerequisites

- **Node.js:** v20.x or v22.x
- **Python:** 3.10 or higher
- **Docker & Docker Compose:** Optional for local development; required for containerized production/staging stack

---

## 2. Quickstart

### 2.1 Install Dependencies

```bash
# Install Node.js packages
npm install

# (Optional) Install Python agent dependencies in a virtual environment
# macOS / Linux:
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/agents/requirements.txt

# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r services/agents/requirements.txt
```

### 2.2 Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` are configured.

### 2.3 Run Local Infrastructure (Docker Compose)

```bash
docker compose up -d postgres redis
```

This boots PostgreSQL 16 on port 5432 and Redis 7 on port 6379 with built-in healthchecks.

### 2.4 Start Development Server

```bash
npm run dev
```

The application starts at `http://localhost:3000`.
- Web UI: `http://localhost:3000/`
- API Health Endpoint: `http://localhost:3000/api/v1/health`
- System Status: `http://localhost:3000/api/v1/system/status`

---

## 3. Running Verification & Tests

```bash
# Run TypeScript & Node.js unit and contract tests
npm test

# Run Python worker health & connectivity tests
npm run test:python

# Run TypeScript type check
npm run lint

# Run standalone Python worker probe
python3 services/agents/src/health_check.py
```
