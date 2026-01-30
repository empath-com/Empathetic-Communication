import os
import json
import boto3
from botocore.config import Config
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

# Environment variables
REGION = os.environ["REGION"]
BUCKET = os.environ["BUCKET"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

# AWS Clients
secrets_manager_client = boto3.client('secretsmanager')

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(
        s3={"addressing_style": "virtual"}, region_name=REGION, signature_version="s3v4"
    ),
)

# Global variables for caching
connection = None
db_secret = None

def get_secret(secret_name):
    global db_secret
    if db_secret is None:
        try:
            response = secrets_manager_client.get_secret_value(SecretId=secret_name)["SecretString"]
            db_secret = json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON for secret {secret_name}: {e}")
            raise ValueError(f"Secret {secret_name} is not properly formatted as JSON.")
        except Exception as e:
            logger.error(f"Error fetching secret {secret_name}: {e}")
            raise
    return db_secret

def connect_to_db():
    global connection
    if connection is None or connection.closed:
        try:
            secret = get_secret(DB_SECRET_NAME)
            connection_params = {
                'dbname': secret["dbname"],
                'user': secret["username"],
                'password': secret["password"],
                'host': RDS_PROXY_ENDPOINT,
                'port': secret["port"]
            }
            connection_string = " ".join([f"{key}={value}" for key, value in connection_params.items()])
            connection = psycopg2.connect(connection_string)
            logger.info("Connected to the database!")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            if connection:
                connection.rollback()
                connection.close()
            raise
    return connection

def fetch_patient_ids(simulation_group_id):
    connection = connect_to_db()
    if not connection:
        logger.error("No database connection available.")
        return []

    try:
        cur = connection.cursor()
        query = """
            SELECT patient_id
            FROM patients
            WHERE simulation_group_id = %s;
        """
        cur.execute(query, (simulation_group_id,))
        patient_ids = [row[0] for row in cur.fetchall()]
        cur.close()
        
        return patient_ids
    except Exception as e:
        logger.error(f"Error fetching patient IDs: {e}")
        if cur:
            cur.close()
        connection.rollback()
        return []

def generate_presigned_url(bucket, key):
    try:
        return s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=300,
            HttpMethod="GET",
        )
    except Exception as e:
        logger.exception(f"Error generating presigned URL for {key}: {e}")
        return None

@logger.inject_lambda_context
def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})
    simulation_group_id = query_params.get("simulation_group_id")

    if not simulation_group_id:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps("Missing required parameter: simulation_group_id"),
        }

    # Get patient_ids from database
    patient_ids = fetch_patient_ids(simulation_group_id)

    if not patient_ids:
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps("No patient IDs found"),
        }

    profile_pics = {}
    for patient_id in patient_ids:
        key = f"{simulation_group_id}/{patient_id}/profile_picture/{patient_id}_profile_pic.png"
        url = generate_presigned_url(BUCKET, key)
        if url:
            profile_pics[patient_id] = url

    return {
        'statusCode': 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
            "Access-Control-Allow-Methods": "*",
        },
        'body': json.dumps(profile_pics)
    }

