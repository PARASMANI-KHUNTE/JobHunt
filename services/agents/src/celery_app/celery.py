import os
from celery import Celery


def _redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")


def get_celery_app() -> Celery:
    broker = os.environ.get("CELERY_BROKER_URL", _redis_url())
    backend = os.environ.get("CELERY_RESULT_BACKEND", _redis_url())
    app = Celery(
        "jobhunt_agents",
        broker=broker,
        backend=backend,
        include=["src.celery_app.tasks"],
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Asia/Kolkata",
        enable_utc=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        task_default_queue="agent-orchestration",
        task_routes={
            "agents.funding_scout": {"queue": "funding-discovery"},
            "agents.company_investigator": {"queue": "company-research"},
            "agents.job_hunter": {"queue": "job-discovery"},
            "agents.job_evaluator": {"queue": "job-evaluation"},
            "agents.contact_finder": {"queue": "contact-research"},
            "agents.outreach_assistant": {"queue": "outreach-generation"},
            "agents.full_pipeline": {"queue": "agent-orchestration"},
        },
        beat_schedule={
            "funding-scout-daily": {
                "task": "agents.funding_scout",
                "schedule": 60 * 60 * 24,
                "kwargs": {"payload": {"trigger": "beat", "cadence": "daily"}},
            },
            "job-hunter-frequent": {
                "task": "agents.job_hunter",
                "schedule": 60 * 15,
                "kwargs": {"payload": {"trigger": "beat", "cadence": "15m"}},
            },
            "company-reinvestigation-periodic": {
                "task": "agents.company_investigator",
                "schedule": 60 * 60 * 6,
                "kwargs": {"payload": {"trigger": "beat", "cadence": "6h"}},
            },
        },
    )
    return app


celery_app = get_celery_app()
