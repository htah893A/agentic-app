"""
Agent Definition - Backward-compatible wrapper.

For direct usage, prefer src.agents.registry.get_agent_registry().
"""

import logging
from strands import Agent
from src.agents.registry import get_agent_registry

logger = logging.getLogger(__name__)


def create_agent(agent_type: str = "orchestrator") -> Agent:
    """Create an agent by type. Defaults to the orchestrator."""
    registry = get_agent_registry()
    return registry.get(agent_type)
