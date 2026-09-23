from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import DEFAULT_DATA, DEFAULT_OUT, ROLES


def records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            key: None if pd.isna(value) else value.item() if hasattr(value, "item") else value
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

app = FastAPI(title="Money Graph AML API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    return records(top_nodes.head(limit))


def require_gid(gid: int) -> pd.Series:
    if gid not in role_by_gid.index:
        raise HTTPException(status_code=404, detail=f"GID {gid} not found")
    return role_by_gid.loc[gid]


@app.get("/api/nodes/{gid}")
def get_node(gid: int) -> dict[str, Any]:
    row = require_gid(gid)
    payload = records(pd.DataFrame([row]))[0]
    payload["gid"] = gid
    payload["coverage_warning"] = (
        "Depth=4 boundary: later outgoing transfers are outside the provided crawl."
        if row.truncated_by_depth
        else "Seed incoming transfers are incomplete in this outgoing-only crawl."
        if row.is_seed
        else None
    )
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
