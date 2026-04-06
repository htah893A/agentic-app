"""
Language Learning Agent - Main Entry Point

Wraps the agent system with BedrockAgentCoreApp for deployment.
Uses the orchestrator agent by default, configurable via AGENT_TYPE env var.
"""

import logging
import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from src.agents.registry import get_agent_registry
from src.memory import MemoryManager

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()

_agent = None
_memory_manager = None


def get_agent():
    global _agent
    if _agent is None:
        agent_type = os.environ.get("AGENT_TYPE", "orchestrator")
        registry = get_agent_registry()
        _agent = registry.get(agent_type)
        logger.info(f"Loaded agent: {agent_type} (available: {registry.available_agents})")
    return _agent


def get_memory_manager():
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = MemoryManager(
            memory_id=os.environ.get("MEMORY_ID"),
            region=os.environ.get("AWS_REGION", "us-east-1"),
        )
    return _memory_manager


@app.entrypoint
def invoke(payload: dict) -> dict:
    """
    Handler for agent invocation.

    Args:
        payload: Request containing:
            - prompt: User message
            - session_id: Session ID for conversation continuity
            - user_id: User ID for personalization and progress tracking
            - mode: "text" or "voice"
            - audio_base64: Base64-encoded audio (voice mode)
            - language: Target language for voice processing

    Returns:
        Response dict with the agent's reply
    """
    try:
        prompt = payload.get("prompt", "")
        session_id = payload.get("session_id", "default")
        user_id = payload.get("user_id", "anonymous")
        mode = payload.get("mode", "text")
        audio_base64 = payload.get("audio_base64")
        language = payload.get("language")

        if not prompt and not audio_base64:
            return {"response": "Please provide a message or audio.", "session_id": session_id, "status": "error"}

        logger.info(f"Processing request - session: {session_id}, user: {user_id}, mode: {mode}")

        agent = get_agent()
        memory_manager = get_memory_manager()

        # Build the prompt with context
        context_parts = [f"[User ID: {user_id}, Session: {session_id}]"]

        if mode == "voice" and audio_base64 and language:
            context_parts.append(
                f"[Voice Mode: The student sent audio in {language}. "
                f"Use speech_to_text to transcribe it, then respond. "
                f"Also use text_to_speech for your response so they can hear it.]"
            )
            context_parts.append(f"[Audio data available - call speech_to_text with the audio]")
            # Store audio in a way the tool can access it
            os.environ["_CURRENT_AUDIO_B64"] = audio_base64
            os.environ["_CURRENT_AUDIO_LANG"] = language

        if language:
            context_parts.append(f"[Target Language: {language}]")

        context_parts.append(prompt if prompt else "The student sent a voice message. Please process it.")

        full_prompt = "\n\n".join(context_parts)

        response = agent(full_prompt)
        response_text = _extract_response_text(response)

        # Clean up temp env vars
        os.environ.pop("_CURRENT_AUDIO_B64", None)
        os.environ.pop("_CURRENT_AUDIO_LANG", None)

        # Store interaction in memory
        memory_manager.store_interaction(
            actor_id=user_id,
            session_id=session_id,
            user_message=prompt or "[voice message]",
            assistant_message=response_text,
        )

        return {"response": response_text, "session_id": session_id, "status": "success"}

    except Exception as e:
        logger.error(f"Error processing request: {e}", exc_info=True)
        return {
            "response": f"An error occurred: {str(e)}",
            "session_id": payload.get("session_id", "default"),
            "status": "error",
        }


def _extract_response_text(response) -> str:
    if hasattr(response, "message") and isinstance(response.message, dict):
        content = response.message.get("content", [])
        if content and isinstance(content, list) and len(content) > 0:
            return content[0].get("text", str(response))
    return str(response)


if __name__ == "__main__":
    app.run()
