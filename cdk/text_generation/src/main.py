import os
import json
import boto3
import logging
import psycopg2
import time
from langchain_aws import BedrockEmbeddings
from botocore.exceptions import ConnectTimeoutError, ReadTimeoutError

from helpers.vectorstore import get_vectorstore_retriever
from helpers.chat import get_bedrock_llm, get_initial_student_query, get_student_query, create_dynamodb_history_table, get_response, update_session_name

# Set up basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Version: 2026-01-12 - Add text generation timeout protection

# Environment variables
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
REGION = os.environ["REGION"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
BEDROCK_LLM_PARAM = os.environ["BEDROCK_LLM_PARAM"]
EMBEDDING_MODEL_PARAM = os.environ["EMBEDDING_MODEL_PARAM"]
TABLE_NAME_PARAM = os.environ["TABLE_NAME_PARAM"]
APPSYNC_GRAPHQL_URL = os.environ.get("APPSYNC_GRAPHQL_URL", "")
BEDROCK_TIMEOUT_SECONDS = int(os.environ.get("BEDROCK_TIMEOUT_SECONDS", "15"))  # 🔴 CRITICAL: Timeout for Bedrock API

# AWS Clients with timeout configuration
# 🔴 CRITICAL: Add connection timeout to prevent hanging on slow Bedrock responses
config = boto3.session.Config(
    connect_timeout=5,
    read_timeout=BEDROCK_TIMEOUT_SECONDS,
    retries={'max_attempts': 1}  # No retries to fail fast
)

secrets_manager_client = boto3.client("secretsmanager", config=config)
ssm_client = boto3.client("ssm", region_name=REGION, config=config)
bedrock_runtime = boto3.client("bedrock-runtime", region_name=REGION, config=config)

# Cached resources
connection = None
db_secret = None
BEDROCK_LLM_ID = None
EMBEDDING_MODEL_ID = None
TABLE_NAME = None

# Cached embeddings instance
embeddings = None

# ─── Text Generation Connection Pool (Prevent Exhaustion) ──────────────────────
# 🔴 CRITICAL: Use connection pool to prevent creating new connection per request
db_connection_pool = None

def get_connection_pool():
    """Get or create a connection pool for text generation"""
    global db_connection_pool
    if db_connection_pool is None:
        try:
            secret = get_secret(DB_SECRET_NAME)
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': secret["port"],
                'connect_timeout': 5,
            }
            
            # Create a smaller pool for text generation (3-10 connections)
            db_connection_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=10,  # Keep text generation isolated from voice (which uses up to 20)
                **connection_params
            )
            logger.info(f"✅ TEXT_GEN: Connection pool created with min=2, max=10")
        except Exception as e:
            logger.error(f"❌ TEXT_GEN: Failed to create connection pool: {e}")
            raise
    
    return db_connection_pool
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
            db_secret = json.loads(response) if expect_json else response
        except json.JSONDecodeError as e:
            raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
        except Exception as e:
            raise
    return db_secret


def get_parameter(param_name, cached_var):
    """
    Fetch a parameter value from Systems Manager Parameter Store.
    """
    if cached_var is None:
        try:
            response = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
            cached_var = response["Parameter"]["Value"]
        except Exception as e:
            logger.error(f"Error fetching parameter {param_name}: {e}")
            raise
    return cached_var

def initialize_constants():
    global BEDROCK_LLM_ID, EMBEDDING_MODEL_ID, TABLE_NAME, embeddings
    BEDROCK_LLM_ID = get_parameter(BEDROCK_LLM_PARAM, BEDROCK_LLM_ID)
    EMBEDDING_MODEL_ID = get_parameter(EMBEDDING_MODEL_PARAM, EMBEDDING_MODEL_ID)
    TABLE_NAME = get_parameter(TABLE_NAME_PARAM, TABLE_NAME)

    if embeddings is None:
        embeddings = BedrockEmbeddings(
            model_id=EMBEDDING_MODEL_ID,
            client=bedrock_runtime,
            region_name=REGION,
        )
    
    create_dynamodb_history_table(TABLE_NAME)

def connect_to_db():
    """Get a connection from the pool (NEW: uses connection pooling)"""
    global connection
    try:
        pool = get_connection_pool()
        connection = pool.getconn()
        logger.info("🔌 TEXT_GEN: Got connection from pool")
        return connection
    except Exception as e:
        logger.error(f"❌ TEXT_GEN: Failed to get connection from pool: {e}")
        raise

def return_db_connection(conn):
    """Return connection to the pool"""
    if conn and db_connection_pool:
        try:
            db_connection_pool.putconn(conn)
            logger.info("🔌 TEXT_GEN: Returned connection to pool")
        except Exception as e:
            logger.warning(f"⚠️ TEXT_GEN: Failed to return connection to pool: {e}")

def get_system_prompt(simulation_group_id):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    
    try:
        cur = connection.cursor()
        
        cur.execute("""
            SELECT system_prompt
            FROM "simulation_groups"
            WHERE simulation_group_id = %s;
        """, (simulation_group_id,))

        result = cur.fetchone()
        logger.info(f"Query result: {result}")
        system_prompt = result[0] if result else None

        cur.close()

        if system_prompt:
            logger.info(f"System prompt for simulation_group_id {simulation_group_id} found: {system_prompt}")
        else:
            logger.warning(f"No system prompt found for simulation_group_id {simulation_group_id}")

        return system_prompt

    except Exception as e:
        logger.error(f"Error fetching system prompt: {e}")
        if cur:
            cur.close()
        connection.rollback()
        return None


def get_patient_details(patient_id):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    
    try:
        cur = connection.cursor()
        logger.info("Connected to RDS instance!")
        cur.execute("""
            SELECT patient_name, patient_age, patient_prompt, llm_completion
            FROM "patients"
            WHERE patient_id = %s;
        """, (patient_id,))

        result = cur.fetchone()
        logger.info(f"Query result: {result}")

        cur.close()

        if result:
            patient_name, patient_age, patient_prompt, llm_completion = result
            return patient_name, patient_age, patient_prompt, llm_completion
        else:
            return None, None, None, None

    except Exception as e:
        logger.error(f"Error fetching patient details: {e}")
        if cur:
            cur.close()
        connection.rollback()
        return None, None, None




def handler(event, context):
    # Version: 2026-01-12 - Add timeout protection and connection pooling
    # 🔴 CRITICAL: Wrap entire handler in try-finally to return connection to pool
    connection_obj = None
    
    try:
        start_time = time.time()
        logger.info("🚀 STREAMING FUNCTION STARTED - Text Generation Lambda function is called!")
        logger.info("🔧 EMPATHY EVALUATION SYSTEM LOADED")
        logger.info(f"📝 Event headers: {event.get('headers', {})}")
        logger.info(f"🔍 FULL EVENT: {json.dumps(event, default=str)}")
        initialize_constants()
        
        # 🔴 CRITICAL: Get connection from pool at start
        connection_obj = connect_to_db()
        if connection_obj is None:
            logger.error("❌ TEXT_GEN: Failed to get database connection")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Database connection failed')
            }
        
        # Extract the user's Cognito token from the API Gateway event
        auth_token = None
        if 'headers' in event:
            headers = event['headers']
            auth_token = headers.get('Authorization') or headers.get('authorization')
            logger.info(f"🔍 Found headers: {list(headers.keys())}")
        
        if auth_token:
            logger.info(f"🎫 Raw auth token: {auth_token[:30]}...")
            # Extract JWT token from Bearer format if present
            if auth_token.startswith('Bearer '):
                jwt_token = auth_token[7:]  # Remove 'Bearer ' prefix
            else:
                jwt_token = auth_token
            
            # Store the JWT token for AppSync authentication
            from helpers.chat import get_cognito_token
            get_cognito_token.current_token = f"Bearer {jwt_token}"
            logger.info(f"✅ Cognito JWT token extracted and stored: Bearer {jwt_token[:20]}...")
        else:
            logger.warning(f"❌ No Authorization header found. Available headers: {list(headers.keys()) if 'headers' in locals() else 'No headers'}")

        query_params = event.get("queryStringParameters", {})
        simulation_group_id = query_params.get("simulation_group_id", "")
        session_id = query_params.get("session_id", "")
        patient_id = query_params.get("patient_id", "")
        session_name = query_params.get("session_name", "New Chat")

        if not simulation_group_id or not session_id or not patient_id:
            return {
                'statusCode': 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps("Missing required parameters: simulation_group_id, session_id, or patient_id")
            }

        system_prompt = get_system_prompt(simulation_group_id)
        if system_prompt is None:
            logger.error(f"Error fetching system prompt for simulation_group_id: {simulation_group_id}")
            return {
                'statusCode': 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error fetching system prompt')
            }

        patient_name, patient_age, patient_prompt, llm_completion = get_patient_details(
            patient_id)
        if patient_name is None or patient_age is None or patient_prompt is None or llm_completion is None:
            return {
                'statusCode': 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error fetching patient details')
            }

        body = {} if event.get("body") is None else json.loads(event.get("body"))
        question = body.get("message_content", "")
        
        logger.info(f"🔍 RAW BODY: {event.get('body')}")
        logger.info(f"🔍 PARSED BODY: {body}")
        logger.info(f"🔍 QUESTION: '{question}'")

        if not question:
            logger.info(f"Start of conversation. Creating conversation history table in DynamoDB.")
            student_query = get_initial_student_query(patient_name)
        else:
            logger.info(f"Processing student question: {question}")
            student_query = get_student_query(question)
            
        logger.info(f"🔍 FINAL STUDENT QUERY: '{student_query}'")
        

        # Check if streaming is requested
        query_params = event.get("queryStringParameters", {})
        stream = query_params.get("stream", "false").lower() == "true"
        
        # ⏱️ CRITICAL: Check remaining time - abort if <10 seconds left
        elapsed = time.time() - start_time
        remaining = context.get_remaining_time_in_millis() / 1000 if hasattr(context, 'get_remaining_time_in_millis') else 30
        if remaining < 10:
            logger.error(f"⏱️ TEXT_GEN: Not enough time remaining ({remaining}s), aborting")
            return {
                'statusCode': 504,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Request timeout - insufficient time remaining')
            }
        
        try:
            logger.info("Creating Bedrock LLM instance.")
            llm = get_bedrock_llm(bedrock_llm_id=BEDROCK_LLM_ID, streaming=stream)
        except (ConnectTimeoutError, ReadTimeoutError) as e:
            logger.error(f"⏱️ TEXT_GEN: Bedrock API timeout: {e}")
            return {
                'statusCode': 504,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Bedrock API timeout - please try again')
            }
        except Exception as e:
            logger.error(f"Error getting LLM from Bedrock: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error getting LLM from Bedrock')
            }

        try:
            logger.info("Retrieving vectorstore config.")
            db_secret = get_secret(DB_SECRET_NAME)
            vectorstore_config_dict = {
                'collection_name': patient_id,
                'dbname': db_secret["dbname"],
                'user': db_secret["username"],
                'password': db_secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': db_secret["port"]
            }
        except Exception as e:
            logger.error(f"Error retrieving vectorstore config: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error retrieving vectorstore config')
            }

        try:
            logger.info("Creating history-aware retriever.")

            history_aware_retriever = get_vectorstore_retriever(
                llm=llm,
                vectorstore_config_dict=vectorstore_config_dict,
                embeddings=embeddings
            )
        except Exception as e:
            logger.error(f"Error creating history-aware retriever: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Error creating history-aware retriever')
            }

        try:
            logger.info("Generating response from the LLM.")
            
            logger.info(f"🚀 CALLING get_response with query: '{student_query}'")
            response = get_response(
                query=student_query,
                patient_name=patient_name,
                llm=llm,
                history_aware_retriever=history_aware_retriever,
                table_name=TABLE_NAME,
                session_id=session_id,
                system_prompt=system_prompt,
                patient_age=patient_age,
                patient_prompt=patient_prompt,
                llm_completion=llm_completion,
                stream=stream
            )
        except (ConnectTimeoutError, ReadTimeoutError) as e:
            logger.error(f"⏱️ TEXT_GEN: Bedrock API timeout during response generation: {e}")
            return {
                'statusCode': 504,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Response generation timeout - please try again')
            }
        except Exception as e:
            logger.error(f"Error getting response: {e}")
            logger.exception("Full error details:")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f'Error getting response: {str(e)}')
            }

        try:
            logger.info("Updating session name if this is the first exchange between the LLM and student")
            potential_session_name = update_session_name(
                TABLE_NAME, session_id, BEDROCK_LLM_ID, patient_name)
            if potential_session_name:
                logger.info("This is the first exchange between the LLM and student. Updating session name.")
                session_name = potential_session_name
            else:
                logger.info("Not the first exchange between the LLM and student. Session name remains the same.")
        except Exception as e:
            logger.error(f"Error updating session name: {e}")
            session_name = "New Chat"
        

        if stream:
            logger.info("Returning streaming response.")
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                "body": json.dumps(response),
                "isBase64Encoded": False
            }
        else:
            logger.info("Returning the generated response.")
            empathy_eval = response.get('empathy_evaluation', None)
            logger.info(f"LLM RESPONSE: {empathy_eval}")
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "*",
                },
                "body": json.dumps({
                    "session_name": session_name,
                    "llm_output": response.get("llm_output", "LLM failed to create response"),
                    "llm_verdict": response.get("llm_verdict", "LLM failed to create verdict"),
                    "empathy_evaluation": response.get("empathy_evaluation", None)
                })
            }
    except Exception as e:
        logger.error(f"❌ TEXT_GEN: Unhandled exception in handler: {e}")
        logger.exception("Full traceback:")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Internal server error')
        }
    finally:
        # 🔴 CRITICAL: Always return connection to the pool
        if connection_obj:
            return_db_connection(connection_obj)

    query_params = event.get("queryStringParameters", {})
    simulation_group_id = query_params.get("simulation_group_id", "")
    session_id = query_params.get("session_id", "")
    patient_id = query_params.get("patient_id", "")
    session_name = query_params.get("session_name", "New Chat")

    if not simulation_group_id or not session_id or not patient_id:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps("Missing required parameters: simulation_group_id, session_id, or patient_id")
        }

    system_prompt = get_system_prompt(simulation_group_id)
    if system_prompt is None:
        logger.error(f"Error fetching system prompt for simulation_group_id: {simulation_group_id}")
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching system prompt')
        }

    patient_name, patient_age, patient_prompt, llm_completion = get_patient_details(
        patient_id)
    if patient_name is None or patient_age is None or patient_prompt is None or llm_completion is None:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error fetching patient details')
        }

    body = {} if event.get("body") is None else json.loads(event.get("body"))
    question = body.get("message_content", "")
    
    logger.info(f"🔍 RAW BODY: {event.get('body')}")
    logger.info(f"🔍 PARSED BODY: {body}")
    logger.info(f"🔍 QUESTION: '{question}'")

    if not question:
        logger.info(f"Start of conversation. Creating conversation history table in DynamoDB.")
        student_query = get_initial_student_query(patient_name)
    else:
        logger.info(f"Processing student question: {question}")
        student_query = get_student_query(question)
        
    logger.info(f"🔍 FINAL STUDENT QUERY: '{student_query}'")
    


    # Check if streaming is requested
    query_params = event.get("queryStringParameters", {})
    stream = query_params.get("stream", "false").lower() == "true"
    
    try:
        logger.info("Creating Bedrock LLM instance.")
        llm = get_bedrock_llm(bedrock_llm_id=BEDROCK_LLM_ID, streaming=stream)
    except Exception as e:
        logger.error(f"Error getting LLM from Bedrock: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error getting LLM from Bedrock')
        }

    try:
        logger.info("Retrieving vectorstore config.")
        db_secret = get_secret(DB_SECRET_NAME)
        vectorstore_config_dict = {
            'collection_name': patient_id,
            'dbname': db_secret["dbname"],
            'user': db_secret["username"],
            'password': db_secret["password"],
            'host': RDS_PROXY_ENDPOINT,
            'port': db_secret["port"]
        }
    except Exception as e:
        logger.error(f"Error retrieving vectorstore config: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error retrieving vectorstore config')
        }

    try:
        logger.info("Creating history-aware retriever.")

        history_aware_retriever = get_vectorstore_retriever(
            llm=llm,
            vectorstore_config_dict=vectorstore_config_dict,
            embeddings=embeddings
        )
    except Exception as e:
        logger.error(f"Error creating history-aware retriever: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Error creating history-aware retriever')
        }

    try:
        logger.info("Generating response from the LLM.")
        
        logger.info(f"🚀 CALLING get_response with query: '{student_query}'")
        response = get_response(
            query=student_query,
            patient_name=patient_name,
            llm=llm,
            history_aware_retriever=history_aware_retriever,
            table_name=TABLE_NAME,
            session_id=session_id,
            system_prompt=system_prompt,
            patient_age=patient_age,
            patient_prompt=patient_prompt,
            llm_completion=llm_completion,
            stream=stream
        )
    except Exception as e:
        logger.error(f"Error getting response: {e}")
        logger.exception("Full error details:")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(f'Error getting response: {str(e)}')
        }

    try:
        logger.info("Updating session name if this is the first exchange between the LLM and student")
        potential_session_name = update_session_name(
            TABLE_NAME, session_id, BEDROCK_LLM_ID, patient_name)
        if potential_session_name:
            logger.info("This is the first exchange between the LLM and student. Updating session name.")
            session_name = potential_session_name
        else:
            logger.info("Not the first exchange between the LLM and student. Session name remains the same.")
    except Exception as e:
        logger.error(f"Error updating session name: {e}")
        session_name = "New Chat"
    
    finally:
        # 🔴 CRITICAL: Always return connection to the pool
        if connection_obj:
            return_db_connection(connection_obj)