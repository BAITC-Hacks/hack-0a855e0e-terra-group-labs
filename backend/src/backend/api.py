from __future__ import annotations

import re
from typing import Any, Literal

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .ai import MODEL, AISummary, call_openai, extract_gids
from .pipeline import DEFAULT_DATA, DEFAULT_OUT, ROLES


def records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            key: None
            if pd.isna(value)
            else str(int(value))
            if key in {"gid", "src", "dst"}
            else value.item()
            if hasattr(value, "item")
            else value
            for key, value in row.items()
        }
        for row in frame.to_dict("records")
    ]


nodes = pd.read_parquet(DEFAULT_DATA / "nodes.parquet")
edges = pd.read_parquet(DEFAULT_DATA / "edges.parquet")
transactions = pd.read_parquet(DEFAULT_DATA / "transactions.parquet")
transactions["date"] = pd.to_datetime(transactions.date).dt.strftime("%Y-%m-%d")
roles = pd.read_csv(DEFAULT_OUT / "nodes_roles.csv")
clusters = pd.read_csv(DEFAULT_OUT / "clusters.csv")
top_nodes = pd.read_csv(DEFAULT_OUT / "top_nodes.csv")
role_by_gid = roles.set_index("gid")
cluster_by_gid = roles.set_index("gid").cluster_id
seed_gids = set(nodes.loc[nodes.is_seed, "gid"])
role_labels = {
    "consolidator": "консолидатор", "distributor": "распределитель", "transit": "транзитный узел",
    "terminal": "кандидат в конечный узел", "coordinator": "координирующий узел", "peripheral": "периферийный узел",
}
role_markers = {
    "consolidator": ("консолид",), "distributor": ("распредел",), "transit": ("транзит",),
    "terminal": ("конечн", "сток"), "coordinator": ("координ",), "peripheral": ("перифер",),
}
edge_clusters = edges.assign(src_cluster=edges.src.map(cluster_by_gid), dst_cluster=edges.dst.map(cluster_by_gid))
edge_clusters["seed_tx"] = edge_clusters.n_tx.where(edge_clusters.src.isin(seed_gids), 0)
cluster_out_tx = edge_clusters.groupby("src_cluster").n_tx.sum()
cluster_seed_tx = edge_clusters.groupby("src_cluster").seed_tx.sum()
clusters["seed_out_tx"] = clusters.cluster_id.map(cluster_seed_tx).fillna(0).astype(int)
clusters["seed_tx_share"] = (
    clusters.seed_out_tx / clusters.cluster_id.map(cluster_out_tx).replace(0, float("nan"))
).fillna(0)


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=DEFAULT_OUT.parent / ".env", extra="ignore")
    openai_key: str = Field(default="", validation_alias="OpenAIKEY")


class AIRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    gid: int | None = None
    concise: bool = False
    history: list[dict[Literal["role", "content"], str]] = Field(default_factory=list, max_length=6)


def ai_context(gid: int | None, question: str) -> tuple[dict[str, Any], set[str]]:
    explicit = [int(value) for value in sorted(extract_gids(question))]
    requested = list(dict.fromkeys(([gid] if gid is not None else []) + explicit))
    if len(explicit) > 6:
        raise HTTPException(status_code=422, detail="Укажите не более 6 GID за один вопрос")
    for item in requested:
        require_gid(item)
    source_ids = set(requested)
    context: dict[str, Any] = {
        "network": {"nodes": len(roles), "edges": len(edges), "transactions": len(transactions), "seed": len(seed_gids)},
        "nodes": [], "flows": [],
    }
    if requested:
        common_sources = explicit if len(explicit) > 1 else requested
        common: set[int] = set()
        if len(common_sources) > 1:
            common = set(edges.loc[edges.src == common_sources[0], "dst"])
            for item in common_sources[1:]:
                common &= set(edges.loc[edges.src == item, "dst"])
            context["common_direct_recipients"] = [str(item) for item in sorted(common)]
            source_ids.update(common)
        incident = edges[edges.src.isin(requested) | edges.dst.isin(requested)]
        shared_flows = incident[incident.src.isin(common_sources) & incident.dst.isin(common)]
        incident = pd.concat([
            shared_flows.sort_values("sum_kzt", ascending=False),
            incident.drop(shared_flows.index).sort_values("sum_kzt", ascending=False),
        ]).head(16)
        incident = incident.sort_values("sum_kzt", ascending=False)
        source_ids.update(incident.src)
        source_ids.update(incident.dst)
        columns = ["gid", "role", "role_score", "priority_score", "cluster_id", "depth", "is_seed",
                   "truncated_by_depth", "in_deg", "out_deg", "in_kzt", "out_kzt", "seed_reach_count", "evidence"]
        context["nodes"] = records(roles[roles.gid.isin(source_ids)][columns])
        for node in context["nodes"]:
            if node["is_seed"]:
                node.pop("in_deg")
                node.pop("in_kzt")
                node["incoming_coverage"] = "неполно: входящие агрегаты не сравнивать с исходящими"
        context["flows"] = records(incident[["src", "dst", "sum_kzt", "n_tx"]])
        if gid is not None:
            context["selected_role"] = role_labels[require_gid(gid).role]
    return context, {str(item) for item in source_ids}

app = FastAPI(title="Money Graph AML API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ai/status")
def ai_status() -> dict[str, Any]:
    return {"available": bool(AISettings().openai_key), "model": MODEL}


@app.post("/api/ai/ask")
def ask_ai(request: AIRequest) -> dict[str, Any]:
    key = AISettings().openai_key
    if not key:
        raise HTTPException(status_code=503, detail="OpenAIKEY не задан. Добавьте его в корневой .env и перезапустите backend.")
    history = request.history
    if any(item.get("role") not in {"user", "assistant"} or len(item.get("content", "")) > 500 for item in history):
        raise HTTPException(status_code=422, detail="Некорректная история чата")
    context, source_gids = ai_context(request.gid, request.question)
    boundary = request.gid is not None and bool(require_gid(request.gid).truncated_by_depth)
    only_selected = not (extract_gids(request.question) - {str(request.gid)})
    boundary_answer = AISummary(
        summary=f"GID {request.gid} находится на 4-м колене — границе наблюдения. "
                "Исходящие за пределами выгрузки не видны; считать его конечным получателем нельзя.",
        observations=["Нет наблюдаемых исходящих переводов у узла 4-го колена."],
        limitations=["Обход обрывается на 4-м колене; дальнейшие переводы неизвестны."],
        recommended_checks=["Запросить исходящие переводы за пределами выгрузки."],
        cited_gids=[str(request.gid)],
    )
    model = MODEL
    if boundary and only_selected and re.search(r"конечн|сток|осел", request.question.lower()):
        result = boundary_answer
        model = "детерминированное правило"
    else:
        try:
            result = call_openai(key, context, request.question, history, request.concise)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail=f"OpenAI API вернул HTTP {exc.response.status_code}. Проверьте ключ и доступ к модели.") from exc
        except (httpx.RequestError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Не удалось получить ответ OpenAI. Повторите запрос позже.") from exc
    if not result.limitations:
        raise HTTPException(status_code=502, detail="AI не указал ограничения данных. Повторите запрос.")
    all_text = " ".join([result.summary, *result.observations, *result.limitations, *result.recommended_checks, *result.cited_gids])
    if not extract_gids(all_text) <= source_gids or not set(result.cited_gids) <= source_gids:
        raise HTTPException(status_code=502, detail="AI ответил с GID, которого нет в переданных фактах. Повторите запрос.")
    if boundary and only_selected and re.search(r"конечн|сток|осел", result.summary.lower()):
        result = boundary_answer
        model = "детерминированное правило"
    if request.gid is not None and bool(require_gid(request.gid).is_seed) and re.search(
        r"меньше|больше|превыш|соотношен|баланс", " ".join([result.summary, *result.observations]).lower()
    ):
        row = require_gid(request.gid)
        result = AISummary(
            summary=f"GID {request.gid}: роль по правилам — {role_labels[row.role]}. "
                    f"Исходящие связи: {row.out_deg}; переводы: {row.out_tx}.",
            observations=[f"Наблюдаемый исходящий объём: {row.out_kzt:,.2f} KZT.".replace(",", " ")],
            limitations=["Входящие seed-клиента неполны; сравнивать их с исходящими нельзя."],
            recommended_checks=["Проверить исходящие потоки и их получателей."],
            cited_gids=[str(request.gid)],
        )
        model = "детерминированная коррекция"
    if request.concise and request.gid is not None and model != "детерминированное правило" and not any(
        marker in result.summary.lower() for marker in role_markers[require_gid(request.gid).role]
    ):
        row = require_gid(request.gid)
        result = AISummary(
            summary=f"Роль по правилам — {role_labels[row.role]}. {row.evidence}",
            observations=[f"Наблюдаемых связей: входящих {row.in_deg}, исходящих {row.out_deg}."],
            limitations=[
                "Входящие seed-клиента неполны в исходящей выгрузке."
                if row.is_seed else
                "4-е колено — граница наблюдения; дальнейшие исходящие переводы неизвестны."
                if row.truncated_by_depth else
                "Роль описывает только внутрибанковскую выгрузку за июль 2026; это гипотеза для проверки."
            ],
            recommended_checks=["Проверить связанные потоки и контрагентов."],
            cited_gids=[str(request.gid)],
        )
        model = "детерминированная коррекция"
    if request.concise and len(result.summary) > 200:
        end = max(result.summary.rfind(".", 0, 200), result.summary.rfind("!", 0, 200), result.summary.rfind("?", 0, 200))
        result.summary = result.summary[:end + 1] if end >= 80 else result.summary[:197].rsplit(" ", 1)[0] + "…"
    cited = set(result.cited_gids)
    if request.gid is not None:
        cited.add(str(request.gid))
    return {"answer": result.summary, **result.model_dump(), "source_gids": sorted(cited), "model": model}


@app.get("/api/summary")
def summary() -> dict[str, Any]:
    return {
        "nodes": len(nodes),
        "edges": len(edges),
        "transactions": len(transactions),
        "observed_turnover_kzt": float(edges.sum_kzt.sum()),
        "clusters": len(clusters),
        "role_counts": {role: int((roles.role == role).sum()) for role in sorted(ROLES)},
        "period": {"from": transactions.date.min(), "to": transactions.date.max()},
    }


@app.get("/api/top-nodes")
def get_top_nodes(limit: int = Query(50, ge=20, le=100)) -> list[dict[str, Any]]:
    selected = top_nodes.head(limit).copy()
    selected["is_seed"] = selected.gid.isin(seed_gids)
    return records(selected)


@app.get("/api/nodes")
def find_nodes(
    role: str | None = None,
    cluster_id: int | None = None,
    depth: int | None = Query(None, ge=0, le=4),
    min_priority: float = Query(0, ge=0, le=1),
    min_turnover: float | None = Query(None, ge=0),
    max_turnover: float | None = Query(None, ge=0),
    min_in_deg: int = Query(0, ge=0),
    min_out_deg: int = Query(0, ge=0),
    min_seed_reach: int = Query(0, ge=0),
    is_seed: bool | None = None,
    truncated_by_depth: bool | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, Any]]:
    if role is not None and role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role: {role}")
    selected = roles.assign(turnover=roles.in_kzt + roles.out_kzt)
    filters = [
        selected.priority_score >= min_priority,
        selected.in_deg >= min_in_deg,
        selected.out_deg >= min_out_deg,
        selected.seed_reach_count >= min_seed_reach,
    ]
    if role is not None:
        filters.append(selected.role == role)
    if cluster_id is not None:
        filters.append(selected.cluster_id == cluster_id)
    if depth is not None:
        filters.append(selected.depth == depth)
    if min_turnover is not None:
        filters.append(selected.turnover >= min_turnover)
    if max_turnover is not None:
        filters.append(selected.turnover <= max_turnover)
    if is_seed is not None:
        filters.append(selected.is_seed.astype(bool) == is_seed)
    if truncated_by_depth is not None:
        filters.append(selected.truncated_by_depth.astype(bool) == truncated_by_depth)
    mask = pd.Series(True, index=selected.index)
    for condition in filters:
        mask &= condition
    selected = selected[mask]
    columns = [
        "gid", "role", "role_score", "priority_score", "cluster_id", "depth", "is_seed",
        "truncated_by_depth", "in_deg", "out_deg", "seed_reach_count", "turnover", "evidence",
    ]
    return records(selected.nlargest(limit, "priority_score")[columns])


def require_gid(gid: int) -> pd.Series:
    if gid not in role_by_gid.index:
        raise HTTPException(status_code=404, detail=f"GID {gid} not found")
    return role_by_gid.loc[gid]


@app.get("/api/nodes/{gid}")
def get_node(gid: int) -> dict[str, Any]:
    row = require_gid(gid)
    payload = records(pd.DataFrame([row]))[0]
    payload["gid"] = str(gid)
    payload["coverage_warning"] = (
        "4-е колено — граница наблюдения: последующие исходящие переводы находятся за пределами выгрузки."
        if row.truncated_by_depth
        else "Входящие переводы seed-клиента неполны в исходящей выгрузке."
        if row.is_seed
        else None
    )
    components = {
        "consolidator": [("Плательщики", row.in_deg, row.in_deg_pct), ("Seed-ветви", row.seed_reach_count, row.seed_reach_pct), ("Наблюдаемый вход", row.in_kzt, row.in_kzt_pct), ("PageRank", None, row.pagerank_pct)],
        "distributor": [("Получатели", row.out_deg, row.out_deg_pct), ("Наблюдаемый выход", row.out_kzt, row.out_kzt_pct), ("Исходящие переводы", row.out_tx, row.out_tx_pct), ("Посредничество", None, row.betweenness_pct)],
        "transit": [("Входящие связи", row.in_deg, row.in_deg_pct), ("Исходящие связи", row.out_deg, row.out_deg_pct), ("Соотношение выхода ко входу", row.pass_through, None), ("Посредничество", None, row.betweenness_pct)],
        "terminal": [("Наблюдаемый вход", row.in_kzt, row.in_kzt_pct), ("Плательщики", row.in_deg, row.in_deg_pct), ("Входящие переводы", row.in_tx, row.in_tx_pct), ("Seed-ветви", row.seed_reach_count, row.seed_reach_pct)],
        "coordinator": [("Посредничество", None, row.betweenness_pct), ("PageRank", None, row.pagerank_pct), ("Seed-ветви", row.seed_reach_count, row.seed_reach_pct), ("Все связи", row.in_deg + row.out_deg, row.degree_pct)],
        "peripheral": [("Входящие связи", row.in_deg, row.in_deg_pct), ("Исходящие связи", row.out_deg, row.out_deg_pct), ("Наблюдаемый оборот", row.in_kzt + row.out_kzt, row.turnover_pct)],
    }
    payload["role_components"] = [
        {"label": label, "value": None if pd.isna(value) else float(value), "percentile": None if percentile is None else float(percentile)}
        for label, value, percentile in components[row.role]
    ]
    payload["incoming_relationships"] = int((edges.dst == gid).sum())
    payload["outgoing_relationships"] = int((edges.src == gid).sum())
    return payload


@app.get("/api/nodes/{gid}/neighbors")
def get_neighbors(gid: int) -> dict[str, list[dict[str, Any]]]:
    require_gid(gid)
    incoming = edges[edges.dst == gid].copy()
    outgoing = edges[edges.src == gid].copy()
    incoming["counterparty_role"] = incoming.src.map(role_by_gid.role)
    outgoing["counterparty_role"] = outgoing.dst.map(role_by_gid.role)
    incoming["counterparty_cluster"] = incoming.src.map(cluster_by_gid)
    outgoing["counterparty_cluster"] = outgoing.dst.map(cluster_by_gid)
    incoming["counterparty_is_seed"] = incoming.src.isin(seed_gids)
    outgoing["counterparty_is_seed"] = outgoing.dst.isin(seed_gids)
    return {"incoming": records(incoming), "outgoing": records(outgoing)}


@app.get("/api/edges/{src}/{dst}")
def get_edge(src: int, dst: int) -> dict[str, Any]:
    match = edges[(edges.src == src) & (edges.dst == dst)]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Edge {src}->{dst} not found")
    tx = transactions[(transactions.src == src) & (transactions.dst == dst)].sort_values("date")
    payload = records(match)[0]
    payload.update(
        {
            "first_date": tx.date.min(),
            "last_date": tx.date.max(),
            "transactions": records(tx[["date", "sum_kzt"]]),
        }
    )
    return payload


@app.get("/api/clusters")
def get_clusters() -> list[dict[str, Any]]:
    return records(clusters.sort_values(["n_seed", "n_nodes"], ascending=False))


@app.get("/api/cluster-graph")
def get_cluster_graph() -> dict[str, Any]:
    node_rows = []
    for row in clusters.itertuples(index=False):
        group = roles[roles.cluster_id == row.cluster_id]
        node_rows.append(
            {
                **row._asdict(),
                "id": str(int(row.cluster_id)),
                "role_counts": {role: int((group.role == role).sum()) for role in sorted(ROLES)},
            }
        )
    cross = edge_clusters[edge_clusters.src_cluster != edge_clusters.dst_cluster]
    grouped = (
        cross.groupby(["src_cluster", "dst_cluster"], as_index=False)
        .agg(sum_kzt=("sum_kzt", "sum"), n_tx=("n_tx", "sum"), n_edges=("src", "size"), seed_tx=("seed_tx", "sum"))
        .sort_values("sum_kzt", ascending=False)
    )
    grouped["seed_tx_share"] = grouped.seed_tx / grouped.n_tx
    return {"nodes": node_rows, "edges": records(grouped)}


@app.get("/api/analytics")
def get_analytics() -> dict[str, Any]:
    enriched = roles.assign(turnover=roles.in_kzt + roles.out_kzt, total_tx=roles.in_tx + roles.out_tx)

    def candidates(column: str, label: str) -> dict[str, Any]:
        frame = enriched.nlargest(8, column)[["gid", "role", "priority_score", column]].rename(columns={column: "value"})
        return {"label": label, "nodes": records(frame)}

    return {
        "depth_counts": {str(depth): int((roles.depth == depth).sum()) for depth in range(5)},
        "seed_count": int(roles.is_seed.astype(bool).sum()),
        "boundary_count": int(roles.truncated_by_depth.astype(bool).sum()),
        "signals": [
            candidates("out_deg", "Широкое распределение по получателям"),
            candidates("seed_reach_count", "Схождение нескольких seed-ветвей"),
            candidates("betweenness_pct", "Структурное посредничество"),
            candidates("turnover", "Высокий наблюдаемый оборот"),
        ],
    }


@app.get("/api/clusters/{cluster_id}")
def get_cluster(cluster_id: int) -> dict[str, Any]:
    match = clusters[clusters.cluster_id == cluster_id]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Cluster {cluster_id} not found")
    payload = records(match)[0]
    payload["nodes"] = records(
        roles[roles.cluster_id == cluster_id]
        .nlargest(20, "priority_score")[["gid", "role", "role_score", "priority_score", "evidence"]]
    )
    return payload


@app.get("/api/graph")
def get_graph(cluster_id: int | None = None, gid: int | None = None) -> dict[str, Any]:
    selected = roles
    if cluster_id is not None:
        if cluster_id not in set(clusters.cluster_id):
            raise HTTPException(status_code=404, detail=f"Cluster {cluster_id} not found")
        selected = selected[selected.cluster_id == cluster_id]
    if gid is not None:
        require_gid(gid)
        incident = edges[(edges.src == gid) | (edges.dst == gid)]
        ego_gids = {gid} | set(incident.src) | set(incident.dst)
        selected = selected[selected.gid.isin(ego_gids)]
    gids = set(selected.gid)
    selected_edges = edges[edges.src.isin(gids) & edges.dst.isin(gids)]
    return {
        "nodes": records(
            selected[
                ["gid", "role", "role_score", "priority_score", "cluster_id", "depth", "is_seed", "truncated_by_depth"]
            ]
        ),
        "edges": records(selected_edges[["src", "dst", "sum_kzt", "n_tx"]]),
    }
