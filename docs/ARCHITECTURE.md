# JobHunt OS — System Architecture Document

**Version:** 1.0  
**Phase:** Phase 0 (Repository & Engineering Foundation)  
**Status:** Approved & Implemented

---

## 1. Overview & Monorepo Topology

JobHunt OS is architected as a modular monolith with segregated runtime processes:

```text
jobhunt-os/
├── apps/
│   ├── api/          # Express + TypeScript REST API (business logic, validation, health)
│   └── web/          # React + Vite + Tailwind UI (dashboard, CRM, pipelines)
├── services/
│   ├── agents/       # Python Celery workers and deterministic agent pipeline helpers/tasks
│   └── scheduler/    # Celery beat schedules and cadence definitions
├── packages/
│   ├── config/       # Canonical Zod environment validation & runtime configuration
│   ├── contracts/    # Pydantic & Zod input/output schemas for agents, API, and events
│   └── shared-types/ # Shared TypeScript types and enums
├── infrastructure/
│   └── docker/       # Dockerfile.api and Dockerfile.worker
├── docs/             # Architecture, Setup, and Implementation Status tracking
├── docker-compose.yml# PostgreSQL 16 + Redis 7 + API + Worker + Scheduler
└── server.ts         # Unified development & full-stack server
```

---

## 2. Architectural Principles

1. **Deterministic Core:** Deterministic code handles fetching, parsing, normalization, deduplication, hard filtering, and state transitions.
2. **LLM Reasoning Boundary:** LLMs are reserved strictly for semantic matching, ambiguous company research, and personalized drafting.
3. **Safety First:** Outbound cold emails and job applications **must never be dispatched automatically**. Explicit human approval is mandatory.
4. **Data Integrity & Evidence:** Every discovered company, job, and contact preserves its source URL, discovery timestamp, and evidence claims.
5. **Idempotent Workers:** Every background task carries an idempotency key to prevent duplicate records and notifications.

---

## 3. Technology Stack

- **API:** Node.js (v20+ / v22), Express, TypeScript, Zod.
- **Frontend:** React 19, Vite, Tailwind CSS, Lucide icons, Motion.
- **Agent Workers:** Python 3.10+, Celery, Pydantic, Redis.
- **Database:** PostgreSQL 16 (UUID primary keys, TIMESTAMPTZ, JSONB evidence).
- **Queues & Cache:** Redis 7.
- **CI / Quality:** Node test runner (`node:test`), Python `unittest`/`pytest`, TypeScript strict checking.
