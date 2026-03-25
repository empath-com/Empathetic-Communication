import os
import logging
from langchain_aws import ChatBedrock

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def get_bedrock_llm(
    bedrock_llm_id: str,
    temperature: float = 0,
    streaming: bool = False
) -> ChatBedrock:
    """
    Retrieve a Bedrock LLM instance with optional guardrail support and streaming.
    """
    guardrail_id = os.environ.get('BEDROCK_GUARDRAIL_ID')

    deployment_region = os.environ.get('AWS_REGION', 'us-east-1')
    model_lower = bedrock_llm_id.lower()
    if 'nova-pro' in model_lower or 'nova-premier' in model_lower:
        region = 'us-east-1'
    else:
        region = deployment_region

    base_kwargs = {
        "model_id": bedrock_llm_id,
        "model_kwargs": dict(temperature=temperature),
        "streaming": streaming,
        "region_name": region
    }

    if guardrail_id and guardrail_id.strip():
        logger.info(f"Using Bedrock guardrail: {guardrail_id}")
        base_kwargs["guardrails"] = {
            "guardrailIdentifier": guardrail_id,
            "guardrailVersion": "DRAFT"
        }
    else:
        logger.info("Using system prompt protection (no guardrail configured)")

    return ChatBedrock(**base_kwargs)
