import os
import json
import boto3
import logging
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

# Environment Variables
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

# AWS Clients
secrets_manager_client = boto3.client('secretsmanager')

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

def update_ingestion_status():
    """
    Updates the ingestion_status of stuck LLM files from "processing" to "error".
    """
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return False

    try:
        cur = connection.cursor()

        # Fetch filenames before updating
        cur.execute("""
            SELECT filename FROM patient_data WHERE ingestion_status = 'processing';
        """)
        filenames = [row[0] for row in cur.fetchall()]

        cur.execute("""
            UPDATE "patient_data"
            SET ingestion_status = 'error'
            WHERE ingestion_status = 'processing';
        """)
        
        connection.commit()
        cur.close()

        logger.info(f"Updated files to 'error' status: {filenames}")
        return True

    except Exception as e:
        if cur:
            cur.close()
        connection.rollback()
        logger.error(f"Error updating ingestion_status: {e}")
        return False

def lambda_handler(event, context):
    try:
        if update_ingestion_status():
            return {
                'statusCode': 200,
                'body': json.dumps("Successfully updated ingestion_status for stuck LLM files.")
            }
        else:
            return {
                'statusCode': 500,
                'body': json.dumps("Error updating ingestion_status.")
            }

    except Exception as e:
        logger.error(f"Unexpected error in timeout handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error: {str(e)}")
        }

