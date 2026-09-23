from backend.api import app, edges, roles
from fastapi.testclient import TestClient

client = TestClient(app)


def test_demo_api_contract():
    summary = client.get("/api/summary")
    assert summary.status_code == 200
    assert summary.json()["nodes"] == 2248

    gid = int(roles.iloc[0].gid)
    node = client.get(f"/api/nodes/{gid}")
    assert node.status_code == 200
    assert node.json()["gid"] == str(gid)
    assert node.json()["role_components"]
    assert client.get(f"/api/nodes/{gid}/neighbors").status_code == 200
    assert client.get("/api/nodes/-1").status_code == 404

    matches = client.get("/api/nodes", params={"role": "distributor", "depth": 1, "min_priority": 0.5})
    assert matches.status_code == 200
    assert all(item["role"] == "distributor" and item["depth"] == 1 for item in matches.json())
    assert all(isinstance(item["gid"], str) for item in matches.json())

    edge = next(edges.itertuples(index=False))
    detail = client.get(f"/api/edges/{edge.src}/{edge.dst}")
    assert detail.status_code == 200
    assert len(detail.json()["transactions"]) == int(edge.n_tx)
    assert client.get("/api/edges/-1/-2").status_code == 404

    graph = client.get(f"/api/graph?gid={gid}")
    assert graph.status_code == 200
    assert str(gid) in {node["gid"] for node in graph.json()["nodes"]}

    cluster_id = int(roles.iloc[0].cluster_id)
    assert client.get(f"/api/clusters/{cluster_id}").status_code == 200
    assert client.get("/api/clusters/-1").status_code == 404
    cluster_graph = client.get("/api/cluster-graph")
    assert cluster_graph.status_code == 200
    assert cluster_graph.json()["nodes"] and cluster_graph.json()["edges"]
    assert client.get("/api/analytics").status_code == 200
