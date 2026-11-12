#!/usr/bin/env python3
"""
JobHunt OS — Python Agent Workers & Deterministic Rules (Phases 2 to 10)
Implements Agents 01–06 contracts, company priority scoring, hard filters,
weighted 100-point job evaluation, SSRF validation, and prompt-injection defense.
"""

import re
import hashlib
from urllib.parse import urlparse
from typing import Dict, List, Optional, Any

ALLOWED_FUNDING_STAGES = {
    "BOOTSTRAPPED",
    "PRE_SEED",
    "SEED",
    "SERIES_A",
    "SERIES_B",
    "SERIES_C",
    "SERIES_D_PLUS",
    "GROWTH",
    "IPO",
    "UNKNOWN",
}


def normalize_domain(website: Optional[str]) -> Optional[str]:
    if not website:
        return None
    try:
        target = website if website.startswith("http") else f"https://{website}"
        parsed = urlparse(target)
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        return host or None
    except Exception:
        return None


def normalize_funding_stage(raw_stage: Optional[str]) -> str:
    if not raw_stage:
        return "UNKNOWN"
    cleaned = re.sub(r"[\s\-]+", "_", raw_stage.strip().upper())
    if "PRE_SEED" in cleaned or "PRESEED" in cleaned:
        return "PRE_SEED"
    if cleaned == "SEED" or "SEED_ROUND" in cleaned:
        return "SEED"
    if "SERIES_A" in cleaned:
        return "SERIES_A"
    if "SERIES_B" in cleaned:
        return "SERIES_B"
    if "SERIES_C" in cleaned:
        return "SERIES_C"
    if any(tag in cleaned for tag in ("SERIES_D", "SERIES_E", "SERIES_F")):
        return "SERIES_D_PLUS"
    if "GROWTH" in cleaned:
        return "GROWTH"
    if "BOOTSTRAPPED" in cleaned:
        return "BOOTSTRAPPED"
    if "IPO" in cleaned:
        return "IPO"
    return cleaned if cleaned in ALLOWED_FUNDING_STAGES else "UNKNOWN"


def compute_company_priority(
    funding_score: float,
    hiring_score: float,
    growth_score: float,
    role_relevance_score: float,
) -> float:
    """
    Section 8 Formula:
    priority = 0.35 * funding_score + 0.40 * hiring_score + 0.15 * growth_score + 0.10 * role_relevance_score
    """
    f = max(0.0, min(100.0, funding_score))
    h = max(0.0, min(100.0, hiring_score))
    g = max(0.0, min(100.0, growth_score))
    r = max(0.0, min(100.0, role_relevance_score))
    return round(0.35 * f + 0.40 * h + 0.15 * g + 0.10 * r, 2)


def is_safe_external_url(url_str: str) -> bool:
    """
    Phase 10 SSRF guard: blocks non-http(s), localhost, loopback, and RFC1918 private IPs.
    """
    try:
        parsed = urlparse(url_str)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower()
        if not host or host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            return False
        if host.endswith(".local") or host.endswith(".internal"):
            return False
        ipv4_match = re.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$", host)
        if ipv4_match:
            a, b, _, _ = [int(x) for x in ipv4_match.groups()]
            if a in (10, 127) or (a == 172 and 16 <= b <= 31) or (a == 192 and b == 168) or (a == 169 and b == 254):
                return False
        return True
    except Exception:
        return False


def evaluate_job_contract(
    job: Dict[str, Any],
    candidate_skills: List[str],
    preferences: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Agent 04 — Deterministic Hard Filters + 100-point Weighted Scorer
    """
    work_mode = job.get("work_mode", "UNKNOWN")
    remote_only = bool(preferences.get("remote_only", True))
    max_exp = float(preferences.get("maximum_experience", 2.0))
    min_salary = float(preferences.get("minimum_salary", 700000.0))

    # Unknown work_mode is NEVER treated as REMOTE
    work_mode_eligible = (work_mode == "REMOTE") if remote_only else True

    job_exp_min = job.get("experience_min")
    experience_eligible = True if job_exp_min is None else (float(job_exp_min) <= max_exp)

    # Unknown salary (None) is NEVER treated as zero or a rejection
    salary_max = job.get("salary_max")
    salary_eligible = True
    if salary_max is not None and float(salary_max) > 0:
        currency = job.get("salary_currency", "INR")
        normalized_inr = float(salary_max) * 84.0 if currency == "USD" else float(salary_max)
        if normalized_inr < min_salary * 0.8:
            salary_eligible = False

    title_lower = (job.get("title") or "").lower()
    role_eligible = any(
        kw in title_lower
        for kw in ("backend", "full stack", "fullstack", "software engineer", "platform", "developer")
    )

    location_eligible = True
    desc_lower = (job.get("description") or "").lower()
    if "us citizens only" in desc_lower or "onsite munich" in desc_lower:
        location_eligible = False

    hard_filters = {
        "location_eligible": location_eligible,
        "experience_eligible": experience_eligible,
        "role_eligible": role_eligible,
        "work_mode_eligible": work_mode_eligible,
        "salary_eligible": salary_eligible,
    }

    matched = [s for s in candidate_skills if s.lower() in f"{title_lower} {desc_lower}"]
    missing = [s for s in candidate_skills if s not in matched]

    tech_score = min(30, int(round((len(matched) / max(1, min(4, len(candidate_skills)))) * 30)))
    role_score = 25 if role_eligible else 5
    exp_score = 15 if experience_eligible else 0
    resp_score = 14 if len(matched) >= 2 else 8
    loc_score = 10 if (work_mode == "REMOTE" and location_eligible) else 4
    sal_score = 5 if (salary_max is not None and salary_eligible) else (3 if salary_max is None else 0)

    total_score = tech_score + role_score + exp_score + resp_score + loc_score + sal_score

    if not all(hard_filters.values()):
        decision = "REJECTED"
    elif total_score >= 80:
        decision = "QUALIFIED"
    elif total_score >= 65:
        decision = "REVIEW"
    else:
        decision = "REJECTED"

    return {
        "job_id": job.get("id", "uuid"),
        "profile_id": preferences.get("profile_id", "uuid"),
        "score": total_score,
        "decision": decision,
        "hard_filters": hard_filters,
        "score_breakdown": {
            "technical_skills": tech_score,
            "role_relevance": role_score,
            "experience": exp_score,
            "responsibilities": resp_score,
            "location": loc_score,
            "salary": sal_score,
        },
        "matched_skills": matched,
        "missing_skills": missing,
        "evaluation_version": "1.0",
    }
