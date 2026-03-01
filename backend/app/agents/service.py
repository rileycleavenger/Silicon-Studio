import json
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import time

logger = logging.getLogger(__name__)

class AgentService:
    def __init__(self):
        self.workspace_dir = Path.home() / ".silicon-studio"
        self.agents_file = self.workspace_dir / "agents" / "agents.json"
        self.agents_file.parent.mkdir(parents=True, exist_ok=True)
        
        if not self.agents_file.exists():
            with open(self.agents_file, "w") as f:
                json.dump([], f)

    def get_agents(self) -> List[Dict[str, Any]]:
        try:
            with open(self.agents_file, "r") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load agents: {e}")
            return []

    def save_agent(self, agent_data: Dict[str, Any]) -> Dict[str, Any]:
        agents = self.get_agents()
        if "id" not in agent_data or not agent_data["id"]:
            agent_data["id"] = str(uuid.uuid4())
            agents.append(agent_data)
        else:
            # Update existing
            for i, a in enumerate(agents):
                if a["id"] == agent_data["id"]:
                    agents[i] = agent_data
                    break
            else:
                agents.append(agent_data)
        
        self._save(agents)
        return agent_data

    def delete_agent(self, agent_id: str) -> bool:
        agents = self.get_agents()
        initial_len = len(agents)
        agents = [a for a in agents if a["id"] != agent_id]
        if len(agents) < initial_len:
            self._save(agents)
            return True
        return False

    def _save(self, agents: List[Dict[str, Any]]):
        with open(self.agents_file, "w") as f:
            json.dump(agents, f, indent=2)

    async def execute_agent(self, agent_id: str, input_data: str) -> Dict[str, Any]:
        """
        Execute an agent pipeline sequentially.
        NOTE: Node logic is a placeholder — each node returns a summary string
        rather than performing real computation. Extend with actual node handlers.
        """
        agents = self.get_agents()
        agent = next((a for a in agents if a["id"] == agent_id), None)
        if not agent:
            raise ValueError("Agent not found")

        results = []
        start = time.time()
        for node in agent.get("nodes", []):
            results.append({
                "node_id": node.get("id"),
                "node_name": node.get("data", {}).get("label") or node.get("name"),
                "status": "completed",
                "timestamp": time.time(),
                "output": f"Processed {input_data} via {node.get('type', 'generic')} node."
            })

        return {
            "agent_id": agent_id,
            "status": "success",
            "execution_time": round(time.time() - start, 3),
            "steps": results
        }
