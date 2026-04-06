"""
Sub-Agent Tools - Wrappers that let the orchestrator invoke sub-agents as tools.

Each function is a @tool that the orchestrator can call. Internally,
it retrieves the sub-agent from the registry and invokes it.
"""

import logging
from strands.tools import tool

logger = logging.getLogger(__name__)


def _invoke_sub_agent(agent_name: str, prompt: str) -> str:
    """Invoke a sub-agent and return its text response."""
    from src.agents.registry import get_agent_registry

    agent = get_agent_registry().get(agent_name)
    response = agent(prompt)

    if hasattr(response, "message") and isinstance(response.message, dict):
        content = response.message.get("content", [])
        if content and isinstance(content, list) and len(content) > 0:
            return content[0].get("text", str(response))
    return str(response)


@tool
def teach_grammar(request: str) -> str:
    """
    Delegate to the grammar specialist agent for grammar explanations, exercises, and corrections.

    Use this when the student needs:
    - Grammar rule explanations
    - Grammar exercises at their level
    - Correction of grammar mistakes with explanations
    - Comparison of grammar structures between languages

    Args:
        request: Detailed request including the target language, student level, and what grammar topic to cover.

    Returns:
        Grammar lesson content from the specialist agent.
    """
    return _invoke_sub_agent("grammar", request)


@tool
def teach_vocabulary(request: str) -> str:
    """
    Delegate to the vocabulary specialist agent for vocabulary building and retention.

    Use this when the student needs:
    - New vocabulary on a specific theme
    - Flashcard-style practice
    - Word usage examples and mnemonics
    - Vocabulary review and testing

    Args:
        request: Detailed request including the target language, student level, theme, and number of words.

    Returns:
        Vocabulary lesson content from the specialist agent.
    """
    return _invoke_sub_agent("vocabulary", request)


@tool
def practice_conversation(request: str) -> str:
    """
    Delegate to the conversation agent for free-form language practice.

    Use this when the student wants to:
    - Practice speaking/writing in the target language
    - Have a conversation on a specific topic
    - Role-play real-world scenarios (ordering food, asking directions, etc.)

    Args:
        request: Context including target language, student level, topic, and the student's message to respond to.

    Returns:
        Conversation response in the target language with corrections if needed.
    """
    return _invoke_sub_agent("conversation", request)


@tool
def generate_content(request: str) -> str:
    """
    Delegate to the content agent for generating learning materials.

    Use this when the student needs:
    - Reading passages at their level
    - Cultural notes about the target language's culture
    - Comprehension exercises
    - Writing prompts

    Args:
        request: Detailed request including target language, student level, content type, and topic preferences.

    Returns:
        Generated learning content from the specialist agent.
    """
    return _invoke_sub_agent("content", request)
