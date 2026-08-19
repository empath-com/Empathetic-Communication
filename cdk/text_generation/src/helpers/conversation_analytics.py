import json
import logging

from shared.evaluation_tool_specs import (
    CONVERSATION_ANALYTICS_METRICS,
    CONVERSATION_RECOMMENDATION_TOPICS,
    get_conversation_analytics_tool_spec,
)

logger = logging.getLogger(__name__)

RUBRIC_VERSION = "conversation-analytics-v1"
TOOL_NAME = "submit_conversation_analytics"


def evaluate_completed_conversation(transcript: str, bedrock_client: dict) -> dict:
    """Return fixed aggregate metrics for one completed conversation."""
    if not transcript.strip():
        raise ValueError("Cannot analyze an empty conversation transcript")

    prompt = f"""Analyze this completed healthcare simulation transcript.

Count only evidence explicitly present in the transcript. An interruption requires a transcript marker or an unfinished utterance; do not infer vocal behavior. Count jargon when the practitioner uses unexplained technical language. Select only recommendation topics supported by the counts.

TRANSCRIPT_START
{transcript}
TRANSCRIPT_END"""

    body = {
        "system": [{"text": "You are a rigorous healthcare communication research evaluator. Return only the requested structured tool result."}],
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "toolConfig": {
            "tools": [get_conversation_analytics_tool_spec()],
            "toolChoice": {"tool": {"name": TOOL_NAME}},
        },
        "inferenceConfig": {"temperature": 0, "maxTokens": 800},
    }

    response = bedrock_client["client"].invoke_model(
        modelId=bedrock_client["model_id"],
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    result = json.loads(response["body"].read())
    content_blocks = result.get("output", {}).get("message", {}).get("content", [])
    evaluation = next(
        (
            block.get("toolUse", {}).get("input", {})
            for block in content_blocks
            if block.get("toolUse", {}).get("name") == TOOL_NAME
        ),
        None,
    )
    if not isinstance(evaluation, dict):
        raise ValueError("Bedrock response did not include conversation analytics")

    raw_metrics = evaluation.get("metrics")
    if not isinstance(raw_metrics, dict):
        raise ValueError("Conversation analytics metrics are missing")

    metrics = {}
    for key in CONVERSATION_ANALYTICS_METRICS:
        value = raw_metrics.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"Invalid metric count for {key}")
        metrics[key] = value

    raw_topics = evaluation.get("recommendation_topics")
    if not isinstance(raw_topics, list):
        raise ValueError("Conversation analytics recommendation topics are missing")
    topics = sorted({topic for topic in raw_topics if topic in CONVERSATION_RECOMMENDATION_TOPICS})

    score = evaluation.get("communication_score")
    if not isinstance(score, int) or isinstance(score, bool) or not 0 <= score <= 100:
        raise ValueError("Invalid communication score")

    objective_achieved = evaluation.get("objective_achieved")
    if not isinstance(objective_achieved, bool):
        raise ValueError("Invalid objective achievement result")

    return {
        "rubric_version": RUBRIC_VERSION,
        "metrics": metrics,
        "recommendation_topics": topics,
        "communication_score": score,
        "objective_achieved": objective_achieved,
    }