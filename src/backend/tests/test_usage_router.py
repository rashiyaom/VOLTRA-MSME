import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
import httpx
from fastapi import FastAPI
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import usage_router

class UsageAssistantTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app = FastAPI()
        app.include_router(usage_router.router)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        usage_router._requests.clear()
        usage_router._global_requests.clear()
        self.payload = {"question": "What do we know?", "context": {"source": "hardware", "recentDays": []}}

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_missing_key_is_explicit_and_not_a_fake_answer(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            response = await self.client.post("/api/usage/chat", json=self.payload)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("answer", response.json())
            status = await self.client.get("/api/usage/status")
            self.assertFalse(status.json()["configured"])

    async def test_rejects_unbounded_and_unlabeled_context(self):
        for payload in [{**self.payload, "question": " "}, {**self.payload, "context": {"source": "unknown"}}, {**self.payload, "context": {"source": "demo", "huge": "x" * 25000}}]:
            response = await self.client.post("/api/usage/chat", json=payload)
            self.assertEqual(response.status_code, 422)

    async def test_success_grounds_prompt_and_keeps_key_server_side(self):
        provider_response = httpx.Response(200, json={"choices": [{"message": {"content": "No measured history is available yet."}}]})
        mock_provider = AsyncMock()
        mock_provider.__aenter__.return_value = mock_provider
        mock_provider.post.return_value = provider_response
        with patch.dict(os.environ, {"GROQ_API_KEY": "secret-test-key"}), patch.object(usage_router.httpx, "AsyncClient", return_value=mock_provider):
            response = await self.client.post("/api/usage/chat", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("secret-test-key", response.text)
        sent = mock_provider.post.call_args.kwargs["json"]
        self.assertIn("Missing intervals are unknown", sent["messages"][0]["content"])
        self.assertIn('"recentDays": []', sent["messages"][-1]["content"])
        self.assertEqual(sent["tools"], [{"type": "browser_search"}])
        self.assertEqual(sent["tool_choice"], "auto")

    async def test_external_questions_are_allowed_and_web_search_is_available(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200,
            json={"choices": [{"message": {"content": "## Current answer\n\nSource-backed."}}]},
        )
        payload = {**self.payload, "question": "What changed in India's energy policy this week?"}
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/chat", json=payload)
            status = await self.client.get("/api/usage/status")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(status.json()["webSearchAvailable"])
        sent = provider.post.call_args.kwargs["json"]
        self.assertIn("general external topics", sent["messages"][0]["content"])
        self.assertEqual(sent["tools"], [{"type": "browser_search"}])

    async def test_chat_retries_without_browser_tool_when_provider_rejects_it(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.side_effect = [
            httpx.Response(400, json={"error": {"message": "tools unavailable"}}),
            httpx.Response(200, json={"choices": [{"message": {"content": "Fallback answer"}}]}),
        ]
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/chat", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], "Fallback answer")
        self.assertEqual(provider.post.await_count, 2)
        fallback = provider.post.await_args_list[1].kwargs["json"]
        self.assertNotIn("tools", fallback)
        self.assertNotIn("tool_choice", fallback)

    async def test_authenticated_database_profile_is_added_server_side(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Your saved zone is Pune Home."}}]},
        )
        database_profile = {
            "id": "user-1",
            "name": "Test User",
            "email": "test@example.com",
            "role": "Homeowner",
            "zone": "Pune Home",
            "designation": "",
            "provider": "credentials",
        }
        payload = {
            **self.payload,
            "context": {
                **self.payload["context"],
                "authenticatedAccount": {"email": "attacker@example.com"},
            },
        }
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ), patch.object(usage_router, "load_database_profile", return_value=database_profile):
            response = await self.client.post(
                "/api/usage/chat",
                json=payload,
                headers={"Authorization": "Bearer valid-test-token"},
            )
        self.assertEqual(response.status_code, 200)
        prompt = provider.post.call_args.kwargs["json"]["messages"][-1]["content"]
        self.assertIn('"email": "test@example.com"', prompt)
        self.assertIn('"zone": "Pune Home"', prompt)
        self.assertNotIn("attacker@example.com", prompt)

    async def test_browser_key_overrides_server_key_without_echoing_it(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Grounded answer"}}]},
        )
        headers = {"X-Voltra-Groq-Key": "gsk_browser-secret"}
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/chat", json=self.payload, headers=headers)
            status = await self.client.get("/api/usage/status", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(status.json()["keySource"], "browser")
        self.assertEqual(
            provider.post.call_args.kwargs["headers"]["Authorization"],
            "Bearer gsk_browser-secret",
        )
        self.assertNotIn("gsk_browser-secret", response.text)

    async def test_verify_checks_key_and_reports_model_availability(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.get.return_value = httpx.Response(
            200,
            json={"data": [{"id": "openai/gpt-oss-120b"}]},
        )
        with patch.object(usage_router.httpx, "AsyncClient", return_value=provider):
            response = await self.client.post(
                "/api/usage/verify",
                headers={"X-Voltra-Groq-Key": "gsk_browser-secret"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["modelAvailable"])
        self.assertEqual(response.json()["keySource"], "browser")
        self.assertNotIn("gsk_browser-secret", response.text)

    async def test_panel_help_uses_grounded_product_prompt(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Open Settings."}}]},
        )
        payload = {
            "question": "Where do I connect Groq?",
            "context": {"page": "/dashboard", "source": "demo"},
        }
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/help", json=payload)
        self.assertEqual(response.status_code, 200)
        sent = provider.post.call_args.kwargs["json"]
        self.assertIn("general, product, and household assistant", sent["messages"][0]["content"])
        self.assertIn('"page": "/dashboard"', sent["messages"][-1]["content"])

    async def test_bill_plan_returns_validated_dated_schedule(self):
        generated = {
            "headline": "A measured three-day plan",
            "summary": "Keep the refrigerator protected and place flexible cooling inside its daily limit.",
            "priorities": ["Protect refrigeration", "Cap cooling", "Check the daily envelope"],
            "days": [
                {
                    "date": f"2026-10-{day}",
                    "focus": f"Day {day} cooling window",
                    "budgetWeight": weight,
                    "actions": ["Keep total use inside the shown kWh envelope.", "Run the AC for no more than 4 hours."],
                    "loadTargets": [
                        {"loadId": "ac", "hours": 8, "timeWindow": "20:00-00:00", "note": "Use 24°C and stop after four hours."}
                    ],
                }
                for day, weight in (("22", 0.9), ("23", 1.0), ("24", 1.1))
            ],
        }
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200, json={"choices": [{"message": {"content": usage_router.json.dumps(generated)}}]}
        )
        payload = {
            "source": "hardware",
            "settings": {"target": 900, "cycleStart": "2026-10-22", "cycleEnd": "2026-10-24", "tariffRate": 8, "fixedCharges": 100, "taxPercent": 5},
            "forecast": {"billingDays": 3, "dailyEnergyAllowance": 34.5, "projectedKwh": 24, "projectedBill": 306.6, "plannedKwh": 21, "plannedBill": 281.4, "achievable": True},
            "loads": [{"id": "ac", "name": "Bedroom AC", "category": "air_conditioner", "dailyKwh": 5, "hoursPerDay": 5, "recommendedDailyKwh": 4, "recommendedHoursPerDay": 4, "essential": False, "confidence": "measured"}],
        }
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/bill-plan", json=payload)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual([day["date"] for day in result["days"]], ["2026-10-22", "2026-10-23", "2026-10-24"])
        self.assertEqual(result["days"][0]["loadTargets"][0]["hours"], 4)
        self.assertAlmostEqual(sum(day["budgetKwh"] for day in result["days"]), 21, places=2)
        self.assertEqual(result["expectedBillInr"], 281.4)
        sent = provider.post.call_args.kwargs["json"]
        self.assertEqual(sent["response_format"], {"type": "json_object"})
        self.assertNotIn("server-secret", response.text)

    async def test_bill_plan_rejects_missing_calendar_dates(self):
        generated = {
            "headline": "Incomplete plan",
            "summary": "This deliberately incomplete plan must never reach the user interface.",
            "priorities": ["One", "Two", "Three"],
            "days": [{"date": "2026-10-22", "focus": "Only one date", "budgetWeight": 1, "actions": ["Stay inside the daily energy allowance.", "Limit flexible appliance runtime today."], "loadTargets": []}],
        }
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(
            200, json={"choices": [{"message": {"content": usage_router.json.dumps(generated)}}]}
        )
        payload = {
            "source": "demo",
            "settings": {"target": 900, "cycleStart": "2026-10-22", "cycleEnd": "2026-10-23", "tariffRate": 8, "fixedCharges": 100, "taxPercent": 5},
            "forecast": {"billingDays": 2, "dailyEnergyAllowance": 34.5, "projectedKwh": 14, "projectedBill": 220, "plannedKwh": 12, "plannedBill": 205, "achievable": True},
            "loads": [{"id": "ac", "name": "Bedroom AC", "category": "air_conditioner", "dailyKwh": 5, "hoursPerDay": 5, "recommendedDailyKwh": 4, "recommendedHoursPerDay": 4, "essential": False, "confidence": "estimated"}],
        }
        with patch.dict(os.environ, {"GROQ_API_KEY": "server-secret"}), patch.object(
            usage_router.httpx, "AsyncClient", return_value=provider
        ):
            response = await self.client.post("/api/usage/bill-plan", json=payload)
        self.assertEqual(response.status_code, 502)
        self.assertIn("incomplete calendar plan", response.json()["detail"])

    async def test_upstream_errors_never_expose_provider_response(self):
        provider = AsyncMock()
        provider.__aenter__.return_value = provider
        provider.post.return_value = httpx.Response(401, json={"secret": "do-not-expose"})
        with patch.dict(os.environ, {"GROQ_API_KEY": "test"}), patch.object(usage_router.httpx, "AsyncClient", return_value=provider):
            response = await self.client.post("/api/usage/chat", json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("do-not-expose", response.text)

    async def test_rate_limit(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test"}):
            usage_router._global_requests.extend([usage_router.time.monotonic()] * 20)
            response = await self.client.post("/api/usage/chat", json=self.payload)
            self.assertEqual(response.status_code, 429)

if __name__ == "__main__":
    unittest.main()
