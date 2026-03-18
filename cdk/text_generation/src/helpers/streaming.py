import json
import logging
import os
import requests
from .resilience import retry_with_backoff

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Persistent session reuses TCP connections to AppSync, avoiding a fresh DNS
# lookup on every chunk publish (which causes intermittent NameResolutionError
# under VPC DNS rate limits).
_appsync_session = requests.Session()


def get_cognito_token():
    """Get the current user's Cognito JWT token from storage."""
    token = getattr(get_cognito_token, 'current_token', None)
    if token:
        logger.info(f"✅ Found Cognito JWT token: {token[:20]}...")
        return token
    else:
        logger.error("❌ No Cognito token available in context")
        return None

@retry_with_backoff(max_retries=2, base_delay=0.2)
def publish_to_appsync(session_id: str, data: dict):
    """Publish streaming data to AppSync subscription using Cognito User Pool authentication."""
    try:
        appsync_url = os.environ.get('APPSYNC_GRAPHQL_URL')
        if not appsync_url:
            logger.error("AppSync GraphQL URL not available in environment")
            return

        logger.info(f"🔗 Using AppSync URL: {appsync_url}")

        mutation = """
        mutation PublishTextStream($sessionId: String!, $data: AWSJSON!) {
            publishTextStream(sessionId: $sessionId, data: $data) {
                sessionId
                data
            }
        }
        """

        payload = {
            'query': mutation,
            'variables': {
                'sessionId': session_id,
                'data': json.dumps(data)
            }
        }

        token = get_cognito_token()
        if not token:
            logger.error("No Cognito token available for AppSync authentication")
            return

        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': token
        }

        logger.info("🔑 Using Cognito User Pool token for authentication")

        logger.info(f"📶 Making AppSync request to: {appsync_url}")
        response = _appsync_session.post(appsync_url, data=json.dumps(payload), headers=headers)

        if response.status_code != 200:
            logger.error(f"❌ APPSYNC ERROR - Status Code: {response.status_code}")
            logger.error(f"❌ Response Headers: {dict(response.headers)}")
            logger.error(f"❌ Response Body: {response.text}")
            logger.error(f"❌ Request payload: {json.dumps(payload, indent=2)}")
            logger.error(f"❌ Session ID: {session_id}")
            logger.error(f"❌ Data type being sent: {data.get('type')}")
        else:
            logger.info(f"✅ AppSync success - Response: {response.text[:200]}...")

    except Exception as e:
        logger.error(f"Failed to publish to AppSync: {e}")
        logger.exception("Full AppSync error:")

def generate_streaming_response(
    conversational_rag_chain: object,
    query: str,
    session_id: str,
    patient_name: str,
    patient_age: str,
    patient_prompt: str,
    bedrock_client=None,
    empathy_enabled: bool = False,
    llm_completion: bool = False,
    current_session_name: str = "New chat",
) -> str:
    """
    Streams an answer via AppSync directly (no threading needed with self-invocation pattern).
    The Lambda async invocation itself provides the asynchronous execution.
    """
    import time
    # Late import to avoid circular dependency
    from .conversation import save_message_to_db

    try:
        logger.info(f"🔄 STREAMING STARTED for session: {session_id}")

        logger.info(f"🔍 STREAMING QUERY CHECK: '{query}' (length: {len(query.strip())})")
        is_greeting = 'Greet me' in query or 'Hello.' == query.strip()
        should_evaluate = len(query.strip()) > 0 and not is_greeting
        logger.info(f"🔍 IS_GREETING: {is_greeting}, SHOULD_EVALUATE: {should_evaluate}")

        student_message_id = save_message_to_db(session_id, True, query, None)

        # Publish start event
        publish_to_appsync(session_id, {"type": "start", "content": ""})

        full_response = ""
        # Buffer chunks and flush every CHUNK_BUFFER_SIZE chars to reduce AppSync HTTP calls
        CHUNK_BUFFER_SIZE = 75
        chunk_buffer = ""

        try:
            # Stream chunks to AppSync
            for chunk in conversational_rag_chain.stream(
                {"input": query},
                config={"configurable": {"session_id": session_id}},
            ):
                content = ""
                if isinstance(chunk, dict):
                    if "answer" in chunk:
                        content = chunk["answer"]
                    elif "content" in chunk:
                        content = chunk["content"]
                    elif "text" in chunk:
                        content = chunk["text"]
                elif isinstance(chunk, str):
                    content = chunk

                if content:
                    full_response += content
                    chunk_buffer += content
                    if len(chunk_buffer) >= CHUNK_BUFFER_SIZE:
                        publish_to_appsync(session_id, {"type": "chunk", "content": chunk_buffer})
                        chunk_buffer = ""

            # Flush any remaining buffered content
            if chunk_buffer:
                publish_to_appsync(session_id, {"type": "chunk", "content": chunk_buffer})
                chunk_buffer = ""

            if not full_response:
                raise Exception("No content received from streaming")

        except Exception as stream_error:
            logger.warning(f"Streaming failed, falling back to invoke: {stream_error}")
            result = conversational_rag_chain.invoke(
                {"input": query},
                config={"configurable": {"session_id": session_id}},
            )
            full_response = result.get("answer", str(result))
            # Publish the full fallback response as a single chunk
            publish_to_appsync(session_id, {"type": "chunk", "content": full_response})

        # Determine llm_verdict from the full response text
        llm_verdict = llm_completion and "SESSION COMPLETED" in full_response

        # Determine new session name for first message (frontend sidebar update)
        new_session_name = None
        if current_session_name.strip().lower() == "new chat" and patient_name:
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_session_name = f"{patient_name}_{timestamp}"

        # Publish end event with verdict and session name so the frontend can
        # update patient score and sidebar without a separate round-trip
        publish_to_appsync(session_id, {
            "type": "end",
            "content": full_response,
            "llm_verdict": llm_verdict,
            "session_name": new_session_name,
        })
        save_message_to_db(session_id, False, full_response, None)

        logger.info(f"✅ STREAMING COMPLETED for session: {session_id}, length: {len(full_response)}")

        return "Streaming completed"

    except Exception as e:
        logger.error(f"❌ STREAMING ERROR: {e}")
        logger.exception("Full streaming error:")
        error_msg = "I am sorry, I cannot provide a response to that query."
        try:
            publish_to_appsync(session_id, {"type": "error", "content": error_msg})
            save_message_to_db(session_id, False, error_msg, None)
        except:
            logger.error("Failed to publish error to AppSync")
        return error_msg
