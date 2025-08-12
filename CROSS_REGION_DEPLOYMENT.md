# Cross-Region Deployment Guide

This application now supports deployment in any AWS region with cross-region inference for Nova models.

## Key Changes Made

### 1. Environment Variables Added
- `NOVA_REGION`: Set to "us-east-1" (Nova models are only available in us-east-1)
- `DEPLOYMENT_REGION`: Set to the actual deployment region

### 2. Bedrock Policy Updates
- Added cross-region inference permissions for Nova models
- Added `bedrock:InvokeModelWithBidirectionalStream` for Nova Sonic
- Added `bedrock:Converse` and `bedrock:ConverseStream` permissions

### 3. Code Changes
- **Nova Sonic**: Updated to use `NOVA_REGION` environment variable
- **Text Generation Lambda**: Updated to use cross-region inference
- **ECS Socket Stack**: Added region environment variables

## Deployment Instructions

1. Deploy the CDK stack in any supported AWS region:
   ```bash
   cd cdk
   cdk deploy --all --region <your-preferred-region>
   ```

2. The system will automatically:
   - Use your deployment region for most services (RDS, Lambda, etc.)
   - Use us-east-1 for Nova model inference via cross-region calls
   - Handle authentication and permissions correctly

## Supported Regions

The application can be deployed in any AWS region that supports:
- Amazon Bedrock (for Llama and Titan models)
- AWS Lambda
- Amazon RDS
- Amazon ECS

Nova models (Nova Sonic, Nova Pro, Nova Lite) will always use us-east-1 via cross-region inference.

## No Additional Configuration Required

The cross-region setup is automatic - no manual configuration needed. The application will:
- Detect the deployment region automatically
- Route Nova model calls to us-east-1
- Route other Bedrock calls to the deployment region
- Handle all authentication seamlessly

## Cost Considerations

Cross-region inference may incur additional data transfer costs between regions. This is typically minimal for text-based interactions but should be considered for high-volume deployments.