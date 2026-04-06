"""
Spaced Repetition Tools - Review scheduling for vocabulary and grammar.

Implements a simplified SM-2 algorithm to determine what the student
should review and when, based on their performance history.
"""

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from strands.tools import tool

logger = logging.getLogger(__name__)

_dynamodb = None

# SM-2 intervals in days based on repetition count
INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120]


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    table_name = os.environ.get("REVIEW_TABLE", "AgentCoreLearnerReviews")
    return _dynamodb.Table(table_name)


@tool
def add_review_items(user_id: str, language: str, items: str) -> str:
    """
    Add vocabulary or grammar items to the student's review queue.

    Call this after teaching new vocabulary or grammar to schedule future reviews.

    Args:
        user_id: The learner's unique identifier.
        language: The target language (e.g., "Spanish").
        items: JSON array of items to add. Each item: {"term": "hola", "translation": "hello", "type": "vocabulary"} or {"term": "ser vs estar", "explanation": "...", "type": "grammar"}.

    Returns:
        Confirmation of items added.
    """
    try:
        parsed_items = json.loads(items)
    except json.JSONDecodeError:
        return "Error: items must be a valid JSON array."

    table = _get_table()
    now = datetime.now(timezone.utc).isoformat()
    added = 0

    for item in parsed_items:
        term = item.get("term", "")
        if not term:
            continue
        try:
            table.put_item(
                Item={
                    "userId": user_id,
                    "itemKey": f"{language}#{term}",
                    "language": language,
                    "term": term,
                    "translation": item.get("translation", ""),
                    "explanation": item.get("explanation", ""),
                    "itemType": item.get("type", "vocabulary"),
                    "repetition": 0,
                    "easeFactor": Decimal("2.5"),
                    "nextReviewAt": now,
                    "createdAt": now,
                    "lastReviewedAt": now,
                },
                ConditionExpression="attribute_not_exists(userId) AND attribute_not_exists(itemKey)",
            )
            added += 1
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                continue  # Item already exists
            raise

    return f"Added {added} new review items for {language}."


@tool
def get_due_reviews(user_id: str, language: str, max_items: int = 10) -> str:
    """
    Get items that are due for review based on spaced repetition schedule.

    Use this at the start of a session or when the student asks to review.

    Args:
        user_id: The learner's unique identifier.
        language: The target language to review.
        max_items: Maximum number of items to return (default: 10).

    Returns:
        JSON string with items due for review, sorted by urgency.
    """
    table = _get_table()
    now = datetime.now(timezone.utc).isoformat()

    try:
        response = table.query(
            KeyConditionExpression="userId = :uid AND begins_with(itemKey, :lang)",
            FilterExpression="nextReviewAt <= :now",
            ExpressionAttributeValues={
                ":uid": user_id,
                ":lang": f"{language}#",
                ":now": now,
            },
        )

        items = response.get("Items", [])
        # Sort by nextReviewAt (most overdue first)
        items.sort(key=lambda x: x.get("nextReviewAt", ""))

        due = []
        for item in items[:max_items]:
            due.append({
                "term": item.get("term"),
                "translation": item.get("translation", ""),
                "explanation": item.get("explanation", ""),
                "type": item.get("itemType", "vocabulary"),
                "repetition": int(item.get("repetition", 0)),
                "last_reviewed": item.get("lastReviewedAt", "never"),
            })

        if not due:
            return json.dumps({"message": f"No items due for review in {language}. Great job staying on top of things!", "items": []})

        return json.dumps({"message": f"{len(due)} items due for review.", "items": due})

    except ClientError as e:
        logger.error(f"Error fetching reviews: {e}")
        return json.dumps({"error": "Could not fetch review items."})


@tool
def record_review_result(user_id: str, language: str, term: str, quality: int) -> str:
    """
    Record the result of a review and update the next review date.

    Call this after the student attempts to recall a vocabulary word or grammar rule.

    Args:
        user_id: The learner's unique identifier.
        language: The target language.
        term: The term that was reviewed.
        quality: Score from 0-5 (0=complete fail, 3=correct with difficulty, 5=perfect recall).

    Returns:
        Updated review schedule for the item.
    """
    if quality < 0 or quality > 5:
        return "Error: quality must be between 0 and 5."

    table = _get_table()
    item_key = f"{language}#{term}"
    now = datetime.now(timezone.utc)

    try:
        response = table.get_item(Key={"userId": user_id, "itemKey": item_key})
        item = response.get("Item")

        if not item:
            return f"Item '{term}' not found in review queue."

        repetition = int(item.get("repetition", 0))
        ease_factor = float(item.get("easeFactor", 2.5))

        # SM-2 algorithm
        if quality >= 3:
            repetition += 1
        else:
            repetition = 0  # Reset on failure

        # Update ease factor
        ease_factor = max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

        # Calculate next interval
        if repetition < len(INTERVALS):
            interval_days = INTERVALS[repetition]
        else:
            interval_days = int(INTERVALS[-1] * ease_factor)

        next_review = now + timedelta(days=interval_days)

        table.update_item(
            Key={"userId": user_id, "itemKey": item_key},
            UpdateExpression="SET repetition = :rep, easeFactor = :ef, nextReviewAt = :nr, lastReviewedAt = :now",
            ExpressionAttributeValues={
                ":rep": repetition,
                ":ef": Decimal(str(round(ease_factor, 2))),
                ":nr": next_review.isoformat(),
                ":now": now.isoformat(),
            },
        )

        status = "correct" if quality >= 3 else "needs review"
        return json.dumps({
            "term": term,
            "status": status,
            "next_review": next_review.strftime("%Y-%m-%d"),
            "interval_days": interval_days,
            "repetition": repetition,
        })

    except ClientError as e:
        logger.error(f"Error recording review: {e}")
        return "Could not record review result."
