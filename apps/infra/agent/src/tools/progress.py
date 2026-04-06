"""
Progress Tracking Tools - Learner profile and progress management.

Stores structured progress data in DynamoDB so the orchestrator
can personalize the learning experience across sessions.
"""

import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from strands.tools import tool

logger = logging.getLogger(__name__)

_dynamodb = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        region = os.environ.get("AWS_REGION", "us-east-1")
        _dynamodb = boto3.resource("dynamodb", region_name=region)
    table_name = os.environ.get("PROGRESS_TABLE", "AgentCoreLearnerProgress")
    return _dynamodb.Table(table_name)


@tool
def get_learner_profile(user_id: str) -> str:
    """
    Retrieve the learner's profile including their target language, level, and progress.

    Use this at the start of every session to understand where the student is
    and personalize the lesson accordingly.

    Args:
        user_id: The unique identifier for the learner.

    Returns:
        JSON string with the learner's profile, or a message if no profile exists yet.
    """
    try:
        table = _get_table()
        response = table.get_item(Key={"userId": user_id})
        item = response.get("Item")

        if not item:
            return json.dumps({
                "status": "new_learner",
                "message": "No profile found. This is a new student — ask them about their target language, current level, and learning goals.",
            })

        return json.dumps(item, default=str)

    except ClientError as e:
        logger.error(f"Error retrieving learner profile: {e}")
        return json.dumps({"status": "error", "message": "Could not retrieve learner profile. Proceed by asking the student about their level."})


@tool
def update_learner_progress(
    user_id: str,
    target_language: str,
    level: str,
    topics_covered: str,
    notes: str,
) -> str:
    """
    Update the learner's progress after a session.

    Call this at the end of each session to save what was covered,
    the student's current level, and any notes for next time.

    Args:
        user_id: The unique identifier for the learner.
        target_language: The language the student is learning (e.g., "Spanish").
        level: Current proficiency level: "beginner", "intermediate", or "advanced".
        topics_covered: Comma-separated list of topics covered this session (e.g., "past tense, food vocabulary").
        notes: Free-text notes about the student's strengths, weaknesses, or what to focus on next.

    Returns:
        Confirmation message.
    """
    try:
        table = _get_table()
        now = datetime.now(timezone.utc).isoformat()

        table.update_item(
            Key={"userId": user_id},
            UpdateExpression=(
                "SET targetLanguage = :lang, "
                "currentLevel = :level, "
                "lastSessionTopics = :topics, "
                "teacherNotes = :notes, "
                "lastSessionAt = :ts, "
                "sessionsCount = if_not_exists(sessionsCount, :zero) + :one"
            ),
            ExpressionAttributeValues={
                ":lang": target_language,
                ":level": level,
                ":topics": topics_covered,
                ":notes": notes,
                ":ts": now,
                ":zero": 0,
                ":one": 1,
            },
        )

        return f"Progress updated for {user_id}: {target_language} ({level}). Topics: {topics_covered}"

    except ClientError as e:
        logger.error(f"Error updating learner progress: {e}")
        return "Could not save progress. The session data may be lost."
