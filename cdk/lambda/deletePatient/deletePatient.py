import os
import json
import boto3
from aws_lambda_powertools import Logger

logger = Logger()

s3 = boto3.client('s3')
BUCKET = os.environ["BUCKET"]
CORS_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "*")

@logger.inject_lambda_context
def lambda_handler(event, context):
    query_params = event.get("queryStringParameters", {})
    simulation_group_id = query_params.get("simulation_group_id", "")
    patient_id = query_params.get("patient_id", "")

    if not simulation_group_id or not patient_id:
        logger.error("Missing required parameters", extra={
            "simulation_group_id": simulation_group_id,
            "patient_id": patient_id
        })
        return {
            'statusCode': 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps("Missing required parameters: simulation_group_id or patient_id")
        }

    try:
        # Define the prefix for the patient’s files
        patient_prefix = f"{simulation_group_id}/{patient_id}/"

        objects_to_delete = []
        continuation_token = None

        # Fetch all objects in the patient's directory, handling pagination
        while True:
            if continuation_token:
                response = s3.list_objects_v2(
                    Bucket=BUCKET,
                    Prefix=patient_prefix,
                    ContinuationToken=continuation_token
                )
            else:
                response = s3.list_objects_v2(Bucket=BUCKET, Prefix=patient_prefix)

            if 'Contents' in response:
                objects_to_delete.extend([{'Key': obj['Key']} for obj in response['Contents']])

            # Check if there's more data to fetch
            if response.get('IsTruncated'):
                continuation_token = response.get('NextContinuationToken')
            else:
                break

        if objects_to_delete:
            # Delete all objects in the patient's directory
            delete_response = s3.delete_objects(
                Bucket=BUCKET,
                Delete={'Objects': objects_to_delete}
            )
            logger.info(f"Deleted objects: {delete_response}")
            return {
                'statusCode': 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f"Deleted patient directory: {patient_prefix}")
            }
        else:
            logger.info(f"No objects found in patient directory: {patient_prefix}")
            return {
                'statusCode': 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
                    "Access-Control-Allow-Methods": "*",
                },
                'body': json.dumps(f"No objects found in patient directory: {patient_prefix}")
            }

    except Exception as e:
        logger.exception(f"Error deleting patient directory: {e}")
        return {
            'statusCode': 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
                "Access-Control-Allow-Methods": "*",
            },
            'body': json.dumps(f"Internal server error: {str(e)}")
        }

