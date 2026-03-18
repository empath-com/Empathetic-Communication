import boto3
import re
import json
import logging
from .db_connection_manager import get_db_cursor

from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Tables confirmed to exist in this Lambda container lifetime — avoids repeated list_tables scans
_confirmed_tables: set = set()


def create_dynamodb_history_table(table_name: str) -> bool:
    """
    Create a DynamoDB table to store the session history if it doesn't already exist.
    Uses a module-level set to skip the list_tables scan on warm Lambda containers.
    """
    if table_name in _confirmed_tables:
        logger.info(f"DynamoDB table '{table_name}' already confirmed — skipping check")
        return True

    dynamodb_resource = boto3.resource("dynamodb")
    dynamodb_client = boto3.client("dynamodb")

    existing_tables = []
    exclusive_start_table_name = None

    while True:
        if exclusive_start_table_name:
            response = dynamodb_client.list_tables(ExclusiveStartTableName=exclusive_start_table_name)
        else:
            response = dynamodb_client.list_tables()

        existing_tables.extend(response.get('TableNames', []))

        if 'LastEvaluatedTableName' in response:
            exclusive_start_table_name = response['LastEvaluatedTableName']
        else:
            break

    if table_name not in existing_tables:
        table = dynamodb_resource.create_table(
            TableName=table_name,
            KeySchema=[{"AttributeName": "SessionId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "SessionId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        table.meta.client.get_waiter("table_exists").wait(TableName=table_name)

    _confirmed_tables.add(table_name)
    logger.info(f"DynamoDB table '{table_name}' confirmed and cached")


def get_conversation_history(session_id: str) -> list:
    """
    Retrieve conversation history for a session from PostgreSQL.
    Returns list of messages in chronological order: [{"student_sent": bool, "message_content": str}, ...]
    """
    try:
        logger.info(f"📖 Retrieving conversation history for session: {session_id}")
        with get_db_cursor() as cursor:
            cursor.execute(
                'SELECT student_sent, message_content, time_sent FROM "messages" WHERE session_id = %s ORDER BY time_sent ASC',
                (session_id,)
            )
            rows = cursor.fetchall()

            messages = []
            for row in rows:
                student_sent, message_content, time_sent = row
                messages.append({
                    "student_sent": student_sent,
                    "message_content": message_content,
                    "time_sent": time_sent
                })

            logger.info(f"📖 Retrieved {len(messages)} messages from conversation history")
            return messages
    except Exception as e:
        logger.error(f"Error retrieving conversation history: {e}")
        return []

def build_conversation_context(messages: list) -> str:
    """
    Build a formatted conversation context string from message history.
    """
    if not messages:
        return ""

    context = "CONVERSATION HISTORY:\n"
    for msg in messages:
        role = "Student" if msg.get("student_sent") else "AI Patient"
        content = msg.get("message_content", "")
        context += f"\n{role}: {content}"

    context += "\n\n"
    logger.info(f"✅ Built conversation context of {len(context)} characters")
    return context

def save_message_to_db(session_id: str, student_sent: bool, message_content: str, empathy_evaluation: dict = None):
    """Save message with empathy evaluation to PostgreSQL messages table using centralized connection manager.
    Returns the generated message_id (uuid string) or None on failure."""
    try:
        logger.info("🔗 DB_SAVE_MESSAGE: Using centralized connection manager")

        empathy_json = json.dumps(empathy_evaluation) if empathy_evaluation else None
        if empathy_evaluation:
            logger.info(f"💾 Empathy JSON being saved: {empathy_json[:500]}...")
            logger.info(f"💾 Empathy evaluation keys: {list(empathy_evaluation.keys())}")
            logger.info(f"💾 Perspective taking in DB save: {empathy_evaluation.get('perspective_taking')}")
            logger.info(f"💾 Emotional resonance in DB save: {empathy_evaluation.get('emotional_resonance')}")

        message_id = None
        with get_db_cursor() as cursor:
            cursor.execute(
                'INSERT INTO "messages" (session_id, student_sent, message_content, empathy_evaluation, time_sent) VALUES (%s, %s, %s, %s, NOW()) RETURNING message_id',
                (session_id, student_sent, message_content, empathy_json)
            )
            row = cursor.fetchone()
            message_id = str(row[0]) if row else None

        if empathy_evaluation:
            logger.info(f"🧠 Empathy data saved: {json.dumps(empathy_evaluation)[:100]}...")
            logger.info(f"🧠 Saved empathy scores - PT: {empathy_evaluation.get('perspective_taking')}, ER: {empathy_evaluation.get('emotional_resonance')}")

        logger.info(f"🔗 DB_MESSAGE_SAVED: Message {message_id} successfully saved using connection manager")
        return message_id

    except Exception as e:
        logger.error(f"Error saving message to database (session_id={session_id}): {e}")
        return None

def update_message_empathy(message_id: str, empathy_evaluation: dict) -> None:
    """Update an existing message row with its empathy evaluation after streaming completes."""
    try:
        empathy_json = json.dumps(empathy_evaluation)
        with get_db_cursor() as cursor:
            cursor.execute(
                'UPDATE "messages" SET empathy_evaluation = %s WHERE message_id = %s',
                (empathy_json, message_id)
            )
        logger.info(f"✅ Empathy evaluation saved for message {message_id}")
    except Exception as e:
        logger.error(f"Failed to update empathy evaluation for message {message_id}: {e}")


def get_llm_output(response: str, llm_completion: bool, empathy_feedback: str = "") -> dict:
    """
    Processes the response from the LLM to determine if proper diagnosis has been achieved.
    """
    completion_sentence = " I really appreciate your feedback. You may continue practicing with other patients. Goodbye."

    if not llm_completion:
        return dict(
            llm_output=response,
            llm_verdict=False
        )

    elif "SESSION COMPLETED" not in response:
        return dict(
            llm_output=response,
            llm_verdict=False
        )

    elif "SESSION COMPLETED" in response:
        sentences = split_into_sentences(response)

        for i in range(len(sentences)):
            if "SESSION COMPLETED" in sentences[i]:
                llm_response=' '.join(sentences[0:i-1])

                if sentences[i-1][-1] == '?':
                    return dict(
                        llm_output=llm_response,
                        llm_verdict=False
                    )
                else:
                    return dict(
                        llm_output=llm_response + completion_sentence,
                        llm_verdict=True
                    )

def split_into_sentences(paragraph: str) -> list[str]:
    """
    Splits a given paragraph into individual sentences using a regular expression to detect sentence boundaries.
    """
    sentence_endings = r'(?<!\\w\\.\\w.)(?<![A-Z][a-z]\\.)(?<=\\.|\\?|\\!)\\s'
    sentences = re.split(sentence_endings, paragraph)
    return sentences

def update_session_name(table_name: str, session_id: str, bedrock_llm_id: str, patient_name: str = None, current_session_name: str = "New chat") -> str:
    """
    Set a meaningful session name the first time a student exchanges a message.
    Only updates if the session still has the default name ("New chat" / "New Chat").
    Persists directly to PostgreSQL so it works even with async (streaming) invocations.
    """
    if current_session_name.strip().lower() != "new chat":
        logger.info(f"Session name already set to '{current_session_name}', skipping update.")
        return None

    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    session_name = f"{patient_name}_{timestamp}" if patient_name else f"Chat_{timestamp}"

    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                'UPDATE sessions SET session_name = %s WHERE session_id = %s',
                (session_name, session_id)
            )
        logger.info(f"✅ SESSION_NAME_UPDATED: session_id={session_id}, name={session_name}")
    except Exception as e:
        logger.error(f"❌ SESSION_NAME_UPDATE_FAILED: {e}")

    return session_name

def get_response(
    query: str,
    patient_name: str,
    llm: ChatBedrock,
    history_aware_retriever,
    table_name: str,
    session_id: str,
    group_prompt: str,
    patient_age: str,
    patient_prompt: str,
    llm_completion: bool,
    stream: bool = False,
    bedrock_client=None,
    empathy_enabled: bool = False,
    current_session_name: str = "New chat",
) -> dict:
    """
    Generates a response to a query using the LLM and a history-aware retriever for context.
    """
    from .prompts import get_default_system_prompt
    # Late import to avoid circular dependency
    from .streaming import generate_streaming_response

    logger.info(f"🔍 GET_RESPONSE CALLED - Stream: {stream}, Query: '{query[:50]}...'")

    # For non-streaming only: save student message here.
    # Streaming path saves the message inside generate_streaming_response (line ~770) to avoid duplicates.
    is_greeting = 'Greet me' in query or 'Hello.' == query.strip()
    if not stream:
        try:
            save_message_to_db(session_id, True, query, None)
            logger.info("🧠 NON-STREAMING: Student message saved")
        except Exception as e:
            logger.error(f"Failed to save student message (session_id={session_id}): {e}")

    empathy_feedback = ""

    completion_string = """
                Once I, the pharmacist, have give you a diagnosis, politely leave the conversation and wish me goodbye.
                Regardless if I have given you the proper diagnosis or not for the patient you are pretending to be, stop talking to me.
                """
    if llm_completion:
        completion_string = """
                Continue this process until you determine that me, the pharmacist, has properly diagnosed the patient you are pretending to be.
                Once the proper diagnosis is provided, include SESSION COMPLETED in your response and politely end the conversation.
                """

    system_prompt = get_default_system_prompt(patient_name)

    final_system_prompt = (
        f"""
        <|begin_of_text|>
        <|start_header_id|>patient<|end_header_id|>

        CRITICAL: You are {patient_name}, a PATIENT seeking help from a pharmacist.
        NEVER act as a doctor or pharmacist. ALWAYS respond as a patient.

        {system_prompt}
        {group_prompt}

        Additional details about your personality, symptoms or condition:
        {patient_prompt if patient_prompt else "No additional details provided."}

        {completion_string}

        <|eot_id|>
        <|start_header_id|>documents<|end_header_id|>
        {{context}}
        <|eot_id|>
        """
    )

    logger.info("====================================")
    logger.info("FINAL SYSTEM PROMPT BEING USED:")
    logger.info(f"    system prompt length: {len(final_system_prompt)} chars")
    logger.info(f"    contains PATIENT: {'patient' in final_system_prompt.lower()}")
    logger.info(f"    first 400 chars\n{final_system_prompt[:400]}")
    logger.info("====================================")

    qa_prompt = ChatPromptTemplate.from_messages([
        ("system", final_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

    conversational_rag_chain = RunnableWithMessageHistory(
        rag_chain,
        lambda session_id: DynamoDBChatMessageHistory(
            table_name=table_name,
            session_id=session_id
        ),
        input_messages_key="input",
        history_messages_key="chat_history",
        output_messages_key="answer",
    )

    response = ""
    try:
        if stream:
            response = generate_streaming_response(
                conversational_rag_chain,
                query,
                session_id,
                patient_name,
                patient_age,
                patient_prompt,
                bedrock_client=bedrock_client,
                empathy_enabled=empathy_enabled,
                llm_completion=llm_completion,
                current_session_name=current_session_name,
            )
            # For streaming, response is saved directly via AppSync
            # Return immediately with status message
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            session_name = f"{patient_name}_{timestamp}"
            return {"llm_output": response, "session_name": session_name, "llm_verdict": False}
        else:
            response = generate_response(
                conversational_rag_chain,
                query,
                session_id
            )
            if not response:
                response = "I'm sorry, I cannot provide a response to that query."

    except Exception as e:
        logger.error(f"Response generation error: {e}")
        response = "I'm sorry, I cannot provide a response to that query."

    result = get_llm_output(response, llm_completion, empathy_feedback)

    # Generate proper session name
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    result["session_name"] = f"{patient_name}_{timestamp}"

    save_message_to_db(session_id, False, result["llm_output"], None)

    return result

def generate_response(conversational_rag_chain: object, query: str, session_id: str) -> str:
    """Invokes the RAG chain to generate a response."""
    try:
        return conversational_rag_chain.invoke(
            {"input": query},
            config={"configurable": {"session_id": session_id}},
        )["answer"]
    except Exception as e:
        raise e
