"""
Agent Registry - Dynamic agent discovery and management.

Allows registering multiple agents and retrieving them by name,
enabling the orchestrator to call sub-agents as tools.
"""

import logging
import os
from typing import Callable, Dict, Optional

from strands import Agent
from strands.models import BedrockModel

logger = logging.getLogger(__name__)

# Type alias for agent factory functions
AgentFactory = Callable[[], Agent]


class AgentRegistry:
    """Registry for managing multiple agents."""

    def __init__(self):
        self._factories: Dict[str, AgentFactory] = {}
        self._instances: Dict[str, Agent] = {}

    def register(self, name: str, factory: AgentFactory):
        """Register an agent factory by name."""
        self._factories[name] = factory
        logger.info(f"Registered agent: {name}")

    def get(self, name: str) -> Agent:
        """Get or create an agent instance by name."""
        if name not in self._instances:
            if name not in self._factories:
                raise KeyError(f"Agent '{name}' not registered. Available: {list(self._factories.keys())}")
            self._instances[name] = self._factories[name]()
            logger.info(f"Created agent instance: {name}")
        return self._instances[name]

    @property
    def available_agents(self) -> list[str]:
        return list(self._factories.keys())


def create_bedrock_model(model_id: Optional[str] = None) -> BedrockModel:
    """Create a shared Bedrock model config."""
    return BedrockModel(
        model_id=model_id or os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )


# Singleton registry
_registry: Optional[AgentRegistry] = None


def get_agent_registry() -> AgentRegistry:
    """Get or create the global agent registry."""
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
        _register_all_agents(_registry)
    return _registry


def _register_all_agents(registry: AgentRegistry):
    """Register all available agents."""
    from src.agents.orchestrator import create_orchestrator_agent
    from src.agents.grammar import create_grammar_agent
    from src.agents.vocabulary import create_vocabulary_agent
    from src.agents.conversation import create_conversation_agent
    from src.agents.content import create_content_agent

    registry.register("orchestrator", create_orchestrator_agent)
    registry.register("grammar", create_grammar_agent)
    registry.register("vocabulary", create_vocabulary_agent)
    registry.register("conversation", create_conversation_agent)
    registry.register("content", create_content_agent)
