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

    # Tool schema forces the model to return structured JSON — no text parsing needed
    empathy_tool = {
        "toolSpec": {
            "name": "submit_empathy_evaluation",
            "description": "Submit a complete CARE Measure empathy evaluation for a pharmacist-patient consultation. ALL fields must be filled with meaningful content. Do not leave any field empty.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "rapport": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                            "description": "How well the pharmacist built rapport and a trusting relationship with the patient (1-10)."
                        },
                        "listening": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5,
                            "description": "Active listening skills demonstrated during the consultation (1-5)."
                        },
                        "whole-person": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                            "description": "Degree to which the pharmacist treated the patient as a whole person beyond just their medication (1-10)."
                        },
                        "affective_empathy": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5,
                            "description": "Emotional empathy and compassionate care shown toward the patient (1-5)."
                        },
                        "communication": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                            "description": "Overall clarity, appropriateness, and quality of communication (1-10)."
                        },
                        "shared_planning": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                            "description": "Collaborative planning and shared decision-making with the patient (1-10)."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Detailed justification for each score. Each field must contain specific reasoning, not generic statements.",
                            "properties": {
                                "rapport_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "emotional_resonance_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "listening_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "whole-person_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "affective_empathy_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "communication_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "shared_planning_justification": {
                                    "type": "string",
                                    "minLength": 15
                                },
                                "overall_assessment": {
                                    "type": "string",
                                    "minLength": 25
                                }
                            },
                            "required": [
                                "rapport_justification",
                                "emotional_resonance_justification",
                                "listening_justification",
                                "whole-person_justification",
                                "affective_empathy_justification",
                                "communication_justification",
                                "shared_planning_justification",
                                "overall_assessment"
                            ]
                        },
                        "feedback": {
                            "type": "object",
                            "description": "Actionable and specific feedback. Do not leave any field empty. Avoid generic statements.",
                            "properties": {
                                "total_score": {
                                    "type": "integer",
                                    "description": "Sum of all dimension scores (max 50): rapport + listening + whole-person + affective_empathy + communication + shared_planning."
                                },
                                "strengths": {
                                    "type": "array",
                                    "description": "List at least 2 specific strengths with evidence from the response.",
                                    "items": {
                                        "type": "string",
                                        "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "areas_for_improvement": {
                                    "type": "array",
                                    "description": "List at least 2 specific domains needing improvement with examples.",
                                    "items": {
                                        "type": "string",
                                        "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "Provide at least 2 actionable, specific improvement recommendations.",
                                    "items": {
                                        "type": "string",
                                        "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "forward_target": {
                                    "type": "string",
                                    "minLength": 10,
                                    "description": "The one domain the pharmacist most needs to practice before the next training session."
                                }
                            },
                            "required": [
                                "total_score",
                                "strengths",
                                "areas_for_improvement",
                                "improvement_suggestions",
                                "forward_target"
                            ]
                        }
                    },
                    "required": [
                        "rapport",
                        "listening",
                        "whole-person",
                        "affective_empathy",
                        "communication",
                        "shared_planning",
                        "judge_reasoning",
                        "feedback"
                    ],
                    "examples": [
                    {
                        "rapport": 7,
                        "listening": 4,
                        "whole-person": 6,
                        "affective_empathy": 4,
                        "communication": 7,
                        "shared_planning": 6,
                        "judge_reasoning": {
                            "rapport_justification": "The pharmacist greeted the patient warmly and used their name, establishing a comfortable atmosphere.",
                            "emotional_resonance_justification": "The pharmacist acknowledged the patient's concern about side effects with genuine sensitivity.",
                            "listening_justification": "The pharmacist paraphrased the patient's main concern before responding, demonstrating active listening.",
                            "whole-person_justification": "The pharmacist asked about the patient's daily routine and lifestyle to tailor advice, but did not explore psychosocial factors.",
                            "affective_empathy_justification": "Showed warmth and validation of the patient's emotional experience with the condition.",
                            "communication_justification": "Used plain language effectively, though some technical terms were left unexplained.",
                            "shared_planning_justification": "Offered two medication timing options and asked the patient which worked best for them.",
                            "overall_assessment": "Overall you demonstrated solid foundational skills. Your rapport-building and active listening were highlights. To grow further, focus on integrating whole-person questions into every consultation."
                        },
                        "feedback": {
                            "total_score": 34,
                            "strengths": [
                                "Warm, patient-centred greeting established trust early in the consultation",
                                "Offered patient choice in the treatment plan, supporting shared decision-making"
                            ],
                            "areas_for_improvement": [
                                "Whole-person care: Did not explore psychosocial or lifestyle factors beyond medication timing",
                                "Communication: Left several clinical terms unexplained"
                            ],
                            "improvement_suggestions": [
                                "Ask one open-ended question about how the condition is affecting the patient's daily life",
                                "After any clinical term, add a brief plain-language explanation"
                            ],
                            "forward_target": "Whole-person care — practice asking about the patient's broader life context in your next session"
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

        # Coerce integer scores in case model returned strings
        # (key, default_mid, max_val)
        required_scores = [
            ('rapport', 5, 10),
            ('listening', 3, 5),
            ('whole-person', 5, 10),
            ('affective_empathy', 3, 5),
            ('communication', 5, 10),
            ('shared_planning', 5, 10),
        ]
        for score_key, default_mid, _max in required_scores:
            score_value = evaluation.get(score_key)
            if isinstance(score_value, str):
                try:
                    evaluation[score_key] = int(score_value)
                except (ValueError, TypeError):
                    evaluation[score_key] = default_mid
            elif score_value is None or score_value == 0:
                evaluation[score_key] = default_mid

        # Ensure total_score in feedback is computed/coerced
        feedback = evaluation.get('feedback', {}) or {}
        if not feedback.get('total_score'):
            computed_total = (
                evaluation.get('rapport', 5) +
                evaluation.get('listening', 3) +
                evaluation.get('whole-person', 5) +
                evaluation.get('affective_empathy', 3) +
                evaluation.get('communication', 5) +
                evaluation.get('shared_planning', 5)
            )
            feedback['total_score'] = computed_total
            evaluation['feedback'] = feedback

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

def build_empathy_feedback(evaluation):
    """Build formatted CARE Measure empathy feedback from evaluation dict."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    rapport_score = evaluation.get('rapport', 5)
    listening_score = evaluation.get('listening', 3)
    whole_person_score = evaluation.get('whole-person', 5)
    affective_score = evaluation.get('affective_empathy', 3)
    communication_score = evaluation.get('communication', 5)
    shared_planning_score = evaluation.get('shared_planning', 5)

    feedback = evaluation.get('feedback', {}) or {}
    total_score = feedback.get('total_score') or (
        rapport_score + listening_score + whole_person_score +
        affective_score + communication_score + shared_planning_score
    )

    empathy_feedback = f"**Empathy Coach (CARE Measure — Pharmacist–Patient Consultation):**\\\\n\\\\n"
    empathy_feedback += f"**Total Score: {total_score}/50**\\\\n\\\\n"

    empathy_feedback += f"**CARE Dimension Breakdown:**\\\\n"
    empathy_feedback += f"• Rapport: {rapport_score}/10\\\\n"
    empathy_feedback += f"• Listening: {listening_score}/5\\\\n"
    empathy_feedback += f"• Whole-Person Care: {whole_person_score}/10\\\\n"
    empathy_feedback += f"• Affective Empathy: {affective_score}/5\\\\n"
    empathy_feedback += f"• Communication: {communication_score}/10\\\\n"
    empathy_feedback += f"• Shared Planning: {shared_planning_score}/10\\\\n\\\\n"

    judge_reasoning = evaluation.get('judge_reasoning', {})
    if judge_reasoning and 'overall_assessment' in judge_reasoning:
        empathy_feedback += f"**Coach Assessment:**\\\\n"
        assessment = judge_reasoning['overall_assessment']
        assessment = assessment.replace("The student's response", "Your response")
        assessment = assessment.replace("The student", "You")
        assessment = assessment.replace("demonstrates", "show")
        assessment = assessment.replace("fails to", "could better")
        assessment = assessment.replace("lacks", "would benefit from more")
        empathy_feedback += f"{assessment}\\\\n\\\\n"

    strengths = feedback.get('strengths', [])
    if strengths:
        empathy_feedback += f"**Strengths:**\\\\n"
        for strength in strengths:
            empathy_feedback += f"• {strength}\\\\n"
        empathy_feedback += "\\\\n"

    areas_for_improvement = feedback.get('areas_for_improvement', [])
    if areas_for_improvement:
        empathy_feedback += f"**Areas for Improvement:**\\\\n"
        for area in areas_for_improvement:
            empathy_feedback += f"• {area}\\\\n"
        empathy_feedback += "\\\\n"

    improvement_suggestions = feedback.get('improvement_suggestions', [])
    if improvement_suggestions:
        empathy_feedback += f"**Coach Recommendations:**\\\\n"
        for suggestion in improvement_suggestions:
            empathy_feedback += f"• {suggestion}\\\\n"
        empathy_feedback += "\\\\n"

    forward_target = feedback.get('forward_target', '')
    if forward_target:
        empathy_feedback += f"**Focus for Next Session:** {forward_target}\\\\n\\\\n"

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

        feedback_obj = empathy_evaluation.get('feedback', {}) or {}
        total_score = feedback_obj.get('total_score') or (
            empathy_evaluation.get('rapport', 5) +
            empathy_evaluation.get('listening', 3) +
            empathy_evaluation.get('whole-person', 5) +
            empathy_evaluation.get('affective_empathy', 3) +
            empathy_evaluation.get('communication', 5) +
            empathy_evaluation.get('shared_planning', 5)
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "empathy_evaluation": empathy_evaluation,
                "summary": {
                    "total_score": total_score,
                    "max_score": 50
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
