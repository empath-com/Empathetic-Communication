import boto3
import hashlib
import json
import logging
import os
import re
from pydantic import BaseModel, Field

from .prompts import get_empathy_prompt, get_default_empathy_prompt
from .evaluation_tool_specs import (
    CARE_CRITERIA, PRISM_CRITERIA, NURSE_CRITERIA,
    CARE_CRITERIA_LABELS, PRISM_CRITERIA_LABELS, NURSE_CRITERIA_LABELS,
    CARE_JUSTIFICATION_KEYS, PRISM_JUSTIFICATION_KEYS, NURSE_JUSTIFICATION_KEYS,
    get_care_tool_name, get_prism_tool_name, get_nurse_tool_name,
    get_care_tool_spec, get_prism_tool_spec, get_nurse_tool_spec,
    resolve_schema_variant,
)

SIMULATED_ROLE = os.getenv("SIMULATED_ROLE", "patient")
PRACTITIONER_ROLE = os.getenv("PRACTITIONER_ROLE", "pharmacist")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Toggle to evaluate the full thread (up to message_id) instead of only one message.
USE_THREAD_UP_TO_MESSAGE_ID_FOR_EVAL = True

# Guardrails to keep empathy calls fast and avoid API timeout.
MAX_THREAD_MESSAGES_FOR_EVAL = 12
MAX_TRANSCRIPT_CHARS_FOR_EVAL = 6000
MAX_PATIENT_CONTEXT_CHARS = 1200
EMPATHY_MAX_OUTPUT_TOKENS = 2000
MAX_SYSTEM_PROMPT_CHARS = 7000
MAX_GROUNDING_RETRIES = 1
DEBUG_LOG_FULL_PROMPTS = False
EMPATHY_TOOL_SCHEMA_VARIANT = resolve_schema_variant()

STATIC_GROUNDING_INSTRUCTIONS = """Grounding rules (mandatory):
- Evaluate ONLY using evidence in TRANSCRIPT.
- Do not invent quotes, symptoms, medications, events, names, or non-verbal cues.
- If evidence is missing for a criterion, state that explicitly in justification.
- Keep output concise: one short paragraph for overall assessment and 1-2 sentences per item.
"""


class LLM_evaluation(BaseModel):
    response: str = Field(description="Assessment of the student's answer with a follow-up question.")
    verdict: str = Field(description="'True' if the student has properly diagnosed the patient, 'False' otherwise.")



def _is_tooluse_sequence_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "invalid sequence" in message and "tooluse" in message


def _build_no_evidence_evaluation(tool: str, transcript: str, bedrock_client) -> dict:
    reason = "Insufficient transcript evidence for criterion-level empathy scoring."

    if tool == "PRISM":
        evaluation = {k: 1 for k in PRISM_CRITERIA}
        evaluation["judge_reasoning"] = {
            "prepare_justification": reason,
            "recognise_justification": reason,
            "interact_justification": reason,
            "self_assess_justification": reason,
            "master_justification": reason,
            "overall_assessment": (
                "You sent a very short message, so there is not enough evidence yet to evaluate your empathic communication. "
                "In your next turn, acknowledge the patient concern, reflect it back, and offer a collaborative next step."
            )
        }
        evaluation["feedback"] = {
            "strengths": ["You initiated the interaction, which keeps the conversation open."],
            "improvement_suggestions": [
                "Write 2-3 sentences that include one reflective statement and one clarifying question.",
                "Name the patient concern in your own words before giving advice."
            ],
            "forward_target": "Interact"
        }
        evaluation["evaluation_tool"] = "PRISM"
    elif tool == "NURSE":
        evaluation = {k: 1 for k in NURSE_CRITERIA}
        evaluation["emotional_cues"] = {"detected_emotions": [], "missed_emotions": []}
        evaluation["judge_reasoning"] = {
            "name_justification": reason,
            "understand_justification": reason,
            "respect_justification": reason,
            "support_justification": reason,
            "explore_justification": reason,
            "overall_assessment": (
                "You sent a very short message, so there is not enough evidence yet to evaluate your empathic communication. "
                "In your next turn, acknowledge the patient emotion by name, validate their experience, and ask an open question."
            )
        }
        evaluation["feedback"] = {
            "strengths": ["You initiated the interaction, which keeps the conversation open."],
            "missed_opportunities": [
                "Name the patient's emotion explicitly before responding.",
                "Use an open question to invite the patient to share more."
            ],
            "role_modelled_response": "",
            "behaviour_goal": "Name"
        }
        evaluation["evaluation_tool"] = "NURSE"
    else:
        evaluation = {k: 1 for k in CARE_CRITERIA}
        evaluation["judge_reasoning"] = {
            "making_feel_at_ease_justification": reason,
            "letting_tell_story_justification": reason,
            "really_listening_justification": reason,
            "interested_in_whole_person_justification": reason,
            "understanding_concerns_justification": reason,
            "showing_care_compassion_justification": reason,
            "being_positive_justification": reason,
            "explaining_clearly_justification": reason,
            "helping_take_control_justification": reason,
            "making_plan_of_action_justification": reason,
            "overall_assessment": (
                "You sent a very short message, so there is not enough evidence yet to evaluate your empathic communication. "
                "In your next turn, acknowledge the patient concern, reflect it back, and offer a collaborative next step."
            )
        }
        evaluation["feedback"] = {
            "strengths": ["You initiated the interaction, which keeps the conversation open."],
            "improvement_suggestions": [
                "Write 2-3 sentences that include one reflective statement and one clarifying question.",
                "Confirm the patient's main concern before proposing a plan."
            ],
            "forward_target": "really_listening"
        }
        evaluation["evaluation_tool"] = "CARE"

    evaluation["evaluation_method"] = "Rule-based fallback"
    evaluation["judge_model"] = bedrock_client.get("model_id", "unknown")
    evaluation["fallback_reason"] = "short_or_tooluse_invalid_sequence"
    evaluation["transcript_chars"] = len((transcript or "").strip())
    return evaluation


def _collect_text_fragments(value) -> list:
    fragments = []
    if isinstance(value, str):
        fragments.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            fragments.extend(_collect_text_fragments(v))
    elif isinstance(value, list):
        for v in value:
            fragments.extend(_collect_text_fragments(v))
    return fragments


def _grounding_issue(evaluation: dict, transcript: str):
    transcript_lower = (transcript or "").lower()
    eval_text = "\n".join(_collect_text_fragments(evaluation)).lower()

    # Claims like "nodding" are impossible unless explicitly present in transcript text.
    nonverbal_terms = [
        "nodding", "nod", "eye contact", "body language", "facial expression",
        "tone of voice", "looked", "smiled", "gestured", "posture"
    ]
    for term in nonverbal_terms:
        if term in eval_text and term not in transcript_lower:
            return f"unsupported nonverbal claim: '{term}'"

    # Detect invented names such as "Matthew's concerns" when name is absent from transcript.
    allowed_names = {"you", SIMULATED_ROLE.lower(), PRACTITIONER_ROLE.lower(), "ai", "student", "care"}
    for match in re.finditer(r"\b([A-Z][a-z]{2,})'s\b", "\n".join(_collect_text_fragments(evaluation))):
        name = match.group(1)
        if name.lower() not in allowed_names and name.lower() not in transcript_lower:
            return f"invented name not in transcript: '{name}'"

    return None


def _apply_grounded_text_fallback(evaluation: dict, tool: str = "CARE"):
    """If model output still contains unsupported claims, replace narrative text with safe grounded text."""
    fallback_line = "Assessment grounded only in provided transcript text. No explicit additional evidence is present."
    reasoning = evaluation.get("judge_reasoning") or {}
    if tool == "NURSE":
        keys = NURSE_JUSTIFICATION_KEYS
    elif tool == "PRISM":
        keys = PRISM_JUSTIFICATION_KEYS
    else:
        keys = CARE_JUSTIFICATION_KEYS
    for key in keys:
        reasoning[key] = fallback_line
    reasoning["overall_assessment"] = (
        "Your coaching summary is limited to the transcript provided. "
        "Focus on explicit reflective responses and collaborative planning in your next message."
    )
    evaluation["judge_reasoning"] = reasoning

    feedback = evaluation.get("feedback") or {}
    feedback["strengths"] = [f"You acknowledged the {SIMULATED_ROLE} and invited them to continue sharing."]
    if tool == "NURSE":
        feedback["missed_opportunities"] = [
            f"Name the {SIMULATED_ROLE}'s emotion explicitly and use open questions to deepen understanding."
        ]
        feedback.pop("improvement_suggestions", None)
        feedback.pop("forward_target", None)
        feedback["role_modelled_response"] = ""
        feedback["behaviour_goal"] = "Name the patient emotion explicitly in your next response"
    else:
        feedback["improvement_suggestions"] = [
            f"Use explicit reflective phrases tied to the {SIMULATED_ROLE}'s exact words, then propose one collaborative next step."
        ]
        feedback["forward_target"] = "Collaborative planning with explicit transcript-grounded reflections"
    evaluation["feedback"] = feedback


def evaluate_empathy(student_response: str, patient_context: str, bedrock_client, simulation_group_id: str = None, schema_variant: str = None) -> dict:
    """
    LLM-as-a-Judge empathy evaluation using structured scoring methodology with prompt caching.
    """
    logger.info("🧠 EMPATHY EVALUATION STARTED")

    # Get the empathy prompt - static part for caching (from DB or default)
    try:
        static_system_prompt = get_empathy_prompt(simulation_group_id=simulation_group_id)
        logger.info(f"🎯 EMPATHY PROMPT LENGTH: {len(static_system_prompt)} characters")
        # Oversized admin prompts can increase latency significantly; fall back to default prompt.
        if len(static_system_prompt) > MAX_SYSTEM_PROMPT_CHARS:
            logger.warning(
                f"⚠️ Empathy prompt too long ({len(static_system_prompt)} chars), using default prompt"
            )
            static_system_prompt = get_default_empathy_prompt()
    except Exception as prompt_error:
        logger.error(f"EMPATHY PROMPT ERROR: {prompt_error}, using default")
        static_system_prompt = get_default_empathy_prompt()

    # Keep cacheable text in system prompt; keep dynamic prompt focused on request-specific context.
    cached_system_prompt = f"{static_system_prompt}\n\n{STATIC_GROUNDING_INSTRUCTIONS}"
    dynamic_user_prompt = f"""PATIENT_CONTEXT:
{patient_context}

TRANSCRIPT_START
{student_response}
TRANSCRIPT_END"""

    system_hash = hashlib.sha256(cached_system_prompt.encode("utf-8")).hexdigest()[:12]
    dynamic_hash = hashlib.sha256(dynamic_user_prompt.encode("utf-8")).hexdigest()[:12]
    logger.info(
        f"✅ Using prompt caching - Cached system: {len(cached_system_prompt)} chars, Dynamic: {len(dynamic_user_prompt)} chars"
    )
    logger.info(f"🧩 Prompt hashes - system={system_hash}, dynamic={dynamic_hash}")

    if DEBUG_LOG_FULL_PROMPTS:
        logger.info(f"📋 PATIENT CONTEXT:\n{patient_context}")
        logger.info(f"📋 SYSTEM PROMPT:\n{cached_system_prompt}")
        logger.info(f"📋 USER PROMPT:\n{dynamic_user_prompt}")

    # CRITICAL VALIDATION: Ensure the user text is included
    if student_response not in dynamic_user_prompt:
        logger.error(f"❌ USER TEXT NOT FOUND IN DYNAMIC PROMPT - This will cause hallucination!")
        return None

    care_tool_spec = get_care_tool_spec(schema_variant or EMPATHY_TOOL_SCHEMA_VARIANT)
    care_tool_name = get_care_tool_name(schema_variant or EMPATHY_TOOL_SCHEMA_VARIANT)

    strict_retry_addendum = """

STRICT RETRY MODE:
- TEXT-ONLY CHANNEL: do NOT mention nodding, eye contact, body language, facial expressions, or tone unless explicitly written in transcript.
- Do NOT introduce names unless they appear verbatim in transcript.
- If uncertain, state evidence is not present.
"""

    try:
        for attempt in range(MAX_GROUNDING_RETRIES + 1):
            prompt_for_attempt = dynamic_user_prompt + (strict_retry_addendum if attempt > 0 else "")
            body = {
                "system": [
                    {
                        "text": cached_system_prompt,
                        "cachePoint": {
                            "type": "default"
                        }
                    }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "text": prompt_for_attempt
                            }
                        ]
                    }
                ],
                "toolConfig": {
                    "tools": [care_tool_spec],
                    "toolChoice": {"tool": {"name": care_tool_name}},
                },
                "inferenceConfig": {
                    "temperature": 0.1,
                    "maxTokens": EMPATHY_MAX_OUTPUT_TOKENS
                }
            }

            logger.info(f"🚀 CALLING BEDROCK MODEL: {bedrock_client['model_id']} (attempt {attempt + 1})")
            try:
                response = bedrock_client["client"].invoke_model(
                    modelId="amazon.nova-lite-v1:0",
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(body)
                )
                logger.info("✅ BEDROCK MODEL CALL SUCCESSFUL")
            except Exception as model_error:
                if _is_tooluse_sequence_error(model_error):
                    logger.warning("ToolUse invalid-sequence error detected; returning no-evidence fallback")
                    return _build_no_evidence_evaluation("CARE", student_response, bedrock_client)

                logger.warning(f"Nova Lite failed in deployment region, trying us-east-1: {model_error}")
                try:
                    fallback_client = boto3.client("bedrock-runtime", region_name="us-east-1")
                    response = fallback_client.invoke_model(
                        modelId="amazon.nova-lite-v1:0",
                        contentType="application/json",
                        accept="application/json",
                        body=json.dumps(body)
                    )
                    logger.info("✅ BEDROCK FALLBACK CALL SUCCESSFUL")
                except Exception as fallback_error:
                    if _is_tooluse_sequence_error(fallback_error):
                        logger.warning("ToolUse invalid-sequence error in fallback region; returning no-evidence fallback")
                        return _build_no_evidence_evaluation("CARE", student_response, bedrock_client)
                    raise

            result = json.loads(response["body"].read())

            # Log cache usage
            usage = result.get("usage", {})

            logger.info(f"FULL USAGE OBJECT: {usage}")

            cache_read = usage.get('cacheReadInputTokenCount', 0)
            cache_write = usage.get('cacheWriteInputTokenCount', 0)

            if cache_read > 0:
                logger.info(f"✅ CACHE HIT! Read {cache_read} tokens from cache")
            elif cache_write > 0:
                logger.info(f"📝 CACHE MISS! Wrote {cache_write} tokens to cache")

            logger.info(f"CACHE STATS: Read = {cache_read}, Write = {cache_write}")

            # Extract structured output from tool use response
            content_blocks = result.get("output", {}).get("message", {}).get("content", [])
            evaluation = None
            for block in content_blocks:
                tool_use = block.get("toolUse", {})
                if tool_use.get("name") == care_tool_name:
                    evaluation = tool_use.get("input", {})
                    break

            if not evaluation:
                logger.error(f"❌ NO TOOL USE BLOCK IN RESPONSE: {json.dumps(result)[:400]}")
                if attempt >= MAX_GROUNDING_RETRIES:
                    return _build_no_evidence_evaluation("CARE", student_response, bedrock_client)
                continue

            logger.info(f"✅ STRUCTURED OUTPUT RECEIVED - Keys: {list(evaluation.keys())}")

            # Coerce each criterion to 1-5 scale
            for key in CARE_CRITERIA:
                val = evaluation.get(key)
                if isinstance(val, str):
                    try:
                        score = int(val)
                        evaluation[key] = max(1, min(5, score))  # Clamp to 1-5
                    except (ValueError, TypeError):
                        evaluation[key] = 3  # Default to midpoint if invalid
                elif isinstance(val, int):
                    evaluation[key] = max(1, min(5, val))  # Clamp to 1-5
                else:
                    evaluation[key] = 3  # Default to midpoint if missing

            issue = _grounding_issue(evaluation, student_response)
            if issue and attempt < MAX_GROUNDING_RETRIES:
                logger.warning(f"⚠️ Grounding issue detected ({issue}); retrying with strict prompt")
                continue

            if issue and attempt >= MAX_GROUNDING_RETRIES:
                logger.error(f"❌ Grounding issue persists after retry ({issue}); applying safe fallback text")
                _apply_grounded_text_fallback(evaluation, tool="CARE")

            evaluation["evaluation_method"] = "LLM-as-a-Judge"
            evaluation["evaluation_tool"] = "CARE"
            evaluation["judge_model"] = bedrock_client["model_id"]
            logger.info(f"✅ EMPATHY EVALUATION COMPLETED SUCCESSFULLY")
            return evaluation

    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON DECODE ERROR: {e}")
        logger.error(f"❌ RESPONSE TEXT: {response_text[:200] if 'response_text' in locals() else 'N/A'}")
        return None

    except Exception as e:
        logger.error(f"❌ EMPATHY EVALUATION ERROR: {e}")
        logger.exception("Full traceback:")
        return None

def evaluate_empathy_prism(student_response: str, patient_context: str, bedrock_client, simulation_group_id: str = None, schema_variant: str = None) -> dict:
    """
    LLM-as-a-Judge empathy evaluation using the PRISM framework (SDT-informed).
    Five dimensions: Prepare, Recognise, Interact, Self-Assess, Master — each 1-5.
    """
    logger.info("🧠 PRISM EMPATHY EVALUATION STARTED")

    try:
        static_system_prompt = get_empathy_prompt(simulation_group_id=simulation_group_id)
        if len(static_system_prompt) > MAX_SYSTEM_PROMPT_CHARS:
            logger.warning(f"⚠️ Empathy prompt too long ({len(static_system_prompt)} chars), using default")
            static_system_prompt = get_default_empathy_prompt()
    except Exception as prompt_error:
        logger.error(f"EMPATHY PROMPT ERROR: {prompt_error}, using default")
        static_system_prompt = get_default_empathy_prompt()

    cached_system_prompt = f"{static_system_prompt}\n\n{STATIC_GROUNDING_INSTRUCTIONS}"
    dynamic_user_prompt = f"""PATIENT_CONTEXT:
{patient_context}

TRANSCRIPT_START
{student_response}
TRANSCRIPT_END"""

    if student_response not in dynamic_user_prompt:
        logger.error("❌ USER TEXT NOT FOUND IN DYNAMIC PROMPT")
        return None

    prism_tool_spec = get_prism_tool_spec(schema_variant or EMPATHY_TOOL_SCHEMA_VARIANT)
    prism_tool_name = get_prism_tool_name(schema_variant or EMPATHY_TOOL_SCHEMA_VARIANT)

    strict_retry_addendum = """

STRICT RETRY MODE:
- TEXT-ONLY CHANNEL: do NOT mention nodding, eye contact, body language, facial expressions, or tone unless explicitly written in transcript.
- Do NOT introduce names unless they appear verbatim in transcript.
- If uncertain, state evidence is not present.
"""

    try:
        for attempt in range(MAX_GROUNDING_RETRIES + 1):
            prompt_for_attempt = dynamic_user_prompt + (strict_retry_addendum if attempt > 0 else "")
            body = {
                "system": [{"text": cached_system_prompt, "cachePoint": {"type": "default"}}],
                "messages": [{"role": "user", "content": [{"text": prompt_for_attempt}]}],
                "toolConfig": {
                    "tools": [prism_tool_spec],
                    "toolChoice": {"tool": {"name": prism_tool_name}},
                },
                "inferenceConfig": {"temperature": 0.1, "maxTokens": EMPATHY_MAX_OUTPUT_TOKENS}
            }

            logger.info(f"🚀 CALLING BEDROCK (PRISM): {bedrock_client['model_id']} (attempt {attempt + 1})")
            try:
                response = bedrock_client["client"].invoke_model(
                    modelId="amazon.nova-lite-v1:0",
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(body)
                )
            except Exception as model_error:
                if _is_tooluse_sequence_error(model_error):
                    logger.warning("PRISM ToolUse invalid-sequence error detected; returning no-evidence fallback")
                    return _build_no_evidence_evaluation("PRISM", student_response, bedrock_client)

                logger.warning(f"Nova Lite failed, trying us-east-1: {model_error}")
                try:
                    fallback_client = boto3.client("bedrock-runtime", region_name="us-east-1")
                    response = fallback_client.invoke_model(
                        modelId="amazon.nova-lite-v1:0",
                        contentType="application/json",
                        accept="application/json",
                        body=json.dumps(body)
                    )
                except Exception as fallback_error:
                    if _is_tooluse_sequence_error(fallback_error):
                        logger.warning("PRISM ToolUse invalid-sequence error in fallback region; returning no-evidence fallback")
                        return _build_no_evidence_evaluation("PRISM", student_response, bedrock_client)
                    raise

            result = json.loads(response["body"].read())
            usage = result.get("usage", {})
            cache_read = usage.get('cacheReadInputTokenCount', 0)
            cache_write = usage.get('cacheWriteInputTokenCount', 0)
            logger.info(f"PRISM CACHE STATS: Read={cache_read}, Write={cache_write}")

            content_blocks = result.get("output", {}).get("message", {}).get("content", [])
            evaluation = None
            for block in content_blocks:
                tool_use = block.get("toolUse", {})
                if tool_use.get("name") == prism_tool_name:
                    evaluation = tool_use.get("input", {})
                    break

            if not evaluation:
                logger.error(f"❌ NO PRISM TOOL USE BLOCK IN RESPONSE: {json.dumps(result)[:400]}")
                if attempt >= MAX_GROUNDING_RETRIES:
                    return _build_no_evidence_evaluation("PRISM", student_response, bedrock_client)
                continue

            for key in PRISM_CRITERIA:
                val = evaluation.get(key)
                if isinstance(val, str):
                    try:
                        evaluation[key] = max(1, min(5, int(val)))
                    except (ValueError, TypeError):
                        evaluation[key] = 3
                elif isinstance(val, int):
                    evaluation[key] = max(1, min(5, val))
                else:
                    evaluation[key] = 3

            issue = _grounding_issue(evaluation, student_response)
            if issue and attempt < MAX_GROUNDING_RETRIES:
                logger.warning(f"⚠️ PRISM grounding issue ({issue}); retrying")
                continue

            if issue and attempt >= MAX_GROUNDING_RETRIES:
                logger.error(f"❌ PRISM grounding issue persists; applying safe fallback")
                _apply_grounded_text_fallback(evaluation, tool="PRISM")

            evaluation["evaluation_method"] = "LLM-as-a-Judge"
            evaluation["evaluation_tool"] = "PRISM"
            evaluation["judge_model"] = bedrock_client["model_id"]
            logger.info("✅ PRISM EVALUATION COMPLETED SUCCESSFULLY")
            return evaluation

    except json.JSONDecodeError as e:
        logger.error(f"❌ PRISM JSON DECODE ERROR: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ PRISM EVALUATION ERROR: {e}")
        logger.exception("Full traceback:")
        return None


def evaluate_empathy_nurse(student_response: str, patient_context: str, bedrock_client, simulation_group_id: str = None, schema_variant: str = None) -> dict:
    """
    LLM-as-a-Judge empathy evaluation using the NURSE framework.
    Five domains: Name, Understand, Respect, Support, Explore — each scored 1–4.
    """
    logger.info("🧠 NURSE EMPATHY EVALUATION STARTED")

    try:
        static_system_prompt = get_empathy_prompt(simulation_group_id=simulation_group_id)
        if len(static_system_prompt) > MAX_SYSTEM_PROMPT_CHARS:
            logger.warning(f"⚠️ Empathy prompt too long ({len(static_system_prompt)} chars), using default")
            static_system_prompt = get_default_empathy_prompt()
    except Exception as prompt_error:
        logger.error(f"EMPATHY PROMPT ERROR: {prompt_error}, using default")
        static_system_prompt = get_default_empathy_prompt()

    cached_system_prompt = f"{static_system_prompt}\n\n{STATIC_GROUNDING_INSTRUCTIONS}"
    dynamic_user_prompt = f"""PATIENT_CONTEXT:
{patient_context}

TRANSCRIPT_START
{student_response}
TRANSCRIPT_END"""

    if student_response not in dynamic_user_prompt:
        logger.error("❌ USER TEXT NOT FOUND IN DYNAMIC PROMPT")
        return None

    _variant = schema_variant or EMPATHY_TOOL_SCHEMA_VARIANT
    nurse_tool_spec = get_nurse_tool_spec(_variant)
    nurse_tool_name = get_nurse_tool_name(_variant)

    strict_retry_addendum = """

STRICT RETRY MODE:
- TEXT-ONLY CHANNEL: do NOT mention nodding, eye contact, body language, facial expressions, or tone unless explicitly written in transcript.
- Do NOT introduce names unless they appear verbatim in transcript.
- If uncertain, state evidence is not present.
"""

    try:
        for attempt in range(MAX_GROUNDING_RETRIES + 1):
            prompt_for_attempt = dynamic_user_prompt + (strict_retry_addendum if attempt > 0 else "")
            body = {
                "system": [{"text": cached_system_prompt, "cachePoint": {"type": "default"}}],
                "messages": [{"role": "user", "content": [{"text": prompt_for_attempt}]}],
                "toolConfig": {
                    "tools": [nurse_tool_spec],
                    "toolChoice": {"tool": {"name": nurse_tool_name}},
                },
                "inferenceConfig": {"temperature": 0.1, "maxTokens": EMPATHY_MAX_OUTPUT_TOKENS}
            }

            logger.info(f"🚀 CALLING BEDROCK (NURSE): {bedrock_client['model_id']} (attempt {attempt + 1})")
            try:
                response = bedrock_client["client"].invoke_model(
                    modelId="amazon.nova-lite-v1:0",
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(body)
                )
            except Exception as model_error:
                if _is_tooluse_sequence_error(model_error):
                    logger.warning("NURSE ToolUse invalid-sequence error detected; returning no-evidence fallback")
                    return _build_no_evidence_evaluation("NURSE", student_response, bedrock_client)

                logger.warning(f"Nova Lite failed, trying us-east-1: {model_error}")
                try:
                    fallback_client = boto3.client("bedrock-runtime", region_name="us-east-1")
                    response = fallback_client.invoke_model(
                        modelId="amazon.nova-lite-v1:0",
                        contentType="application/json",
                        accept="application/json",
                        body=json.dumps(body)
                    )
                except Exception as fallback_error:
                    if _is_tooluse_sequence_error(fallback_error):
                        logger.warning("NURSE ToolUse invalid-sequence error in fallback region; returning no-evidence fallback")
                        return _build_no_evidence_evaluation("NURSE", student_response, bedrock_client)
                    raise

            result = json.loads(response["body"].read())
            usage = result.get("usage", {})
            cache_read = usage.get("cacheReadInputTokenCount", 0)
            cache_write = usage.get("cacheWriteInputTokenCount", 0)
            logger.info(f"NURSE CACHE STATS: Read={cache_read}, Write={cache_write}")

            content_blocks = result.get("output", {}).get("message", {}).get("content", [])
            evaluation = None
            for block in content_blocks:
                tool_use = block.get("toolUse", {})
                if tool_use.get("name") == nurse_tool_name:
                    evaluation = tool_use.get("input", {})
                    break

            if not evaluation:
                logger.error(f"❌ NO NURSE TOOL USE BLOCK IN RESPONSE: {json.dumps(result)[:400]}")
                if attempt >= MAX_GROUNDING_RETRIES:
                    return _build_no_evidence_evaluation("NURSE", student_response, bedrock_client)
                continue

            for key in NURSE_CRITERIA:
                val = evaluation.get(key)
                if isinstance(val, str):
                    try:
                        evaluation[key] = max(1, min(4, int(val)))
                    except (ValueError, TypeError):
                        evaluation[key] = 2
                elif isinstance(val, int):
                    evaluation[key] = max(1, min(4, val))
                else:
                    evaluation[key] = 2

            issue = _grounding_issue(evaluation, student_response)
            if issue and attempt < MAX_GROUNDING_RETRIES:
                logger.warning(f"⚠️ NURSE grounding issue ({issue}); retrying")
                continue

            if issue and attempt >= MAX_GROUNDING_RETRIES:
                logger.error(f"❌ NURSE grounding issue persists; applying safe fallback")
                _apply_grounded_text_fallback(evaluation, tool="NURSE")

            evaluation["evaluation_method"] = "LLM-as-a-Judge"
            evaluation["evaluation_tool"] = "NURSE"
            evaluation["judge_model"] = bedrock_client["model_id"]
            logger.info("✅ NURSE EVALUATION COMPLETED SUCCESSFULLY")
            return evaluation

    except json.JSONDecodeError as e:
        logger.error(f"❌ NURSE JSON DECODE ERROR: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ NURSE EVALUATION ERROR: {e}")
        logger.exception("Full traceback:")
        return None


def build_nurse_feedback(evaluation) -> str:
    """Build empathy feedback using the NURSE framework (1–4 scale)."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    scores = {key: evaluation.get(key, 2) for key in NURSE_CRITERIA}
    avg_score = sum(scores.values()) / len(NURSE_CRITERIA)
    high_performers = [label for key, label in NURSE_CRITERIA_LABELS.items() if scores.get(key, 0) >= 3]
    growth_areas = [label for key, label in NURSE_CRITERIA_LABELS.items() if scores.get(key, 0) <= 1]

    feedback = f"**Empathy Coach (NURSE Framework - 1-4 Scale):**\\\\n\\\\n"
    feedback += f"**Overall Score: {avg_score:.1f} / 4.0**\\\\n\\\\n"

    if high_performers:
        feedback += "**Strengths (scoring 3-4):**\\\\n"
        for label in high_performers:
            feedback += f"• ✅ {label}\\\\n"
        feedback += "\\\\n"

    if growth_areas:
        feedback += "**Areas for Growth (scoring 1):**\\\\n"
        for label in growth_areas:
            feedback += f"• 📈 {label}\\\\n"
        feedback += "\\\\n"

    judge_reasoning = evaluation.get("judge_reasoning", {})
    if judge_reasoning.get("overall_assessment"):
        assessment = judge_reasoning["overall_assessment"]
        assessment = assessment.replace("The student", "You").replace("the student", "you")
        feedback += f"**Comprehensive Coach Assessment:**\\\\n\\\\n{assessment}\\\\n\\\\n"

    eval_feedback = evaluation.get("feedback", {}) or {}
    strengths = eval_feedback.get("strengths", [])
    if strengths:
        feedback += "**What Worked Well:**\\\\n\\\\n"
        for i, s in enumerate(strengths, 1):
            feedback += f"{i}. {s}\\\\n\\\\n"
        feedback += "\\\\n"

    missed = eval_feedback.get("missed_opportunities", [])
    if missed:
        feedback += "**Missed Opportunities:**\\\\n\\\\n"
        for i, s in enumerate(missed, 1):
            feedback += f"{i}. {s}\\\\n\\\\n"
        feedback += "\\\\n"

    role_modelled = eval_feedback.get("role_modelled_response", "")
    if role_modelled:
        feedback += f"**Example Response:**\\\\n{role_modelled}\\\\n\\\\n"

    behaviour_goal = eval_feedback.get("behaviour_goal", "")
    if behaviour_goal:
        feedback += f"Focus for Your Next Interaction: {behaviour_goal}\\\\n\\\\n"

    feedback += "---\\\\n\\\\n"
    return feedback


def build_prism_feedback(evaluation) -> str:
    """Build empathy feedback using the PRISM framework (SDT-informed, 1-5 scale)."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    scores = {key: evaluation.get(key, 3) for key in PRISM_CRITERIA}
    avg_score = sum(scores.values()) / len(PRISM_CRITERIA)
    high_performers = [label for key, label in PRISM_CRITERIA_LABELS.items() if scores.get(key, 0) >= 4]
    growth_areas = [label for key, label in PRISM_CRITERIA_LABELS.items() if scores.get(key, 0) <= 2]

    feedback = f"**Empathy Coach (PRISM Framework - 1-5 Scale):**\\\\n\\\\n"
    feedback += f"**Overall Score: {avg_score:.1f} / 5.0**\\\\n\\\\n"

    if high_performers:
        feedback += "**Strengths (scoring 4-5):**\\\\n"
        for label in high_performers:
            feedback += f"• ✅ {label}\\\\n"
        feedback += "\\\\n"

    if growth_areas:
        feedback += "**Areas for Growth (scoring 1-2):**\\\\n"
        for label in growth_areas:
            feedback += f"• 📈 {label}\\\\n"
        feedback += "\\\\n"

    judge_reasoning = evaluation.get('judge_reasoning', {})
    if judge_reasoning.get('overall_assessment'):
        assessment = judge_reasoning['overall_assessment']
        assessment = assessment.replace("The student", "You").replace("the student", "you")
        feedback += f"**Comprehensive Coach Assessment:**\\\\n\\\\n{assessment}\\\\n\\\\n"

    eval_feedback = evaluation.get('feedback', {}) or {}
    strengths = eval_feedback.get('strengths', [])
    if strengths:
        feedback += "**What Worked Well:**\\\\n\\\\n"
        for i, s in enumerate(strengths, 1):
            feedback += f"{i}. {s}\\\\n\\\\n"
        feedback += "\\\\n"

    suggestions = eval_feedback.get('improvement_suggestions', [])
    if suggestions:
        feedback += "**Opportunities to Develop:**\\\\n\\\\n"
        for i, s in enumerate(suggestions, 1):
            feedback += f"{i}. {s}\\\\n\\\\n"
        feedback += "\\\\n"

    forward_target = eval_feedback.get('forward_target', '')
    if forward_target:
        feedback += f"Focus for Your Next Interaction: {forward_target}\\\\n\\\\n"

    feedback += "---\\\\n\\\\n"
    return feedback


def build_empathy_feedback(evaluation):
    """Build empathy feedback using CARE 1-5 scale criteria for thread-level evaluation."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    scores = {key: evaluation.get(key, 3) for key in CARE_CRITERIA}
    avg_score = sum(scores.values()) / len(CARE_CRITERIA)
    high_performers = [label for key, label in CARE_CRITERIA_LABELS.items() if scores.get(key, 0) >= 4]
    growth_areas = [label for key, label in CARE_CRITERIA_LABELS.items() if scores.get(key, 0) <= 2]

    empathy_feedback = f"**Empathy Coach (CARE Measure - 1-5 Scale):**\\\\n\\\\n"
    empathy_feedback += f"**Overall Score: {avg_score:.1f} / 5.0**\\\\n\\\\n"

    if high_performers:
        empathy_feedback += f"**Strengths (scoring 4-5):**\\\\n"
        for label in high_performers:
            empathy_feedback += f"• ✅ {label}\\\\n"
        empathy_feedback += "\\\\n"

    if growth_areas:
        empathy_feedback += f"**Areas for Growth (scoring 1-2):**\\\\n"
        for label in growth_areas:
            empathy_feedback += f"• 📈 {label}\\\\n"
        empathy_feedback += "\\\\n"

    judge_reasoning = evaluation.get('judge_reasoning', {})
    if judge_reasoning.get('overall_assessment'):
        assessment = judge_reasoning['overall_assessment']
        assessment = assessment.replace("The student", "You").replace("the student", "you")
        empathy_feedback += f"**Comprehensive Coach Assessment:**\\\\n\\\\n{assessment}\\\\n\\\\n"

    feedback = evaluation.get('feedback', {}) or {}
    strengths = feedback.get('strengths', [])
    if strengths:
        empathy_feedback += f"**What Worked Well:**\\\\n\\\\n"
        for i, s in enumerate(strengths, 1):
            empathy_feedback += f"{i}. {s}\\\\n\\\\n"
        empathy_feedback += "\\\\n"

    suggestions = feedback.get('improvement_suggestions', [])
    if suggestions:
        empathy_feedback += f"**Opportunities to Develop:**\\\\n\\\\n"
        for i, s in enumerate(suggestions, 1):
            empathy_feedback += f"{i}. {s}\\\\n\\\\n"
        empathy_feedback += "\\\\n"

    forward_target = feedback.get('forward_target', '')
    if forward_target:
        empathy_feedback += f"Focus for Your Next Interaction: {forward_target}\\\\n\\\\n"

    empathy_feedback += "---\\\\n\\\\n"
    return empathy_feedback

def handle_empathy_evaluation(
    session_id: str,
    patient_id: str,
    message_content: str,
    bedrock_client,
    patient_prompt: str = "",
    message_id: str = None,
    empathy_tool: str = "CARE",
    simulation_group_id: str = None,
) -> dict:
    """
    Handle the empathy evaluation endpoint.
    Retrieves conversation history and evaluates empathy for the specified message.
    If message_id is provided, the result is also persisted to that message row in the DB.
    """
    # Late imports to avoid circular dependency
    from .conversation import get_conversation_history, build_conversation_context, update_message_empathy

    logger.info(f"🧠 EMPATHY EVALUATION ENDPOINT CALLED for session: {session_id}")

    try:
        # Get conversation history
        messages = get_conversation_history(session_id)

        if not messages:
            logger.warning(f"⚠️ No conversation history found for session {session_id}")
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "No conversation history found for this session"})
            }

        # Build conversation context, filtering out:
        # - SESSION COMPLETED signals from AI messages
        # - The initial kick-off prompt ("Begin the conversation as the ...") which is a
        #   system-generated trigger, not a real practitioner utterance to score.
        def _is_scoreable(msg):
            content = msg.get("message_content", "")
            if msg.get("student_sent") and content.strip().startswith("Begin the conversation as the"):
                return False
            if not msg.get("student_sent") and "SESSION COMPLETED" in content:
                return False
            return True

        context_messages = [msg for msg in messages if _is_scoreable(msg)]

        # If message_id is provided, scope context to messages up to and including that row.
        scoped_messages = context_messages
        if message_id:
            target_index = next(
                (i for i, msg in enumerate(context_messages) if str(msg.get("message_id")) == str(message_id)),
                -1,
            )
            if target_index >= 0:
                scoped_messages = context_messages[:target_index + 1]
                logger.info(
                    f"🧭 Scoped empathy context to {len(scoped_messages)} messages up to message_id={message_id}"
                )
            else:
                logger.warning(
                    f"⚠️ message_id {message_id} not found in session history; using full filtered history"
                )

        eval_messages = scoped_messages
        if USE_THREAD_UP_TO_MESSAGE_ID_FOR_EVAL and message_id and len(scoped_messages) > MAX_THREAD_MESSAGES_FOR_EVAL:
            eval_messages = scoped_messages[-MAX_THREAD_MESSAGES_FOR_EVAL:]
            logger.info(
                f"🧵 Trimmed scoped messages from {len(scoped_messages)} to {len(eval_messages)} for empathy evaluation"
            )

        conversation_context = build_conversation_context(eval_messages)

        # If no specific message provided, use the latest student message
        if not message_content:
            if message_id:
                target_message = next(
                    (msg for msg in scoped_messages if str(msg.get("message_id")) == str(message_id)),
                    None,
                )
                if target_message and target_message.get("student_sent"):
                    message_content = target_message.get("message_content", "")
                    logger.info(f"📝 Using student message from message_id: {message_content[:100]}...")

            if not message_content:
                for msg in reversed(scoped_messages):
                    if msg.get("student_sent"):
                        message_content = msg.get("message_content", "")
                        logger.info(f"📝 Using latest student message: {message_content[:100]}...")
                        break

        if not message_content:
            logger.error("❌ No student message found to evaluate")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No student message found to evaluate"})
            }

        if message_content.strip().startswith("Begin the conversation as the"):
            logger.info("⏭️ Skipping empathy evaluation — message is the initial conversation trigger")
            return {
                "statusCode": 200,
                "body": json.dumps({"skipped": True, "reason": "Initial trigger message is not scored"})
            }

        # Keep patient context compact; transcript is passed separately as evaluation_input.
        compact_patient_prompt = (patient_prompt or "").strip()
        if len(compact_patient_prompt) > MAX_PATIENT_CONTEXT_CHARS:
            compact_patient_prompt = compact_patient_prompt[:MAX_PATIENT_CONTEXT_CHARS]
            logger.info(f"✂️ Trimmed patient prompt context to {MAX_PATIENT_CONTEXT_CHARS} chars")

        patient_context = f"Additional patient context:\n{compact_patient_prompt}"

        evaluation_input = message_content
        if USE_THREAD_UP_TO_MESSAGE_ID_FOR_EVAL and message_id:
            evaluation_input = conversation_context.strip()
            logger.info(
                f"🧵 Using full scoped thread as empathy evaluation input (chars={len(evaluation_input)})"
            )

        if len(evaluation_input) > MAX_TRANSCRIPT_CHARS_FOR_EVAL:
            # Keep the most recent part of the thread (typically most relevant for scoring).
            evaluation_input = evaluation_input[-MAX_TRANSCRIPT_CHARS_FOR_EVAL:]
            logger.info(
                f"✂️ Trimmed transcript input to last {MAX_TRANSCRIPT_CHARS_FOR_EVAL} chars for latency control"
            )

        # Parse base tool and schema variant from the empathy_tool string.
        # e.g. "CARE_RELAXED" → base_tool="CARE", schema_variant="relaxed"
        _schema_variant = "relaxed" if empathy_tool.endswith("_RELAXED") else None
        _base_tool = empathy_tool[:-8] if empathy_tool.endswith("_RELAXED") else empathy_tool

        # Evaluate empathy for the message using the selected tool
        logger.info(f"🎯 Evaluating empathy ({empathy_tool}) for: {evaluation_input[:100]}...")
        if _base_tool == "NURSE":
            empathy_evaluation = evaluate_empathy_nurse(
                evaluation_input,
                patient_context,
                bedrock_client,
                simulation_group_id=simulation_group_id,
                schema_variant=_schema_variant,
            )
        elif _base_tool == "PRISM":
            empathy_evaluation = evaluate_empathy_prism(
                evaluation_input,
                patient_context,
                bedrock_client,
                simulation_group_id=simulation_group_id,
                schema_variant=_schema_variant,
            )
        else:
            empathy_evaluation = evaluate_empathy(
                evaluation_input,
                patient_context,
                bedrock_client,
                simulation_group_id=simulation_group_id,
                schema_variant=_schema_variant,
            )

        if not empathy_evaluation:
            logger.error("❌ Empathy evaluation failed")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to evaluate empathy"})
            }

        # Persist to DB: either to the specific message (text chat / backfill),
        # or to the most recent student message in the session (voice chat).
        if message_id:
            update_message_empathy(message_id, empathy_evaluation)
            logger.info(f"✅ Empathy evaluation saved for message {message_id}")
        else:
            # Voice mode: no message_id supplied — save to the latest student message
            # in the session so fetchEmpathySummary can find it later.
            latest_student = next(
                (msg for msg in reversed(scoped_messages) if msg.get("student_sent")),
                None,
            )
            if latest_student:
                latest_id = latest_student.get("message_id")
                update_message_empathy(latest_id, empathy_evaluation)
                logger.info(f"✅ Voice: empathy evaluation saved to latest student message {latest_id}")
            else:
                logger.warning("⚠️ Voice: no student message found in session to attach empathy evaluation")

        # Build feedback using the appropriate formatter
        if _base_tool == "NURSE":
            empathy_feedback = build_nurse_feedback(empathy_evaluation)
            criteria_hit = sum(empathy_evaluation.get(k, 0) for k in NURSE_CRITERIA)
            max_per_message = 20
        elif _base_tool == "PRISM":
            empathy_feedback = build_prism_feedback(empathy_evaluation)
            criteria_hit = sum(empathy_evaluation.get(k, 0) for k in PRISM_CRITERIA)
            max_per_message = 25
        else:
            empathy_feedback = build_empathy_feedback(empathy_evaluation)
            criteria_hit = sum(empathy_evaluation.get(k, 0) for k in CARE_CRITERIA)
            max_per_message = 50

        logger.info(f"✅ Empathy evaluation completed successfully (tool={empathy_tool})")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "empathy_evaluation": empathy_evaluation,
                "summary": {
                    "criteria_hit": criteria_hit,
                    "max_per_message": max_per_message
                },
                "empathy_feedback_markdown": empathy_feedback
            })
        }
    except Exception as e:
        logger.error(f"❌ Error in empathy evaluation handler: {e}")
        logger.exception("Full traceback:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
