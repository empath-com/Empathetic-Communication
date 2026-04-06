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
            "description": "Submit a complete and detailed structured empathy evaluation. ALL fields must be filled with meaningful content. Do not leave any field empty.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "empathy_score": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5,
                            "description": "Overall empathy rating from 1 (low) to 5 (high)."
                        },
                        "perspective_taking": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "emotional_resonance": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "acknowledgment": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "language_communication": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "cognitive_empathy": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "affective_empathy": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 5
                        },
                        "realism_flag": {
                            "type": "string",
                            "enum": ["realistic", "unrealistic"],
                            "description": "Indicates whether the response feels natural and realistic."
                        },
                        "judge_reasoning": {
                            "type": "object",
                            "description": "Detailed justification for each score. Each field must contain specific reasoning, not generic statements.",
                            "properties": {
                            "perspective_taking_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "emotional_resonance_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "acknowledgment_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "language_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "cognitive_empathy_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "affective_empathy_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "realism_justification": {
                                "type": "string",
                                "minLength": 15
                            },
                            "overall_assessment": {
                                "type": "string",
                                "minLength": 25
                            }
                            },
                            "required": [
                                "perspective_taking_justification",
                                "emotional_resonance_justification",
                                "acknowledgment_justification",
                                "language_justification",
                                "cognitive_empathy_justification",
                                "affective_empathy_justification",
                                "realism_justification",
                                "overall_assessment"
                            ]
                        },
                        "feedback": {
                            "type": "object",
                            "description": "Actionable and specific feedback. Do not leave any field empty. Avoid generic statements.",
                            "properties": {
                                "strengths": {
                                    "type": "array",
                                    "description": "List at least 2 specific strengths of the response.",
                                    "items": {
                                    "type": "string",
                                    "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "areas_for_improvement": {
                                    "type": "array",
                                    "description": "List at least 2 concrete weaknesses.",
                                    "items": {
                                    "type": "string",
                                    "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "why_realistic": {
                                    "type": "string",
                                    "minLength": 15,
                                    "description": "Explain why the response feels realistic. Required if realism_flag = realistic."
                                },
                                "why_unrealistic": {
                                    "type": "string",
                                    "minLength": 15,
                                    "description": "Explain why the response feels unrealistic. Required if realism_flag = unrealistic."
                                },
                                "improvement_suggestions": {
                                    "type": "array",
                                    "description": "Provide at least 2 actionable suggestions for improvement.",
                                    "items": {
                                    "type": "string",
                                    "minLength": 10
                                    },
                                    "minItems": 2
                                },
                                "alternative_phrasing": {
                                    "type": "string",
                                    "minLength": 20,
                                    "description": "Provide a rewritten improved version of the response."
                                }
                            },
                            "required": [
                                "strengths",
                                "areas_for_improvement",
                                "improvement_suggestions",
                                "alternative_phrasing"
                            ]
                        }
                    },
                    "required": [
                        "empathy_score",
                        "perspective_taking",
                        "emotional_resonance",
                        "acknowledgment",
                        "language_communication",
                        "cognitive_empathy",
                        "affective_empathy",
                        "realism_flag",
                        "judge_reasoning",
                        "feedback"
                    ],
                    "allOf": [
                        {
                            "if": {
                            "properties": {
                                "realism_flag": { "const": "realistic" }
                            }
                            },
                            "then": {
                            "properties": {
                                "feedback": {
                                "required": ["why_realistic"]
                                }
                            }
                            }
                        },
                        {
                            "if": {
                                "properties": {
                                    "realism_flag": { "const": "unrealistic" }
                                }
                            },
                            "then": {
                                "properties": {
                                    "feedback": {
                                    "required": ["why_unrealistic"]
                                    }
                                }
                            }
                        }
                    ],
                    "examples": [
                    {
                        "empathy_score": 4,
                        "perspective_taking": 4,
                        "emotional_resonance": 4,
                        "acknowledgment": 5,
                        "language_communication": 4,
                        "cognitive_empathy": 4,
                        "affective_empathy": 4,
                        "realism_flag": "realistic",
                        "judge_reasoning": {
                        "perspective_taking_justification": "The response demonstrates understanding of the user's situation with specific references.",
                        "emotional_resonance_justification": "The tone aligns well with the emotional context and reflects appropriate sensitivity.",
                        "acknowledgment_justification": "The response clearly acknowledges the user's emotional state early on.",
                        "language_justification": "Language is clear, supportive, and avoids awkward phrasing.",
                        "cognitive_empathy_justification": "Shows logical understanding of the user's perspective and situation.",
                        "affective_empathy_justification": "Conveys warmth and emotional alignment with the user.",
                        "realism_justification": "The phrasing feels natural and similar to how a human would respond.",
                        "overall_assessment": "Overall, the response is empathetic, clear, and realistic, with only minor room for improvement."
                        },
                        "feedback": {
                        "strengths": [
                            "Clearly acknowledges the user's emotions in a direct way",
                            "Maintains a supportive and non-judgmental tone"
                        ],
                        "areas_for_improvement": [
                            "Could include more personalized details",
                            "Emotional validation could be slightly stronger"
                        ],
                        "why_realistic": "The tone and phrasing resemble natural human conversation and avoid robotic patterns.",
                        "improvement_suggestions": [
                            "Add more explicit emotional validation statements",
                            "Incorporate specific details from the user's situation"
                        ],
                        "alternative_phrasing": "I can really understand how difficult this must feel for you, and it makes sense that you're feeling this way given what you're going through."
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
        required_scores = ['perspective_taking', 'emotional_resonance', 'acknowledgment',
                           'language_communication', 'cognitive_empathy', 'affective_empathy']
        for score_key in required_scores:
            score_value = evaluation.get(score_key)
            if isinstance(score_value, str):
                try:
                    evaluation[score_key] = int(score_value)
                except (ValueError, TypeError):
                    evaluation[score_key] = 3
            elif score_value is None or score_value == 0:
                evaluation[score_key] = 3

        if 'empathy_score' in evaluation:
            empathy_score = evaluation.get('empathy_score')
            if isinstance(empathy_score, str):
                try:
                    evaluation['empathy_score'] = int(empathy_score)
                except (ValueError, TypeError):
                    evaluation['empathy_score'] = 3

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

def get_empathy_level_name(score: int) -> str:
    """Convert numeric empathy score to descriptive name."""
    level_names = {
        1: "Novice",
        2: "Advanced Beginner",
        3: "Competent",
        4: "Proficient",
        5: "Extending"
    }
    return level_names.get(score, "Competent")

def build_empathy_feedback(evaluation):
    """Build formatted empathy feedback from evaluation dict."""
    if not evaluation:
        return "**Empathy Coach:** System temporarily unavailable.\\\\n"

    pt_score = evaluation.get('perspective_taking', 3)
    er_score = evaluation.get('emotional_resonance', 3)
    ack_score = evaluation.get('acknowledgment', 3)
    lang_score = evaluation.get('language_communication', 3)
    cognitive_score = evaluation.get('cognitive_empathy', 3)
    affective_score = evaluation.get('affective_empathy', 3)

    overall_score = round((pt_score + er_score + ack_score + lang_score + cognitive_score + affective_score) / 6)

    realism_flag = evaluation.get('realism_flag', 'unknown')

    empathy_feedback = f"**Empathy Coach:**\\\\n\\\\n"

    if overall_score == 1:
        stars = "⭐ (1/5)"
    elif overall_score == 2:
        stars = "⭐⭐ (2/5)"
    elif overall_score == 3:
        stars = "⭐⭐⭐ (3/5)"
    elif overall_score == 4:
        stars = "⭐⭐⭐⭐ (4/5)"
    elif overall_score == 5:
        stars = "⭐⭐⭐⭐⭐ (5/5)"
    else:
        stars = "⭐⭐⭐ (3/5)"

    realism_icon = "✅" if realism_flag != "unrealistic" else ""

    overall_level = get_empathy_level_name(overall_score)
    empathy_feedback += f"**Overall Empathy Score:** {overall_level} {stars}\\\\n\\\\n"

    empathy_feedback += f"**Category Breakdown:**\\\\n"

    pt_level = get_empathy_level_name(pt_score)
    pt_stars = "⭐" * pt_score + f" ({pt_score}/5)"
    empathy_feedback += f"• Perspective-Taking: {pt_level} {pt_stars}\\\\n"

    er_level = get_empathy_level_name(er_score)
    er_stars = "⭐" * er_score + f" ({er_score}/5)"
    empathy_feedback += f"• Emotional Resonance/Compassionate Care: {er_level} {er_stars}\\\\n"

    ack_level = get_empathy_level_name(ack_score)
    ack_stars = "⭐" * ack_score + f" ({ack_score}/5)"
    empathy_feedback += f"• Acknowledgment of Patient's Experience: {ack_level} {ack_stars}\\\\n"

    lang_level = get_empathy_level_name(lang_score)
    lang_stars = "⭐" * lang_score + f" ({lang_score}/5)"
    empathy_feedback += f"• Language & Communication: {lang_level} {lang_stars}\\\\n\\\\n"

    cognitive_level = get_empathy_level_name(cognitive_score)
    affective_level = get_empathy_level_name(affective_score)
    cognitive_stars = "⭐" * cognitive_score + f" ({cognitive_score}/5)"
    affective_stars = "⭐" * affective_score + f" ({affective_score}/5)"

    empathy_feedback += f"**Empathy Type Analysis:**\\\\n"
    empathy_feedback += f"• Cognitive Empathy (Understanding): {cognitive_level} {cognitive_stars}\\\\n"
    empathy_feedback += f"• Affective Empathy (Feeling): {affective_level} {affective_stars}\\\\n\\\\n"

    empathy_feedback += f"**Realism Assessment:** Your response is {realism_flag} {realism_icon}\\\\n\\\\n"

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

    feedback = evaluation.get('feedback', {}) or {}
    strengths = feedback.get('strengths', [])
    if strengths:
        empathy_feedback += f"**Strengths:**\\\\n"
        for strength in strengths:
            empathy_feedback += f"• {strength}\\\\n"
        empathy_feedback += "\\\\n"

    areas_for_improvement = feedback.get('areas_for_improvement', [])
    if areas_for_improvement:
        empathy_feedback += f"**Areas for improvement:**\\\\n"
        for area in areas_for_improvement:
            empathy_feedback += f"• {area}\\\\n"
        empathy_feedback += "\\\\n"

    improvement_suggestions = feedback.get('improvement_suggestions', [])
    if improvement_suggestions:
        empathy_feedback += f"**Coach Recommendations:**\\\\n"
        for suggestion in improvement_suggestions:
            empathy_feedback += f"• {suggestion}\\\\n"
        empathy_feedback += "\\\\n"

    alternative_phrasing = feedback.get('alternative_phrasing', '')
    if alternative_phrasing:
        empathy_feedback += f"**Coach-Recommended Approach:** *{alternative_phrasing}*\\\\n\\\\n"

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

        return {
            "statusCode": 200,
            "body": json.dumps({
                "empathy_evaluation": empathy_evaluation,
                "summary": {
                    "overall_score": round((
                        empathy_evaluation.get('perspective_taking', 3) +
                        empathy_evaluation.get('emotional_resonance', 3) +
                        empathy_evaluation.get('acknowledgment', 3) +
                        empathy_evaluation.get('language_communication', 3) +
                        empathy_evaluation.get('cognitive_empathy', 3) +
                        empathy_evaluation.get('affective_empathy', 3)
                    ) / 6)
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
