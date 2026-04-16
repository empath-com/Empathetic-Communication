import boto3
import hashlib
import json
import logging
import re
from pydantic import BaseModel, Field

from .prompts import get_empathy_prompt, get_default_empathy_prompt

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

STATIC_GROUNDING_INSTRUCTIONS = """Grounding rules (mandatory):
- Evaluate ONLY using evidence in TRANSCRIPT.
- Do not invent quotes, symptoms, medications, events, names, or non-verbal cues.
- If evidence is missing for a criterion, state that explicitly in justification.
- Keep output concise: one short paragraph for overall assessment and 1-2 sentences per item.
"""


class LLM_evaluation(BaseModel):
    response: str = Field(description="Assessment of the student's answer with a follow-up question.")
    verdict: str = Field(description="'True' if the student has properly diagnosed the patient, 'False' otherwise.")


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
    allowed_names = {"you", "patient", "pharmacist", "ai", "student", "care"}
    for match in re.finditer(r"\b([A-Z][a-z]{2,})'s\b", "\n".join(_collect_text_fragments(evaluation))):
        name = match.group(1)
        if name.lower() not in allowed_names and name.lower() not in transcript_lower:
            return f"invented name not in transcript: '{name}'"

    return None


def _apply_grounded_text_fallback(evaluation: dict):
    """If model output still contains unsupported claims, replace narrative text with safe grounded text."""
    fallback_line = "Assessment grounded only in provided transcript text. No explicit additional evidence is present."
    reasoning = evaluation.get("judge_reasoning") or {}
    for key in [
        "making_feel_at_ease_justification",
        "letting_tell_story_justification",
        "really_listening_justification",
        "interested_in_whole_person_justification",
        "understanding_concerns_justification",
        "showing_care_compassion_justification",
        "being_positive_justification",
        "explaining_clearly_justification",
        "helping_take_control_justification",
        "making_plan_of_action_justification",
    ]:
        reasoning[key] = fallback_line
    reasoning["overall_assessment"] = (
        "Your coaching summary is limited to the transcript provided. "
        "Focus on explicit reflective responses and collaborative planning in your next message."
    )
    evaluation["judge_reasoning"] = reasoning

    feedback = evaluation.get("feedback") or {}
    feedback["strengths"] = ["You acknowledged the patient and invited them to continue sharing."]
    feedback["improvement_suggestions"] = [
        "Use explicit reflective phrases tied to the patient's exact words, then propose one collaborative next step."
    ]
    feedback["forward_target"] = "Collaborative planning with explicit transcript-grounded reflections"
    evaluation["feedback"] = feedback


def evaluate_empathy(student_response: str, patient_context: str, bedrock_client) -> dict:
    """
    LLM-as-a-Judge empathy evaluation using structured scoring methodology with prompt caching.
    """
    logger.info("🧠 EMPATHY EVALUATION STARTED")

    # Get the empathy prompt - static part for caching (from DB or default)
    try:
        static_system_prompt = get_empathy_prompt()
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

    # Tool schema: 10 CARE criteria scored 1-5 scale.
    # Each criterion is scored 1-5: 1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced.
    # Scores reflect the entire conversation thread, not individual messages.
    # Shared justification instruction embedded in each field description.
    # Kept short to minimise schema token count (minLength/minItems not used — Nova Lite ignores them and can error).
    _J = "2-4 sentences. Quote or paraphrase transcript evidence. Explain the score. Do not merge with other criteria."
    empathy_tool = {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": (
                "Evaluate the pharmacist using 10 CARE criteria, each scored 1-5 "
                "(1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced). "
                "Populate every field. Do not omit, merge, or rename any field."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "making_feel_at_ease": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: warmth and comfort-building toward the patient."
                        },
                        "letting_tell_story": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: space given for patient self-expression."
                        },
                        "really_listening": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: active listening via paraphrasing, reflecting, engagement."
                        },
                        "interested_in_whole_person": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: curiosity about holistic patient context beyond symptoms."
                        },
                        "understanding_concerns": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: depth of understanding and validation of patient concerns."
                        },
                        "showing_care_compassion": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: genuine empathy and emotional support shown to patient."
                        },
                        "being_positive": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: encouraging, reassuring, non-judgmental tone."
                        },
                        "explaining_clearly": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: clarity of explanations in plain language."
                        },
                        "helping_take_control": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: patient empowerment and involvement in decisions."
                        },
                        "making_plan_of_action": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: collaborative planning and agreed next steps."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Separate justification for each criterion. Every field is required. Do not combine justifications.",
                            "properties": {
                                "making_feel_at_ease_justification":        {"type": "string", "description": _J},
                                "letting_tell_story_justification":         {"type": "string", "description": _J},
                                "really_listening_justification":           {"type": "string", "description": _J},
                                "interested_in_whole_person_justification": {"type": "string", "description": _J},
                                "understanding_concerns_justification":     {"type": "string", "description": _J},
                                "showing_care_compassion_justification":    {"type": "string", "description": _J},
                                "being_positive_justification":             {"type": "string", "description": _J},
                                "explaining_clearly_justification":         {"type": "string", "description": _J},
                                "helping_take_control_justification":       {"type": "string", "description": _J},
                                "making_plan_of_action_justification":      {"type": "string", "description": _J},
                                "overall_assessment": {
                                    "type": "string",
                                    "description": (
                                        "Brief coach summary using 'you'. "
                                        "Do not repeat individual justifications. "
                                        "Highlight the key pattern across the conversation."
                                    )
                                }
                            },
                            "required": [
                                "making_feel_at_ease_justification",
                                "letting_tell_story_justification",
                                "really_listening_justification",
                                "interested_in_whole_person_justification",
                                "understanding_concerns_justification",
                                "showing_care_compassion_justification",
                                "being_positive_justification",
                                "explaining_clearly_justification",
                                "helping_take_control_justification",
                                "making_plan_of_action_justification",
                                "overall_assessment"
                            ]
                        },
                        "feedback": {
                            "type": "object",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "1-2 specific strengths with transcript evidence.",
                                    "items": {"type": "string"}
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "1-2 actionable improvement suggestions with evidence-based rationale.",
                                    "items": {"type": "string"}
                                },
                                "forward_target": {
                                    "type": "string",
                                    "description": "The single CARE criterion or skill to focus on next."
                                }
                            },
                            "required": ["strengths", "improvement_suggestions", "forward_target"]
                        }
                    },
                    "required": [
                        "making_feel_at_ease",
                        "letting_tell_story",
                        "really_listening",
                        "interested_in_whole_person",
                        "understanding_concerns",
                        "showing_care_compassion",
                        "being_positive",
                        "explaining_clearly",
                        "helping_take_control",
                        "making_plan_of_action",
                        "judge_reasoning",
                        "feedback"
                    ]
                }
            }
        }
    }

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
                    "tools": [empathy_tool],
                    "toolChoice": {"tool": {"name": "submit_empathy_evaluation"}},
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
                logger.warning(f"Nova Lite failed in deployment region, trying us-east-1: {model_error}")
                fallback_client = boto3.client("bedrock-runtime", region_name="us-east-1")
                response = fallback_client.invoke_model(
                    modelId="amazon.nova-lite-v1:0",
                    contentType="application/json",
                    accept="application/json",
                    body=json.dumps(body)
                )
                logger.info("✅ BEDROCK FALLBACK CALL SUCCESSFUL")

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
                if tool_use.get("name") == "submit_empathy_evaluation":
                    evaluation = tool_use.get("input", {})
                    break

            if not evaluation:
                logger.error(f"❌ NO TOOL USE BLOCK IN RESPONSE: {json.dumps(result)[:400]}")
                if attempt >= MAX_GROUNDING_RETRIES:
                    return None
                continue

            logger.info(f"✅ STRUCTURED OUTPUT RECEIVED - Keys: {list(evaluation.keys())}")

            # Coerce each criterion to 1-5 scale
            criteria = [
                'making_feel_at_ease', 'letting_tell_story', 'really_listening',
                'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
                'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
            ]
            for key in criteria:
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
                _apply_grounded_text_fallback(evaluation)

            evaluation["evaluation_method"] = "LLM-as-a-Judge"
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

CARE_CRITERIA_LABELS = {
    'making_feel_at_ease':        '1. Making you feel at ease',
    'letting_tell_story':         '2. Letting you tell your story',
    'really_listening':           '3. Really listening',
    'interested_in_whole_person': '4. Being interested in you as a whole person',
    'understanding_concerns':     '5. Fully understanding your concerns',
    'showing_care_compassion':    '6. Showing care and compassion',
    'being_positive':             '7. Being positive',
    'explaining_clearly':         '8. Explaining things clearly',
    'helping_take_control':       '9. Helping you take control',
    'making_plan_of_action':      '10. Making a plan of action with you',
}


def build_empathy_feedback(evaluation):
    """Build empathy feedback using CARE 1-5 scale criteria for thread-level evaluation."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    criteria = [
        'making_feel_at_ease', 'letting_tell_story', 'really_listening',
        'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
        'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
    ]

    scores = {key: evaluation.get(key, 3) for key in criteria}
    avg_score = sum(scores.values()) / len(criteria) if criteria else 3
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
    message_id: str = None
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

        # Build conversation context, filtering out SESSION COMPLETED signals
        # so the empathy evaluator isn't confused by the session-end marker.
        context_messages = [
            msg for msg in messages
            if msg.get("student_sent") or "SESSION COMPLETED" not in msg.get("message_content", "")
        ]

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

        # Evaluate empathy for the message
        logger.info(f"🎯 Evaluating empathy for: {evaluation_input[:100]}...")
        empathy_evaluation = evaluate_empathy(evaluation_input, patient_context, bedrock_client)

        if not empathy_evaluation:
            logger.error("❌ Empathy evaluation failed")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to evaluate empathy"})
            }

        # Persist to DB if a specific message_id was supplied (backfill path)
        if message_id:
            update_message_empathy(message_id, empathy_evaluation)
            logger.info(f"✅ Backfill: empathy evaluation saved for message {message_id}")

        # Build feedback
        empathy_feedback = build_empathy_feedback(empathy_evaluation)

        logger.info(f"✅ Empathy evaluation completed successfully")

        criteria_hit = sum(
            empathy_evaluation.get(k, 0)
            for k in [
                'making_feel_at_ease', 'letting_tell_story', 'really_listening',
                'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
                'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
            ]
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "empathy_evaluation": empathy_evaluation,
                "summary": {
                    "criteria_hit": criteria_hit,
                    "max_per_message": 50
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
