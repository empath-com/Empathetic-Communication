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

    # Build request body with prompt caching
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
            "inferenceConfig": {
                "temperature": 0.1,
                "maxTokens": 1200
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
            logger.warning(f"Nova Pro failed in deployment region, trying us-east-1: {model_error}")
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

        response_text = result["output"]["message"]["content"][0]["text"]
        logger.info(f"📝 BEDROCK RESPONSE LENGTH: {len(response_text)} characters")

        json_start = response_text.find('{')
        json_end = response_text.rfind('}') + 1

        if json_start != -1 and json_end > json_start:
            json_text = response_text[json_start:json_end]
            logger.info(f"📝 EXTRACTED JSON LENGTH: {len(json_text)} characters")

            try:
                evaluation = json.loads(json_text)
            except json.JSONDecodeError as parse_error:
                logger.error(f"❌ FAILED TO PARSE EXTRACTED JSON: {parse_error}")
                logger.error(f"❌ EXTRACTED TEXT: {json_text[:200]}")
                return None

            logger.info(f"✅ JSON PARSING SUCCESSFUL - Keys: {list(evaluation.keys())}")

            # Validate that it's a dict and not a string
            if not isinstance(evaluation, dict):
                logger.error(f"❌ EVALUATION IS NOT A DICT: {type(evaluation)}")
                return None

            # Convert string scores to integers and validate
            required_scores = ['perspective_taking', 'emotional_resonance', 'acknowledgment', 'language_communication', 'cognitive_empathy', 'affective_empathy']
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
        else:
            logger.error(f"❌ NO JSON FOUND IN RESPONSE: {response_text[:200]}")
            return None

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
    feedback = evaluation.get('feedback', '')

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

    if feedback and isinstance(feedback, dict):
        if 'strengths' in feedback and feedback['strengths']:
            empathy_feedback += f"**Strengths:**\\\\n"
            for strength in feedback['strengths']:
                empathy_feedback += f"• {strength}\\\\n"
            empathy_feedback += "\\\\n"

        if 'areas_for_improvement' in feedback and feedback['areas_for_improvement']:
            empathy_feedback += f"**Areas for improvement:**\\\\n"
            for area in feedback['areas_for_improvement']:
                empathy_feedback += f"• {area}\\\\n"
            empathy_feedback += "\\\\n"

        if 'improvement_suggestions' in feedback and feedback['improvement_suggestions']:
            empathy_feedback += f"**Coach Recommendations:**\\\\n"
            for suggestion in feedback['improvement_suggestions']:
                empathy_feedback += f"• {suggestion}\\\\n"
            empathy_feedback += "\\\\n"

        if 'alternative_phrasing' in feedback and feedback['alternative_phrasing']:
            empathy_feedback += f"**Coach-Recommended Approach:** *{feedback['alternative_phrasing']}*\\\\n\\\\n"

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

        # Build conversation context
        conversation_context = build_conversation_context(messages)

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
