from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

from .validate_outputs import validate_outputs

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA = ROOT / "data_for_case" / "data (1)" / "data"
DEFAULT_OUT = ROOT / "outputs"
ROLES = {"consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral"}


def load_data(data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    paths = {name: data_dir / f"{name}.parquet" for name in ("edges", "nodes", "transactions")}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Missing input files: {', '.join(missing)}")

    edges = pd.read_parquet(paths["edges"])
    nodes = pd.read_parquet(paths["nodes"])
    tx = pd.read_parquet(paths["transactions"])
    required = {
        "edges": {"src", "dst", "sum_kzt", "n_tx", "depth"},
        "nodes": {"gid", "depth", "is_seed"},
        "transactions": {"src", "dst", "date", "sum_kzt"},
    }
    for name, frame in (("edges", edges), ("nodes", nodes), ("transactions", tx)):
        absent = required[name] - set(frame.columns)
        if absent:
            raise ValueError(f"{name}.parquet missing columns: {sorted(absent)}")

    tx["date"] = pd.to_datetime(tx["date"])
    if nodes.gid.duplicated().any():
        raise ValueError("nodes.parquet contains duplicate gid values")
    gids = set(nodes.gid)
    unknown = (set(edges.src) | set(edges.dst)) - gids
    if unknown:
        raise ValueError(f"edges.parquet references {len(unknown)} unknown gid values")
    aggregated = tx.groupby(["src", "dst"]).agg(sum_kzt=("sum_kzt", "sum"), n_tx=("sum_kzt", "size"))
    expected = edges.set_index(["src", "dst"])[["sum_kzt", "n_tx"]].sort_index()
    actual = aggregated.sort_index()
    if not expected.index.equals(actual.index) or not np.allclose(expected.sum_kzt, actual.sum_kzt) or not np.array_equal(expected.n_tx, actual.n_tx):
        raise ValueError("edges.parquet does not match aggregated transactions.parquet")
    return edges, nodes, tx


def build_graph(edges: pd.DataFrame, nodes: pd.DataFrame) -> nx.DiGraph:
    graph = nx.DiGraph()
    graph.add_nodes_from(nodes.gid.astype(int))
    graph.add_weighted_edges_from(
        ((int(row.src), int(row.dst), float(row.sum_kzt)) for row in edges.itertuples()),
        weight="sum_kzt",
    )
    nx.set_edge_attributes(
        graph,
        {(int(row.src), int(row.dst)): int(row.n_tx) for row in edges.itertuples()},
        "n_tx",
    )
    return graph


def percentile_nonzero(values: pd.Series) -> pd.Series:
    result = pd.Series(0.0, index=values.index)
    positive = values > 0
    result.loc[positive] = values.loc[positive].rank(method="average", pct=True)
    return result


def calculate_features(graph: nx.DiGraph, nodes: pd.DataFrame) -> pd.DataFrame:
    frame = nodes[["gid", "depth", "is_seed"]].copy().set_index("gid")
    metrics = {
        "in_deg": dict(graph.in_degree()),
        "out_deg": dict(graph.out_degree()),
        "in_kzt": dict(graph.in_degree(weight="sum_kzt")),
        "out_kzt": dict(graph.out_degree(weight="sum_kzt")),
        "in_tx": dict(graph.in_degree(weight="n_tx")),
        "out_tx": dict(graph.out_degree(weight="n_tx")),
        "pagerank": nx.pagerank(graph, weight="sum_kzt"),
        # ponytail: sampled betweenness is deterministic and keeps the pipeline laptop-fast;
        # switch to exact or graph-tool when validation on larger graphs requires it.
        "betweenness": nx.betweenness_centrality(
            graph, k=min(300, len(graph)), normalized=True, weight=None, seed=42
        ),
    }
    for name, values in metrics.items():
        frame[name] = frame.index.map(values).fillna(0)
    for name in ("in_deg", "out_deg", "in_tx", "out_tx"):
        frame[name] = frame[name].astype(int)

    frame["pass_through"] = np.where(frame.in_kzt > 0, frame.out_kzt / frame.in_kzt, np.nan)
    frame["truncated_by_depth"] = (frame.depth == 4) & (frame.out_deg == 0)

    seed_reach = {int(gid): 0 for gid in frame.index}
    for seed in frame.index[frame.is_seed]:
        for gid in nx.descendants(graph, int(seed)) | {int(seed)}:
            seed_reach[gid] += 1
    frame["seed_reach_count"] = frame.index.map(seed_reach).astype(int)

    undirected = graph.to_undirected()
    communities = nx.community.louvain_communities(undirected, weight="sum_kzt", seed=42)
    communities = sorted(communities, key=lambda group: (-len(group), min(group)))
    cluster_by_gid = {gid: cluster_id for cluster_id, group in enumerate(communities, 1) for gid in group}
    frame["cluster_id"] = frame.index.map(cluster_by_gid).astype(int)

    raw_for_percentile = {
        "in_deg": frame.in_deg,
        "out_deg": frame.out_deg,
        "in_kzt": frame.in_kzt,
        "out_kzt": frame.out_kzt,
        "in_tx": frame.in_tx,
        "out_tx": frame.out_tx,
        "pagerank": frame.pagerank,
        "betweenness": frame.betweenness,
        "seed_reach": frame.seed_reach_count,
        "degree": frame.in_deg + frame.out_deg,
        "turnover": frame.in_kzt + frame.out_kzt,
    }
    for name, values in raw_for_percentile.items():
        frame[f"{name}_pct"] = percentile_nonzero(values)
    return frame


def assign_roles(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    scores = pd.DataFrame(index=frame.index)
    scores["consolidator"] = (
        0.35 * frame.in_deg_pct
        + 0.30 * frame.seed_reach_pct
        + 0.20 * frame.in_kzt_pct
        + 0.15 * frame.pagerank_pct
    ).where(frame.in_deg >= 2, 0)
    scores["distributor"] = (
        0.40 * frame.out_deg_pct
        + 0.25 * frame.out_kzt_pct
        + 0.20 * frame.out_tx_pct
        + 0.15 * frame.betweenness_pct
    ).where(frame.out_deg >= 3, 0)

    ratio_signal = (1 - np.abs(np.log(frame.pass_through.clip(lower=0.2, upper=5))) / np.log(5)).clip(0, 1)
    volume_balance = frame[["in_kzt", "out_kzt"]].min(axis=1) / frame[["in_kzt", "out_kzt"]].max(axis=1).replace(0, np.nan)
    tx_balance = frame[["in_tx", "out_tx"]].min(axis=1) / frame[["in_tx", "out_tx"]].max(axis=1).replace(0, np.nan)
    scores["transit"] = (
        0.25 * frame[["in_deg_pct", "out_deg_pct"]].min(axis=1)
        + 0.30 * ratio_signal.fillna(0)
        + 0.20 * volume_balance.fillna(0)
        + 0.15 * tx_balance.fillna(0)
        + 0.10 * frame.betweenness_pct
    ).where((frame.in_deg > 0) & (frame.out_deg > 0) & ~frame.is_seed, 0)
    scores["terminal"] = (
        0.35 * frame.in_kzt_pct
        + 0.30 * frame.in_deg_pct
        + 0.20 * frame.in_tx_pct
        + 0.15 * frame.seed_reach_pct
    ).where((frame.in_deg > 0) & (frame.out_deg == 0) & (frame.depth < 4), 0)
    scores["coordinator"] = (
        0.30 * frame.betweenness_pct
        + 0.25 * frame.pagerank_pct
        + 0.20 * frame.seed_reach_pct
        + 0.15 * frame.degree_pct
        + 0.10 * frame.turnover_pct
    ).where((frame.in_deg + frame.out_deg) >= 3, 0)
    scores["coordinator"] = scores.coordinator.where(scores.coordinator >= 0.55, 0)
    scores = scores.clip(0, 1)

    specialist_max = scores.max(axis=1)
    role = scores.idxmax(axis=1)
    peripheral = specialist_max < 0.48
    role.loc[peripheral] = "peripheral"
    role_score = specialist_max.copy()
    role_score.loc[peripheral] = 1 - specialist_max.loc[peripheral]

    result = frame.copy()
    result["role"] = role
    result["role_score"] = role_score.clip(0, 1)
    result["role_significance"] = specialist_max
    for name in scores:
        result[f"{name}_score"] = scores[name]
    result["peripheral_score"] = (1 - specialist_max).clip(0, 1)
    structural = 0.40 * frame.pagerank_pct + 0.40 * frame.betweenness_pct + 0.20 * frame.degree_pct
    result["priority_score"] = (
        0.25 * structural
        + 0.25 * specialist_max
        + 0.20 * frame.seed_reach_pct
        + 0.15 * frame.turnover_pct
        + 0.15 * frame.betweenness_pct
    ).clip(0, 1)
    return result, scores


def compact_kzt(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}m"
    if value >= 1_000:
        return f"{value / 1_000:.0f}k"
    return f"{value:.0f}"


def top_percent(percentile: float) -> int:
    return max(1, math.ceil((1 - float(percentile)) * 100 - 1e-9))


def evidence(row: pd.Series) -> str:
    role_text = {
        "consolidator": f"Признаки консолидации: {row.in_deg} плательщиков (топ {top_percent(row.in_deg_pct)}%), {row.seed_reach_count} seed-ветвей; наблюдаемый вход {compact_kzt(row.in_kzt)} KZT.",
        "distributor": f"Признаки распределения: {row.out_deg} получателей (топ {top_percent(row.out_deg_pct)}%), {row.out_tx} переводов; наблюдаемый выход {compact_kzt(row.out_kzt)} KZT.",
        "transit": f"Признаки транзита: вход {compact_kzt(row.in_kzt)}, выход {compact_kzt(row.out_kzt)} KZT, соотношение {row.pass_through:.2f}; {row.seed_reach_count} seed-ветвей.",
        "terminal": f"Кандидат в наблюдаемый сток: {row.in_deg} плательщиков, вход {compact_kzt(row.in_kzt)} KZT; depth={row.depth}<4, исходящих не видно.",
        "coordinator": f"Структурный кандидат: связи={row.in_deg + row.out_deg}, betweenness топ {top_percent(row.betweenness_pct)}%, достижим из {row.seed_reach_count} seed-ветвей.",
        "peripheral": f"Выраженная спецроль не выявлена: входящих связей {row.in_deg}, исходящих {row.out_deg}, наблюдаемый оборот {compact_kzt(row.in_kzt + row.out_kzt)} KZT.",
    }[row.role]
    if row.truncated_by_depth:
        role_text += " Depth=4: дальнейшие исходящие не наблюдаются."
    if row.is_seed:
        role_text += " Seed: входящий поток неполон."
    return role_text[:200]


def build_clusters(frame: pd.DataFrame, edges: pd.DataFrame) -> pd.DataFrame:
    cluster_by_gid = frame.cluster_id.to_dict()
    internal = edges[edges.src.map(cluster_by_gid) == edges.dst.map(cluster_by_gid)].copy()
    internal["cluster_id"] = internal.src.map(cluster_by_gid)
    turnover = internal.groupby("cluster_id").sum_kzt.sum().to_dict()
    rows = []
    for cluster_id, group in frame.groupby("cluster_id"):
        top = group.nlargest(5, "priority_score")
        n_seed = int(group.is_seed.sum())
        has_flow_roles = group.role.isin(["consolidator", "distributor"]).any()
        bridge = group.betweenness.max()
        if n_seed >= 5 and has_flow_roles:
            hypothesis = f"Крупная группа с {n_seed} seed; выражены точки консолидации/распределения. Гипотеза для проверки."
        elif n_seed > 1 and bridge > 0:
            hypothesis = f"Связаны {n_seed} seed и bridge-узел; возможна общая финансовая инфраструктура, требует проверки."
        elif n_seed == 1:
            hypothesis = "Группа вокруг одного seed; наблюдаемая структура требует проверки без вывода о виновности."
        elif len(group) == 1:
            hypothesis = "Изолированный узел в предоставленной выгрузке; данных для структурной гипотезы недостаточно."
        else:
            hypothesis = "Группа без seed в наблюдаемом фрагменте; роль определяется только структурой переводов."
        rows.append(
            {
                "cluster_id": int(cluster_id),
                "n_nodes": len(group),
                "n_seed": n_seed,
                "sum_kzt_internal": float(turnover.get(cluster_id, 0)),
                "max_priority": float(group.priority_score.max()),
                "avg_priority": float(group.priority_score.mean()),
                "top_role": str(group.role.value_counts().index[0]),
                "top_gids": ";".join(map(str, top.index.astype(int))),
                "hypothesis": hypothesis,
            }
        )
    return pd.DataFrame(rows).sort_values("cluster_id")


def write_outputs(frame: pd.DataFrame, edges: pd.DataFrame, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    output = frame.copy()
    output["evidence"] = output.apply(evidence, axis=1)
    columns = [
        "role", "role_score", "cluster_id", "priority_score", "evidence", "in_deg", "out_deg",
        "in_kzt", "out_kzt", "in_tx", "out_tx", "pagerank", "betweenness", "seed_reach_count",
        "pass_through", "depth", "is_seed", "truncated_by_depth", "in_deg_pct", "out_deg_pct",
        "in_kzt_pct", "out_kzt_pct", "in_tx_pct", "out_tx_pct", "pagerank_pct", "betweenness_pct",
        "seed_reach_pct", "degree_pct", "turnover_pct", "consolidator_score", "distributor_score",
        "transit_score", "terminal_score", "coordinator_score", "peripheral_score",
    ]
    output.reset_index()[["gid", *columns]].to_csv(out_dir / "nodes_roles.csv", index=False)
    build_clusters(output, edges).to_csv(out_dir / "clusters.csv", index=False)
    top = output.nlargest(50, "priority_score").copy()
    top.insert(0, "rank", range(1, len(top) + 1))
    top["why"] = top.apply(
        lambda row: (
            f"role={row.role} ({row.role_score:.2f}); seed_reach={row.seed_reach_count}; "
            f"degree={row.in_deg + row.out_deg}; turnover={compact_kzt(row.in_kzt + row.out_kzt)} KZT; "
            f"betweenness={row.betweenness:.4f}"
        ),
        axis=1,
    )
    top.reset_index()[["rank", "gid", "role", "priority_score", "why"]].to_csv(out_dir / "top_nodes.csv", index=False)


def run_pipeline(data_dir: Path = DEFAULT_DATA, out_dir: Path = DEFAULT_OUT) -> pd.DataFrame:
    started = time.perf_counter()
    edges, nodes, tx = load_data(data_dir)
    print(f"Loaded {len(nodes)} nodes, {len(edges)} edges, {len(tx)} transactions")
    graph = build_graph(edges, nodes)
    frame = calculate_features(graph, nodes)
    frame, _ = assign_roles(frame)
    write_outputs(frame, edges, out_dir)
    validate_outputs(data_dir, out_dir)
    counts = ", ".join(f"{role}={count}" for role, count in frame.role.value_counts().items())
    print(f"Assigned roles: {counts}")
    print(f"Pipeline completed in {time.perf_counter() - started:.2f}s -> {out_dir}")
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Build explainable AML graph outputs from organizer parquet files.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    run_pipeline(args.data.resolve(), args.out.resolve())


if __name__ == "__main__":
    main()
