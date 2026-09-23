from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA = ROOT / "data_for_case" / "data (1)" / "data"
DEFAULT_OUT = ROOT / "outputs"
ROLES = {"consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral"}


def validate_outputs(data_dir: Path = DEFAULT_DATA, out_dir: Path = DEFAULT_OUT) -> None:
    nodes = pd.read_parquet(data_dir / "nodes.parquet")
    roles = pd.read_csv(out_dir / "nodes_roles.csv")
    clusters = pd.read_csv(out_dir / "clusters.csv")
    top = pd.read_csv(out_dir / "top_nodes.csv")

    required_roles = {"gid", "role", "role_score", "cluster_id", "priority_score", "evidence"}
    required_clusters = {"cluster_id", "n_nodes", "n_seed", "sum_kzt_internal", "top_gids", "hypothesis"}
    required_top = {"rank", "gid", "role", "priority_score", "why"}
    assert required_roles <= set(roles), f"nodes_roles.csv missing {sorted(required_roles - set(roles))}"
    assert required_clusters <= set(clusters), f"clusters.csv missing {sorted(required_clusters - set(clusters))}"
    assert required_top <= set(top), f"top_nodes.csv missing {sorted(required_top - set(top))}"
    assert len(roles) == 2248 and not roles.gid.duplicated().any()
    assert set(roles.gid) == set(nodes.gid)
    assert roles.role.notna().all() and set(roles.role) <= ROLES
    for column in ("role_score", "priority_score"):
        assert np.isfinite(roles[column]).all() and roles[column].between(0, 1).all()
    assert roles.cluster_id.notna().all()
    assert roles.evidence.astype(str).str.len().between(1, 200).all()
    assert set(roles.cluster_id) <= set(clusters.cluster_id)
    assert clusters.hypothesis.notna().all() and clusters.top_gids.notna().all()
    assert len(top) >= 20 and set(top.gid) <= set(nodes.gid)
    assert top.priority_score.is_monotonic_decreasing
    assert top["rank"].tolist() == list(range(1, len(top) + 1))
    assert top.why.notna().all()
    assert not ((roles.truncated_by_depth.astype(bool)) & (roles.role == "terminal")).any()
    print("SUBMISSION VALIDATION PASSED")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate required HackAlem CSV outputs.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    validate_outputs(args.data.resolve(), args.out.resolve())


if __name__ == "__main__":
    main()
