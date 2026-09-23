from backend.pipeline import DEFAULT_DATA, run_pipeline
from backend.validate_outputs import validate_outputs


def test_pipeline_contract_and_depth_boundary(tmp_path):
    frame = run_pipeline(DEFAULT_DATA, tmp_path)
    validate_outputs(DEFAULT_DATA, tmp_path)
    assert not ((frame.truncated_by_depth) & (frame.role == "terminal")).any()
    assert set(frame.role) == {
        "consolidator", "transit", "distributor", "terminal", "coordinator", "peripheral"
    }
