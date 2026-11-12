#!/usr/bin/env python3
"""
Unit tests for Python worker health check and environment parsing.
Uses Python's standard library unittest so it runs reliably in all environments.
"""

import unittest
import os
import sys

# Add src to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from health_check import check_runtime, parse_network_target, run_health_check


class TestWorkerHealth(unittest.TestCase):

    def test_runtime_version_is_valid(self):
        info = check_runtime()
        self.assertIn(info["status"], ["healthy", "unhealthy"])
        self.assertTrue(len(info["python_version"]) > 0)
        self.assertEqual(info["platform"], sys.platform)

    def test_parse_network_target_standard_urls(self):
        host, port = parse_network_target("postgresql://user:pass@db.example.com:5433/mydb", 5432)
        self.assertEqual(host, "db.example.com")
        self.assertEqual(port, 5433)

        host_redis, port_redis = parse_network_target("redis://redis-cluster:6380/0", 6379)
        self.assertEqual(host_redis, "redis-cluster")
        self.assertEqual(port_redis, 6380)

    def test_parse_network_target_defaults(self):
        host, port = parse_network_target("invalid-uri", 5432)
        self.assertEqual(port, 5432)

    def test_run_health_check_structure(self):
        report = run_health_check()
        self.assertEqual(report["service"], "jobhunt-agent-worker")
        self.assertIn("status", report)
        self.assertIn("timestamp", report)
        self.assertIn("runtime", report)
        self.assertIn("configuration", report)
        self.assertEqual(report["phase"], "Phase 0 — Foundation")


if __name__ == "__main__":
    unittest.main()
