#!/usr/bin/env python3
"""
Unit & Contract Tests for JobHunt OS Python Agent Workers (Phases 2 to 10)
"""

import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src', 'agents')))

from pipeline_workers import (
    normalize_domain,
    normalize_funding_stage,
    compute_company_priority,
    is_safe_external_url,
    evaluate_job_contract,
)


class TestAgentsPipeline(unittest.TestCase):

    def test_domain_normalization(self):
        self.assertEqual(normalize_domain("https://www.Example.com/careers"), "example.com")
        self.assertEqual(normalize_domain("krutrimcloud.example.com"), "krutrimcloud.example.com")
        self.assertIsNone(normalize_domain(None))

    def test_funding_stage_normalization(self):
        self.assertEqual(normalize_funding_stage("Series A"), "SERIES_A")
        self.assertEqual(normalize_funding_stage("pre-seed"), "PRE_SEED")
        self.assertEqual(normalize_funding_stage("Series E"), "SERIES_D_PLUS")
        self.assertEqual(normalize_funding_stage("unverified_rumor"), "UNKNOWN")

    def test_company_priority_formula_deterministic(self):
        # 0.35 * 100 + 0.40 * 80 + 0.15 * 90 + 0.10 * 80 = 35 + 32 + 13.5 + 8 = 88.5
        score = compute_company_priority(100, 80, 90, 80)
        self.assertEqual(score, 88.5)

    def test_ssrf_url_protection(self):
        self.assertTrue(is_safe_external_url("https://boards.greenhouse.io/company"))
        self.assertFalse(is_safe_external_url("http://127.0.0.1:8080/admin"))
        self.assertFalse(is_safe_external_url("http://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_external_url("http://192.168.1.10/config"))
        self.assertFalse(is_safe_external_url("file:///etc/passwd"))

    def test_job_evaluator_hard_filters_and_null_salary(self):
        job_qualified = {
            "id": "job-1",
            "title": "Backend Software Engineer",
            "description": "Build APIs with Node.js, TypeScript, PostgreSQL, and FastAPI.",
            "work_mode": "REMOTE",
            "experience_min": 1.0,
            "salary_max": None,  # Unknown salary must NOT be treated as 0!
        }
        prefs = {
            "remote_only": True,
            "maximum_experience": 2.0,
            "minimum_salary": 700000,
        }
        skills = ["Node.js", "TypeScript", "PostgreSQL", "FastAPI"]
        res = evaluate_job_contract(job_qualified, skills, prefs)
        self.assertEqual(res["decision"], "QUALIFIED")
        self.assertGreaterEqual(res["score"], 80)
        self.assertTrue(res["hard_filters"]["salary_eligible"])

    def test_unknown_work_mode_not_treated_as_remote(self):
        job_unknown_mode = {
            "id": "job-2",
            "title": "Backend Software Engineer",
            "description": "Node.js, TypeScript, PostgreSQL, FastAPI",
            "work_mode": "UNKNOWN",
            "experience_min": 1.0,
            "salary_max": 1500000,
            "salary_currency": "INR",
        }
        prefs = {"remote_only": True, "maximum_experience": 2.0, "minimum_salary": 700000}
        res = evaluate_job_contract(job_unknown_mode, ["Node.js", "TypeScript", "PostgreSQL", "FastAPI"], prefs)
        self.assertFalse(res["hard_filters"]["work_mode_eligible"])
        self.assertEqual(res["decision"], "REJECTED")


if __name__ == "__main__":
    unittest.main()
