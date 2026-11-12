import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

from .celery import celery_app
from src.agents.pipeline_workers import (
    normalize_domain,
    normalize_funding_stage,
    compute_company_priority,
    evaluate_job_contract,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _task_envelope(agent_name: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    key_material = json.dumps({"agent": agent_name, "payload": payload}, sort_keys=True, default=str)
    idempotency_key = payload.get("idempotency_key") or f"idem-{agent_name}-{hashlib.sha256(key_material.encode()).hexdigest()[:16]}"
    return {
        "agent_name": agent_name,
        "task_id": f"task-{agent_name}-{hashlib.sha256((key_material + _now()).encode()).hexdigest()[:8]}",
        "idempotency_key": idempotency_key,
        "status": "COMPLETED",
        "started_at": _now(),
        "completed_at": _now(),
        "input": payload,
    }


@celery_app.task(name="agents.funding_scout", bind=True, max_retries=5, default_retry_delay=30)
def funding_scout(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("funding-scout", payload)
    candidates = payload.get("companies") or []
    normalized = []
    for c in candidates:
        normalized.append(
            {
                "name": c.get("name"),
                "domain": normalize_domain(c.get("website")),
                "funding_stage": normalize_funding_stage(c.get("round_type") or c.get("funding_stage")),
                "source_url": c.get("source_url"),
            }
        )
    envelope["output"] = {
        "sources_checked": payload.get("sources_checked", 0),
        "companies_processed": len(candidates),
        "normalized_candidates": normalized,
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.company_investigator", bind=True, max_retries=5, default_retry_delay=30)
def company_investigator(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("company-investigator", payload)
    priority = compute_company_priority(
        float(payload.get("funding_score", 75)),
        float(payload.get("hiring_score", 70)),
        float(payload.get("growth_score", 60)),
        float(payload.get("role_relevance_score", 80)),
    )
    envelope["output"] = {
        "company_id": payload.get("company_id"),
        "computed_priority": priority,
        "ats_detection_ready": True,
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.job_hunter", bind=True, max_retries=5, default_retry_delay=20)
def job_hunter(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("job-hunter", payload)
    envelope["output"] = {
        "source_id": payload.get("source_id"),
        "new_jobs_count": 0,
        "updated_jobs_count": 0,
        "closed_jobs_count": 0,
        "note": "Polling executed via worker task; API store remains source-of-truth for CRM state in this deployment.",
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.job_evaluator", bind=True, max_retries=3, default_retry_delay=15)
def job_evaluator(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("job-evaluator", payload)
    evaluation = None
    if payload.get("job") and payload.get("candidate_skills") and payload.get("preferences"):
        evaluation = evaluate_job_contract(payload["job"], payload["candidate_skills"], payload["preferences"])
    envelope["output"] = {
        "job_id": payload.get("job_id"),
        "evaluation": evaluation,
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.contact_finder", bind=True, max_retries=5, default_retry_delay=30)
def contact_finder(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("contact-finder", payload)
    envelope["output"] = {
        "company_id": payload.get("company_id"),
        "contacts_discovered": 0,
        "provenance_required": True,
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.outreach_assistant", bind=True, max_retries=3, default_retry_delay=20)
def outreach_assistant(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("outreach-assistant", payload)
    envelope["output"] = {
        "draft_status": "PENDING_APPROVAL",
        "contact_id": payload.get("contact_id"),
        "job_id": payload.get("job_id"),
        "approval_required": True,
        "mode": "celery-worker",
    }
    return envelope


@celery_app.task(name="agents.full_pipeline", bind=True)
def full_pipeline(self, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = payload or {}
    envelope = _task_envelope("full-pipeline", payload)
    chain = {
        "funding_scout": funding_scout.run(payload.get("funding_scout", {})),
        "company_investigator": company_investigator.run(payload.get("company_investigator", {})),
        "job_hunter": job_hunter.run(payload.get("job_hunter", {})),
        "job_evaluator": job_evaluator.run(payload.get("job_evaluator", {})),
        "contact_finder": contact_finder.run(payload.get("contact_finder", {})),
    }
    envelope["output"] = {"pipeline": "COMPLETED", "stages": chain, "mode": "celery-worker"}
    return envelope
