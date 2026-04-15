import boto3
import json
import logging
from pydantic import BaseModel, Field

from .prompts import get_empathy_prompt, get_default_empathy_prompt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Toggle to evaluate the full thread (up to message_id) instead of only one message.
USE_THREAD_UP_TO_MESSAGE_ID_FOR_EVAL = True


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

    # Build dynamic user prompt with hard grounding constraints to reduce hallucination.
    dynamic_user_prompt = f"""You must evaluate ONLY using evidence in TRANSCRIPT.
Do not invent quotes, symptoms, medications, or events not present in TRANSCRIPT.
If a criterion lacks evidence, state that explicitly in the justification.

PATIENT_CONTEXT:
{patient_context}

TRANSCRIPT_START
{student_response}
TRANSCRIPT_END"""

    logger.info(f"✅ Using prompt caching - Static prompt: {len(static_system_prompt)} chars, Dynamic: {len(dynamic_user_prompt)} chars")

    # CRITICAL VALIDATION: Ensure the user text is included
    if student_response not in dynamic_user_prompt:
        logger.error(f"❌ USER TEXT NOT FOUND IN DYNAMIC PROMPT - This will cause hallucination!")
        return None

    # Tool schema: 10 CARE criteria scored 1-5 scale.
    # Each criterion is scored 1-5: 1=Emerging, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced.
    # Scores reflect the entire conversation thread, not individual messages.
    empathy_tool = {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": (
                "Evaluate the pharmacist's communication using the 10 CARE Measure criteria, "
                "each scored on a 1-5 scale. Assess the entire conversation thread holistically."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "making_feel_at_ease": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: warmth and comfort-building efforts toward the patient."
                        },
                        "letting_tell_story": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: space and opportunity given for patient self-expression."
                        },
                        "really_listening": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: active listening demonstrated through paraphrasing, reflecting, and engagement."
                        },
                        "interested_in_whole_person": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: curiosity and attention to holistic patient context beyond immediate symptoms."
                        },
                        "understanding_concerns": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: depth of understanding and validation of patient's full concerns."
                        },
                        "showing_care_compassion": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: genuine empathy and emotional support expressed to the patient."
                        },
                        "being_positive": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: encouraging, reassuring, and non-judgmental tone throughout."
                        },
                        "explaining_clearly": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: clarity and accessibility of explanations in plain language."
                        },
                        "helping_take_control": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: empowerment and involvement in decision-making."
                        },
                        "making_plan_of_action": {
                            "type": "integer", "enum": [1, 2, 3, 4, 5],
                            "description": "Score 1-5: collaborative, clear planning and next steps agreed with patient."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Detailed justifications for each score.",
                            "properties": {
                                "making_feel_at_ease_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "letting_tell_story_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "really_listening_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "interested_in_whole_person_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "understanding_concerns_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "showing_care_compassion_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "being_positive_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "explaining_clearly_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "helping_take_control_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "making_plan_of_action_justification": {
                                    "type": "string",
                                    "minLength": 50,
                                    "description": "2-4 sentences explaining the score with specific evidence from the conversation."
                                },
                                "overall_assessment": {
                                    "type": "string",
                                    "minLength": 400,
                                    "description": "Comprehensive coach assessment (400-600 words) addressing the pharmacist directly using 'you' language. MUST discuss all 6 empathy domains with specific examples from the conversation: (1) Rapport (warmth, space for expression), (2) Listening (active engagement, reflection), (3) Whole-person care (holistic interest, concerns), (4) Affective empathy (compassion, care), (5) Communication (positive tone, clarity), (6) Shared planning (empowerment, collaboration). Cite specific phrases as evidence. Focus on growth and learning."
                                }
                            },
                            "required": ["making_feel_at_ease_justification", "letting_tell_story_justification", "really_listening_justification", "interested_in_whole_person_justification", "understanding_concerns_justification", "showing_care_compassion_justification", "being_positive_justification", "explaining_clearly_justification", "helping_take_control_justification", "making_plan_of_action_justification", "overall_assessment"]
                        },
                        "feedback": {
                            "type": "object",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "2-3 specific strengths demonstrated, each 3-4 sentences with detailed examples from the conversation. Include what was done well and why it was effective.",
                                    "items": {"type": "string", "minLength": 80},
                                    "minItems": 2
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "2-3 concrete, actionable improvement suggestions, each 3-4 sentences with specific examples of how to apply them. Include specific phrases or approaches the pharmacist could use.",
                                    "items": {"type": "string", "minLength": 80},
                                    "minItems": 2
                                },
                                "forward_target": {
                                    "type": "string",
                                    "minLength": 15,
                                    "description": "Plain text (no special formatting or symbols) describing the single CARE criterion or skill to focus on in the next patient interaction, with brief explanation of why it would be valuable to practice."
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

        conversation_context = build_conversation_context(scoped_messages)

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

        # Construct patient context with conversation history
        patient_context = f"""{conversation_context}
Additional patient context:
{patient_prompt}"""

        evaluation_input = message_content
        if USE_THREAD_UP_TO_MESSAGE_ID_FOR_EVAL and message_id:
            evaluation_input = conversation_context.strip()
            logger.info(
                f"🧵 Using full scoped thread as empathy evaluation input (chars={len(evaluation_input)})"
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
