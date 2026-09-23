from types import SimpleNamespace

import httpx
from backend.ai import AISummary
from fastapi.testclient import TestClient

from backend import api

client = TestClient(api.app)


def test_ai_key_failure_and_grounded_summary(monkeypatch):
    gid = int(api.roles.loc[api.roles.is_seed, "gid"].iloc[0])
    monkeypatch.setattr(api, "AISettings", lambda: SimpleNamespace(openai_key=""))
    assert client.get("/api/ai/status").json()["available"] is False
    assert client.post("/api/ai/ask", json={"gid": gid, "question": "Кратко опиши узел"}).status_code == 503

    monkeypatch.setattr(api, "AISettings", lambda: SimpleNamespace(openai_key="test-key"))
    captured = {}

    def fake_provider(key, context, question, history, concise):
        captured.update(key=key, context=context, question=question, history=history, concise=concise)
        return AISummary(
            summary=f"GID {gid}: наблюдаемые переводы требуют проверки, вывод ограничен выгрузкой." * 5,
            observations=["Есть наблюдаемые переводы."],
            limitations=["Входящие seed неполны."],
            recommended_checks=["Проверить контрагентов."],
            cited_gids=[str(gid)],
        )

    monkeypatch.setattr(api, "call_openai", fake_provider)
    result = client.post("/api/ai/ask", json={"gid": gid, "question": "Кратко опиши узел", "concise": True})
    assert result.status_code == 200
    assert len(result.json()["answer"]) <= 200
    assert str(gid) in result.json()["source_gids"]
    assert captured["context"]["nodes"] and captured["context"]["flows"]
    assert captured["concise"] is True
    assert result.json()["limitations"]
    assert result.json()["observations"]
    assert client.post("/api/ai/ask", json={"gid": -1, "question": "Кто это?"}).status_code == 404


def test_ai_rejects_invented_gid_and_provider_failure(monkeypatch):
    monkeypatch.setattr(api, "AISettings", lambda: SimpleNamespace(openai_key="test-key"))
    monkeypatch.setattr(api, "call_openai", lambda *args: AISummary(
        summary="Проверьте GID 99999999999999999999", observations=[], limitations=["Данные неполны."],
        recommended_checks=[], cited_gids=["99999999999999999999"],
    ))
    assert client.post("/api/ai/ask", json={"question": "Что видно?"}).status_code == 502

    def failed_provider(*args):
        raise httpx.ConnectError("temporary network failure")

    monkeypatch.setattr(api, "call_openai", failed_provider)
    response = client.post("/api/ai/ask", json={"question": "Что видно?"})
    assert response.status_code == 502
    assert "temporary network failure" not in response.text


def test_depth_boundary_answer_is_deterministic(monkeypatch):
    gid = int(api.roles.loc[api.roles.truncated_by_depth, "gid"].iloc[0])
    monkeypatch.setattr(api, "AISettings", lambda: SimpleNamespace(openai_key="test-key"))

    def must_not_call(*args):
        raise AssertionError("terminal boundary is a deterministic fact")

    monkeypatch.setattr(api, "call_openai", must_not_call)
    response = client.post("/api/ai/ask", json={"gid": gid, "question": "Это конечный получатель?"})
    assert response.status_code == 200
    assert "считать его конечным получателем нельзя" in response.json()["answer"]
    monkeypatch.setattr(api, "call_openai", lambda *args: AISummary(
        summary=f"GID {gid} — конечный получатель", observations=[], limitations=["Данные неполны."],
        recommended_checks=[], cited_gids=[str(gid)],
    ))
    summary = client.post("/api/ai/ask", json={"gid": gid, "question": "Кратко опиши узел", "concise": True})
    assert summary.status_code == 200
    assert "считать его конечным получателем нельзя" in summary.json()["answer"]


def test_seed_ai_context_never_balances_incomplete_incoming(monkeypatch):
    gid = int(api.roles.loc[api.roles.is_seed & (api.roles.out_deg > 0), "gid"].iloc[0])
    context, _ = api.ai_context(gid, "Что показывает узел?")
    selected = next(item for item in context["nodes"] if item["gid"] == str(gid))
    assert "in_kzt" not in selected and "in_deg" not in selected
    monkeypatch.setattr(api, "AISettings", lambda: SimpleNamespace(openai_key="test-key"))
    monkeypatch.setattr(api, "call_openai", lambda *args: AISummary(
        summary=f"GID {gid}: вход меньше выхода, значит баланс отрицательный.",
        observations=["Вход меньше выхода."], limitations=["Данные неполны."],
        recommended_checks=["Проверить потоки."], cited_gids=[str(gid)],
    ))
    response = client.post("/api/ai/ask", json={"gid": gid, "question": "Что показывает узел?"})
    assert response.status_code == 200
    assert response.json()["model"] == "детерминированная коррекция"
    assert "вход меньше выхода" not in response.json()["answer"].lower()


def test_common_recipients_use_question_gids_not_unrelated_selection():
    target = api.edges.groupby("dst").src.nunique().loc[lambda counts: counts >= 2].index[0]
    sources = api.edges.loc[api.edges.dst == target, "src"].head(2).tolist()
    selected = int(api.roles.loc[~api.roles.gid.isin(sources), "gid"].iloc[0])
    expected = set(api.edges.loc[api.edges.src == sources[0], "dst"])
    expected &= set(api.edges.loc[api.edges.src == sources[1], "dst"])

    context, source_gids = api.ai_context(selected, f"Кто получает от GID {sources[0]} и GID {sources[1]}?")

    assert set(context["common_direct_recipients"]) == {str(item) for item in expected}
    assert str(target) in source_gids
    assert str(target) in {node["gid"] for node in context["nodes"]}
    assert any(flow["dst"] in context["common_direct_recipients"] for flow in context["flows"])
