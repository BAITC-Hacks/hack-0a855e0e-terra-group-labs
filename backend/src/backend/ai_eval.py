from __future__ import annotations

import re
import sys
from time import perf_counter

from .ai import AISummary, extract_gids
from .api import AIRequest, AISettings, ai_context, ask_ai, roles


def main() -> None:
    if not AISettings().openai_key:
        print("AI EVAL SKIPPED: add OpenAIKEY to the root .env for live evaluation")
        return

    def candidate(role: str) -> int:
        return int(roles.loc[roles.role == role].nlargest(1, "priority_score").iloc[0].gid)

    seed = int(roles.loc[roles.is_seed & (roles.out_deg > 0), "gid"].iloc[0])
    boundary = int(roles.loc[roles.truncated_by_depth & (roles.in_deg > 0), "gid"].iloc[0])
    cases = [
        ("distributor", candidate("distributor"), "Объясни роль и назови точное число исходящих получателей.", "распредел"),
        ("consolidator", candidate("consolidator"), "Объясни роль и ключевой наблюдаемый входящий поток.", "консолид"),
        ("coordinator", candidate("coordinator"), "Объясни роль и структурную связность без предположений о личности.", "координ"),
        ("transit", candidate("transit"), "Объясни роль и сравни наблюдаемые вход и выход.", "транзит"),
        ("terminal", candidate("terminal"), "Объясни, почему это только кандидат в наблюдаемый сток.", "конечн|сток"),
        ("peripheral", candidate("peripheral"), "Объясни роль и почему специализированный сигнал слаб.", "перифер"),
        ("seed", seed, "Объясни роль и почему входящий баланс seed неполон.", None),
        ("depth boundary", boundary, "Можно ли назвать этот узел конечным получателем?", None),
    ]
    if len(sys.argv) > 1:
        cases = [case for case in cases if case[0] == sys.argv[1]]
        if not cases:
            raise SystemExit("Unknown eval case")
    corrections = 0
    for label, gid, question, role_pattern in cases:
        request = AIRequest(gid=gid, question=question, concise=True)
        started = perf_counter()
        result = ask_ai(request)
        answer = AISummary.model_validate({
            "summary": result["summary"], "observations": result["observations"],
            "limitations": result["limitations"], "recommended_checks": result["recommended_checks"],
            "cited_gids": result["cited_gids"],
        })
        context, allowed = ai_context(gid, question)
        assert context["nodes"] and answer.summary and len(answer.summary) <= 200
        assert answer.limitations and answer.recommended_checks
        assert set(answer.cited_gids) <= allowed
        combined = " ".join([answer.summary, *answer.observations, *answer.limitations, *answer.recommended_checks])
        assert extract_gids(combined) <= allowed
        assert not re.search(r"\b(виновен|осуждён|наркоторговец|конспирация)\b", combined.lower())
        assert not re.search(r"\b(ежемесячно|постоянно)\b", combined.lower())
        assert not re.search(r"\b(возраст|ФИО|ИИН)\s*[:=]?\s*\d", combined, re.IGNORECASE)
        assert any(word in " ".join(answer.limitations).lower() for word in ("непол", "не полн", "огранич", "выгруз", "наблюд", "границ", "неизвест", "нет ", "отсутств", "только"))
        if label == "depth boundary":
            assert "считать его конечным получателем нельзя" in answer.summary.lower()
        elif label == "seed":
            assert "входящ" in " ".join(answer.limitations).lower()
        else:
            assert re.search(role_pattern, answer.summary.lower()), (label, answer.model_dump())
        if label == "distributor":
            expected = int(roles.loc[roles.gid == gid, "out_deg"].iloc[0])
            assert re.search(rf"(?<!\d){expected}(?!\d)", combined.replace(str(gid), ""))
        corrections += result["model"] == "детерминированная коррекция"
        print(f"{label}: {perf_counter() - started:.2f}s · {len(answer.summary)} chars · {result['model']} · {answer.summary}")
    print(f"AI EVAL PASSED: {len(cases)} role/coverage cases, {corrections} role corrections, schema, GIDs, limits, caution")


if __name__ == "__main__":
    main()
