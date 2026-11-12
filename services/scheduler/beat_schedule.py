"""Canonical beat schedule metadata for JobHunt OS.

The active Celery beat configuration is defined in
`services/agents/src/celery_app/celery.py` so the worker image can run both
worker and beat processes from the same app. This module documents the intended
cadences and can be imported by tooling/ops scripts.
"""

BEAT_SCHEDULE = {
    "funding-scout-daily": {
        "task": "agents.funding_scout",
        "schedule_seconds": 86400,
        "queue": "funding-discovery",
        "description": "Daily funded-company discovery sweep",
    },
    "job-hunter-frequent": {
        "task": "agents.job_hunter",
        "schedule_seconds": 900,
        "queue": "job-discovery",
        "description": "Poll ATS sources every 15 minutes",
    },
    "company-reinvestigation-periodic": {
        "task": "agents.company_investigator",
        "schedule_seconds": 21600,
        "queue": "company-research",
        "description": "Refresh company verification and hiring signals every 6 hours",
    },
}
