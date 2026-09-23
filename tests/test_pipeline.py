import pandas as pd
from backend.pipeline import DEFAULT_DATA, ROLES, run_pipeline
from backend.validate_outputs import validate_outputs


def test_pipeline_contract_and_depth_boundary(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    frame = run_pipeline(DEFAULT_DATA, first)
    run_pipeline(DEFAULT_DATA, second)
    validate_outputs(DEFAULT_DATA, first)
    assert not ((frame.truncated_by_depth) & (frame.role == "terminal")).any()
    assert set(frame.role) == ROLES
    assert ((frame.role != "terminal") | ((frame.in_deg > 0) & (frame.out_deg == 0) & (frame.depth < 4))).all()
    assert ((frame.role != "transit") | (~frame.is_seed & (frame.in_deg > 0) & (frame.out_deg > 0))).all()
    assert ((frame.role != "distributor") | (frame.out_deg >= 3)).all()
    assert ((frame.role != "consolidator") | (frame.in_deg >= 2)).all()
    assert ((frame.role != "coordinator") | ((frame.in_deg + frame.out_deg >= 3) & (frame.coordinator_score >= 0.55))).all()

    source_gids = set(pd.read_parquet(DEFAULT_DATA / "nodes.parquet").gid)
    roles = pd.read_csv(first / "nodes_roles.csv")
    clusters = pd.read_csv(first / "clusters.csv")
    top = pd.read_csv(first / "top_nodes.csv")
    assert len(roles) == 2248 and not roles.gid.duplicated().any() and set(roles.gid) == source_gids
    assert roles.role.notna().all() and set(roles.role) <= ROLES
    assert roles.role_score.between(0, 1).all() and roles.priority_score.between(0, 1).all()
    assert roles.evidence.str.len().between(1, 200).all()
    assert set(roles.cluster_id) <= set(clusters.cluster_id)
    assert not ((clusters.n_seed > 0) & clusters.hypothesis.str.contains("без стартовых")).any()
    isolated_seed = clusters[(clusters.n_nodes == 1) & (clusters.n_seed == 1)]
    assert isolated_seed.hypothesis.str.contains("без наблюдаемых связей").all()
    assert len(top) >= 20 and top.priority_score.is_monotonic_decreasing
    assert top["rank"].tolist() == list(range(1, len(top) + 1))

    for name in ("nodes_roles.csv", "clusters.csv", "top_nodes.csv"):
        assert (first / name).read_bytes() == (second / name).read_bytes()
