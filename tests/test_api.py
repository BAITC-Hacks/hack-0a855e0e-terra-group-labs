from fastapi.testclient import TestClient

from backend.api import app, edges, roles

client = TestClient(app)


def test_demo_api_contract():
    summary = client.get("/api/summary")
    assert summary.status_code == 200
    assert summary.json()["nodes"] == 2248

    gid = int(roles.iloc[0].gid)
    assert client.get(f"/api/nodes/{gid}").status_code == 200
    assert client.get(f"/api/nodes/{gid}/neighbors").status_code == 200
    assert client.get("/api/nodes/-1").status_code == 404

    edge = next(edges.itertuples(index=False))
    detail = client.get(f"/api/edges/{edge.src}/{edge.dst}")
    assert detail.status_code == 200
    assert len(detail.json()["transactions"]) == int(edge.n_tx)

    graph = client.get(f"/api/graph?gid={gid}")
    assert graph.status_code == 200
    assert str(gid) in {node["gid"] for node in graph.json()["nodes"]}
