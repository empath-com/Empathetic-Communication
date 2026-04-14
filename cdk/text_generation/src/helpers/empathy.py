import boto3
import json
import logging
from pydantic import BaseModel, Field

from .prompts import get_empathy_prompt, get_default_empathy_prompt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class LLM_evaluation(BaseModel):
    response: str = Field(description="Assessment of the student's answer with a follow-up question.")
    verdict: str = Field(description="'True' if the student has properly diagnosed the patient, 'False' otherwise.")


def evaluate_empathy(student_response: str, patient_context: str, bedrock_client) -> dict:
    """
    LLM-as-a-Judge empathy evaluation using structured scoring methodology with prompt caching.
    """
    logger.info("🧠 EMPATHY EVALUATION STARTED")

    # Get the empathy prompt - static part for caching (from DB or default)
    try:
        static_system_prompt = get_empathy_prompt()
        logger.info(f"🎯 EMPATHY PROMPT LENGTH: {len(static_system_prompt)} characters")
    except Exception as prompt_error:
        logger.error(f"EMPATHY PROMPT ERROR: {prompt_error}, using default")
        static_system_prompt = get_default_empathy_prompt()

    # Build dynamic user prompt with the specific case data
    dynamic_user_prompt = f"""patient_context: {patient_context}
user_text: {student_response}"""

    logger.info(f"✅ Using prompt caching - Static prompt: {len(static_system_prompt)} chars, Dynamic: {len(dynamic_user_prompt)} chars")

    # CRITICAL VALIDATION: Ensure the user text is included
    if student_response not in dynamic_user_prompt:
        logger.error(f"❌ USER TEXT NOT FOUND IN DYNAMIC PROMPT - This will cause hallucination!")
        return None

    # Tool schema: 10 binary CARE criteria.
    # Each criterion is 1 (clearly demonstrated in this message) or 0 (not demonstrated).
    # Scores are additive across all messages in a session — the summary shows totals per criterion.
    empathy_tool = {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": (
                "Evaluate a single pharmacist message using the 10 CARE Measure criteria. "
                "For each criterion set 1 if it is clearly demonstrated in this specific message, "
                "or 0 if it is not. Not all criteria will apply to every message — that is expected."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "making_feel_at_ease": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist made the patient feel comfortable and at ease."
                        },
                        "letting_tell_story": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist gave the patient space to explain themselves without interruption."
                        },
                        "really_listening": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist demonstrated active listening (paraphrasing, reflecting, following up on what was said)."
                        },
                        "interested_in_whole_person": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist showed interest in the patient as a whole person, not just their medication or symptoms."
                        },
                        "understanding_concerns": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist demonstrated they fully understood the patient's concerns."
                        },
                        "showing_care_compassion": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist showed genuine care and compassion toward the patient."
                        },
                        "being_positive": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist maintained a positive, encouraging, and non-judgmental tone."
                        },
                        "explaining_clearly": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist explained information clearly in plain language the patient can understand."
                        },
                        "helping_take_control": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist helped the patient feel empowered to manage their own health."
                        },
                        "making_plan_of_action": {
                            "type": "integer", "enum": [0, 1],
                            "description": "1 if the pharmacist worked with the patient to make a concrete plan of action."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Brief reasoning for the criteria that were or were not demonstrated.",
                            "properties": {
                                "criteria_observed": {
                                    "type": "string",
                                    "minLength": 15,
                                    "description": "One or two sentences listing which criteria were observed and citing specific phrases from the message."
                                },
                                "criteria_missed": {
                                    "type": "string",
                                    "minLength": 15,
                                    "description": "One or two sentences noting which applicable criteria were missing and why."
                                },
                                "overall_assessment": {
                                    "type": "string",
                                    "minLength": 25,
                                    "description": "Encouraging coach note addressing the pharmacist directly using 'you' language."
                                }
                            },
                            "required": ["criteria_observed", "criteria_missed", "overall_assessment"]
                        },
                        "feedback": {
                            "type": "object",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "1-2 specific things this message did well, with evidence.",
                                    "items": {"type": "string", "minLength": 10},
                                    "minItems": 1
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "1-2 concrete, actionable suggestions for this type of message.",
                                    "items": {"type": "string", "minLength": 10},
                                    "minItems": 1
                                },
                                "forward_target": {
                                    "type": "string",
                                    "minLength": 10,
                                    "description": "The single CARE criterion to practise most in the next message."
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
                    ],
                    "examples": [
                    {
                        "making_feel_at_ease": 1,
                        "letting_tell_story": 1,
                        "really_listening": 1,
                        "interested_in_whole_person": 0,
                        "understanding_concerns": 1,
                        "showing_care_compassion": 1,
                        "being_positive": 1,
                        "explaining_clearly": 0,
                        "helping_take_control": 0,
                        "making_plan_of_action": 0,
                        "judge_reasoning": {
                            "criteria_observed": "You greeted the patient warmly (#1), gave them space to speak (#2), paraphrased their concern (#3), acknowledged their worry with compassion (#6), and maintained a positive tone (#7).",
                            "criteria_missed": "The response did not explain medication details clearly (#8) or invite the patient to set goals (#9). Making a plan (#10) was not yet relevant at this stage.",
                            "overall_assessment": "You built strong rapport in this opening exchange. Focus on adding plain-language explanations as the consultation develops."
                        },
                        "feedback": {
                            "strengths": [
                                "Warm greeting and open question invited the patient to share freely",
                                "Paraphrasing ('So it sounds like...') confirmed you were listening"
                            ],
                            "improvement_suggestions": [
                                "When you next explain the medication, avoid technical terms and check comprehension",
                                "Ask one question that connects the medication to the patient's daily life"
                            ],
                            "forward_target": "Explaining things clearly (#8)"
                        }
                    }
                    ]
                }
            }
        }
    }

    # Build request body with prompt caching and tool use for guaranteed structured output
    body = {
            "system": [
                {
                    "text": static_system_prompt,
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
                            "text": dynamic_user_prompt
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
                "maxTokens": 10000
            }
    }

    try:
        logger.info(f"🚀 CALLING BEDROCK MODEL: {bedrock_client['model_id']}")
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
            return None

        logger.info(f"✅ STRUCTURED OUTPUT RECEIVED - Keys: {list(evaluation.keys())}")

        # Coerce each binary criterion: must be 0 or 1
        binary_criteria = [
            'making_feel_at_ease', 'letting_tell_story', 'really_listening',
            'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
            'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
        ]
        for key in binary_criteria:
            val = evaluation.get(key)
            if isinstance(val, str):
                try:
                    evaluation[key] = 1 if int(val) >= 1 else 0
                except (ValueError, TypeError):
                    evaluation[key] = 0
            elif val not in (0, 1):
                evaluation[key] = 0

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
    """Build per-message empathy feedback using CARE binary criteria."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    criteria_hit = [label for key, label in CARE_CRITERIA_LABELS.items() if evaluation.get(key) == 1]
    criteria_missed = [label for key, label in CARE_CRITERIA_LABELS.items() if evaluation.get(key) == 0]
    hit_count = len(criteria_hit)

    empathy_feedback = f"**Empathy Coach (CARE Measure):**\\\\n\\\\n"
    empathy_feedback += f"**Criteria demonstrated this message: {hit_count} / 10**\\\\n\\\\n"

    if criteria_hit:
        empathy_feedback += f"**Demonstrated:**\\\\n"
        for label in criteria_hit:
            empathy_feedback += f"• ✅ {label}\\\\n"
        empathy_feedback += "\\\\n"

    if criteria_missed:
        empathy_feedback += f"**Not demonstrated:**\\\\n"
        for label in criteria_missed:
            empathy_feedback += f"• ○ {label}\\\\n"
        empathy_feedback += "\\\\n"

    judge_reasoning = evaluation.get('judge_reasoning', {})
    if judge_reasoning.get('overall_assessment'):
        assessment = judge_reasoning['overall_assessment']
        assessment = assessment.replace("The student", "You").replace("the student", "you")
        empathy_feedback += f"**Coach:** {assessment}\\\\n\\\\n"

    feedback = evaluation.get('feedback', {}) or {}
    strengths = feedback.get('strengths', [])
    if strengths:
        empathy_feedback += f"**What worked:**\\\\n"
        for s in strengths:
            empathy_feedback += f"• {s}\\\\n"
        empathy_feedback += "\\\\n"

    suggestions = feedback.get('improvement_suggestions', [])
    if suggestions:
        empathy_feedback += f"**Try next time:**\\\\n"
        for s in suggestions:
            empathy_feedback += f"• {s}\\\\n"
        empathy_feedback += "\\\\n"

    forward_target = feedback.get('forward_target', '')
    if forward_target:
        empathy_feedback += f"**Focus for your next message:** {forward_target}\\\\n\\\\n"

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
        # so the empathy evaluator isn't confused by the session-end marker
        context_messages = [
            msg for msg in messages
            if msg.get("student_sent") or "SESSION COMPLETED" not in msg.get("message_content", "")
        ]
        conversation_context = build_conversation_context(context_messages)

        # If no specific message provided, use the latest student message
        if not message_content:
            for msg in reversed(messages):
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

        # Construct patient context with conversation history
        patient_context = f"""{conversation_context}
Additional patient context:
{patient_prompt}"""

        # Evaluate empathy for the message
        logger.info(f"🎯 Evaluating empathy for: {message_content[:100]}...")
        empathy_evaluation = evaluate_empathy(message_content, patient_context, bedrock_client)

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
                    "max_per_message": 10
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
