import os
import json
import boto3
import psycopg2
from aws_lambda_powertools import Logger

logger = Logger()

s3 = boto3.client('s3')
BUCKET = os.environ["BUCKET"]
DB_SECRET_NAME = os.environ["SM_DB_CREDENTIALS"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]

# AWS Clients
secrets_manager_client = boto3.client('secretsmanager')

# Global variables for caching
connection = None
db_secret = None

def get_secret():
    global db_secret
    if not db_secret:
        response = secrets_manager_client.get_secret_value(SecretId=DB_SECRET_NAME)["SecretString"]
        db_secret = json.loads(response)
    return db_secret

def connect_to_db():
    global connection
    if connection is None or connection.closed:
        try:
            secret = get_secret()
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

def delete_file_from_db(patient_id, file_name, file_type):
    connection = connect_to_db()
    if connection is None:
        logger.error("No database connection available.")
        return {
            "statusCode": 500,
            "body": json.dumps("Database connection failed.")
        }
    
    try:
        cur = connection.cursor()

        delete_query = """
            DELETE FROM "patient_data" 
            WHERE patient_id = %s AND filename = %s AND filetype = %s;
        """
        cur.execute(delete_query, (patient_id, file_name, file_type))

        connection.commit()
        logger.info(f"Successfully deleted file {file_name}.{file_type} for patient {patient_id}.")

        cur.close()
    except Exception as e:
        if cur:
            cur.close()
        connection.rollback()
        logger.error(f"Error deleting file {file_name}.{file_type} from database: {e}")
        raise

@logger.inject_lambda_context
def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})

    simulation_group_id = query_params.get("simulation_group_id", "")
    patient_id = query_params.get("patient_id", "")
    file_name = query_params.get("file_name", "")
    file_type = query_params.get("file_type", "")
    folder_type = query_params.get("folder_type", "")

    if not simulation_group_id or not patient_id or not file_name or not file_type or not folder_type:
        logger.error("Missing required parameters", extra={
            "simulation_group_id": simulation_group_id,
            "patient_id": patient_id,
            "file_name": file_name,
            "file_type": file_type,
            "folder_type": folder_type
        })
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Missing required parameters: simulation_group_id, patient_id, file_name, file_type, or folder_type')
        }

    try:
        # Allowed file types for documents
        allowed_document_types = {"pdf", "docx", "pptx", "txt", "xlsx", "xps", "mobi", "cbz"}
        
        # Allowed file types for information
        allowed_generic_types = {
            'pdf', 'docx', 'pptx', 'txt', 'xlsx', 'xps', 'mobi', 'cbz',
            'bmp', 'eps', 'gif', 'icns', 'ico', 'im', 'jpeg', 'jpg', 'j2k', 'jp2', 'msp',
            'pcx', 'png', 'ppm', 'pgm', 'pbm', 'sgi', 'tga', 'tiff', 'tif', 'webp', 'xbm'
        }

        objects_to_delete = []

        # Determine the folder based on the file type
        if folder_type == "documents" and file_type in allowed_document_types:
            objects_to_delete.append({"Key": f"{simulation_group_id}/{patient_id}/documents/{file_name}.{file_type}"})
        elif folder_type == "info" and file_type in allowed_generic_types:
            objects_to_delete.append({"Key": f"{simulation_group_id}/{patient_id}/info/{file_name}.{file_type}"})
        elif folder_type == "answer_key" and file_type in allowed_generic_types:
            objects_to_delete.append({"Key": f"{simulation_group_id}/{patient_id}/answer_key/{file_name}.{file_type}"})
        else:
            return {
                'statusCode': 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps('Unsupported file type')
            }

        # Delete the file from S3
        response = s3.delete_objects(
            Bucket=BUCKET,
            Delete={
                "Objects": objects_to_delete,
                "Quiet": True,
            },
        )
        
        logger.info(f"S3 Response: {response}")
        logger.info(f"File {file_name}.{file_type} and any associated files deleted successfully from S3.")

        # Delete the file from the database
        try:
            delete_file_from_db(patient_id, file_name, file_type)
            logger.info(f"File {file_name}.{file_type} deleted from the database.")
        except Exception as e:
            logger.error(f"Error deleting file {file_name}.{file_type} from the database: {e}")
            return {
                'statusCode': 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f"Error deleting file {file_name}.{file_type} from the database")
            }

        return {
            'statusCode': 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('File deleted successfully')
        }
        
    except Exception as e:
        logger.exception(f"Error deleting file: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": "https://empath-ai.pharmsci.ubc.ca",
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps('Internal server error')
        }

