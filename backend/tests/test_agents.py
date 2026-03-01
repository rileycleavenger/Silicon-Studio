import pytest
import json
from app.agents.service import AgentService


@pytest.fixture
def agent_service(temp_dir):
    """Create an AgentService using a temp directory."""
    svc = AgentService()
    from pathlib import Path
    svc.agents_file = Path(temp_dir) / "agents.json"
    svc.agents_file.parent.mkdir(parents=True, exist_ok=True)
    with open(svc.agents_file, "w") as f:
        json.dump([], f)
    return svc


def test_save_new_agent(agent_service):
    agent = agent_service.save_agent({
        "name": "Test Agent",
        "nodes": [{"id": "1", "type": "input"}],
        "edges": []
    })
    assert "id" in agent
    assert agent["name"] == "Test Agent"


def test_save_generates_id(agent_service):
    agent = agent_service.save_agent({"name": "A", "nodes": [], "edges": []})
    assert len(agent["id"]) > 0


def test_update_existing_agent(agent_service):
    agent = agent_service.save_agent({"name": "Original", "nodes": [], "edges": []})
    agent_id = agent["id"]

    updated = agent_service.save_agent({"id": agent_id, "name": "Updated", "nodes": [], "edges": []})
    assert updated["name"] == "Updated"
    assert len(agent_service.get_agents()) == 1


def test_list_agents(agent_service):
    agent_service.save_agent({"name": "A", "nodes": [], "edges": []})
    agent_service.save_agent({"name": "B", "nodes": [], "edges": []})
    agents = agent_service.get_agents()
    assert len(agents) == 2


def test_delete_agent(agent_service):
    agent = agent_service.save_agent({"name": "Delete Me", "nodes": [], "edges": []})
    assert agent_service.delete_agent(agent["id"]) is True
    assert len(agent_service.get_agents()) == 0


def test_delete_nonexistent_agent(agent_service):
    assert agent_service.delete_agent("fake-id") is False


@pytest.mark.asyncio
async def test_execute_agent(agent_service):
    agent = agent_service.save_agent({
        "name": "Pipeline",
        "nodes": [
            {"id": "1", "type": "input", "data": {"label": "Input Node"}},
            {"id": "2", "type": "transform", "data": {"label": "Transform Node"}},
        ],
        "edges": []
    })

    result = await agent_service.execute_agent(agent["id"], "test data")
    assert result["status"] == "success"
    assert result["agent_id"] == agent["id"]
    assert len(result["steps"]) == 2
    assert result["execution_time"] >= 0
    assert result["steps"][0]["node_name"] == "Input Node"
    assert result["steps"][0]["status"] == "completed"


@pytest.mark.asyncio
async def test_execute_nonexistent_agent(agent_service):
    with pytest.raises(ValueError, match="Agent not found"):
        await agent_service.execute_agent("nonexistent-id", "test")


@pytest.mark.asyncio
async def test_execute_agent_no_nodes(agent_service):
    agent = agent_service.save_agent({"name": "Empty", "nodes": [], "edges": []})
    result = await agent_service.execute_agent(agent["id"], "test")
    assert result["status"] == "success"
    assert len(result["steps"]) == 0
