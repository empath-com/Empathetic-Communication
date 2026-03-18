import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Fn } from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as fs from "fs";
import * as path from "path";

export interface ApiGatewayProps {
  id: string;
  corsOriginEnv: string;
  corsAllowedOrigin: cdk.CfnParameter;
}

export interface ApiGatewayResult {
  api: apigateway.SpecRestApi;
  stageARN: string;
  apiBaseUrl: string;
}

/**
 * Process the OpenAPI file with dynamic CORS substitution
 */
function processOpenAPIFile(corsOrigin: string): string {
  const openAPIPath = path.join(__dirname, "../../OpenAPI_Swagger_Definition.yaml");
  let content = fs.readFileSync(openAPIPath, "utf-8");

  // Log the CORS origin being used
  console.log(`[CDK Build] Processing OpenAPI with CORS origin: ${corsOrigin}`);

  // Replace all instances of !Sub "'${CorsAllowedOrigin}'" with the actual CORS origin
  const beforeCount = (content.match(/!Sub\s+"'\${CorsAllowedOrigin}'"/g) || []).length;
  const inlineCount = (content.match(/!Sub\s+"'\${CorsAllowedOrigin}'"/g) || []).length;
  const totalBefore = beforeCount + inlineCount;

  console.log(`[CDK Build] Found ${beforeCount} multi-line and ${inlineCount} inline instances`);

  // Inline: !Sub "'${CorsAllowedOrigin}'" -> "'*'"
  content = content.replace(
    /!Sub\s+"'\${CorsAllowedOrigin}'"/g,
    `"'${corsOrigin}'"`
  );

  const afterCount = (content.match(/CorsAllowedOrigin/g) || []).length;
  console.log(`[CDK Build] Replaced ${totalBefore} instances. ${afterCount} CorsAllowedOrigin references remaining (should be 0)`);

  if (afterCount === 0) {
    console.log(`[CDK Build] ✓ All CORS parameters successfully replaced`);
  } else {
    console.warn(`[CDK Build] ⚠ Warning: ${afterCount} unreplaced CORS references found`);
  }

  return content;
}

export function createApiGateway(
  scope: cdk.Stack,
  props: ApiGatewayProps
): ApiGatewayResult {
  const { id, corsOriginEnv } = props;

  // Process the OpenAPI file with the CORS origin from environment
  const processedOpenAPIContent = processOpenAPIFile(corsOriginEnv);
  const tempOpenAPIPath = path.join(__dirname, "../../OpenAPI_Swagger_Definition_processed.yaml");
  fs.writeFileSync(tempOpenAPIPath, processedOpenAPIContent);

  // Read OpenAPI file and load file to S3
  const asset = new Asset(scope, "SampleAsset", {
    path: tempOpenAPIPath,
  });

  const data = Fn.transform("AWS::Include", { Location: asset.s3ObjectUrl });

  // Create the API Gateway REST API
  const api = new apigateway.SpecRestApi(scope, `${id}-APIGateway`, {
    apiDefinition: apigateway.AssetApiDefinition.fromInline(data),
    endpointTypes: [apigateway.EndpointType.REGIONAL],
    restApiName: `${id}-API`,
    deploy: true,
    cloudWatchRole: true,
    deployOptions: {
      metricsEnabled: true,
      loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      dataTraceEnabled: true,
      stageName: "prod",
      methodOptions: {
        "/*/*": {
          throttlingRateLimit: 100,
          throttlingBurstLimit: 200,
        },
      },
    },
  });

  // Add CORS support for all origins
  api.addGatewayResponse(`${id}-Default4xxResponse`, {
    type: apigateway.ResponseType.DEFAULT_4XX,
    responseHeaders: {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers":
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
      "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
    },
  });

  api.addGatewayResponse(`${id}-Default5xxResponse`, {
    type: apigateway.ResponseType.DEFAULT_5XX,
    responseHeaders: {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers":
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
      "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
    },
  });

  api.addGatewayResponse(`${id}-UnauthorizedResponse`, {
    type: apigateway.ResponseType.UNAUTHORIZED,
    responseHeaders: {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers":
        "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
      "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
    },
  });

  return {
    api,
    stageARN: api.deploymentStage.stageArn,
    apiBaseUrl: api.urlForPath(),
  };
}

export function createWaf(
  scope: cdk.Stack,
  id: string,
  api: apigateway.SpecRestApi
): void {
  const waf = new wafv2.CfnWebACL(scope, `${id}-waf`, {
    description: "VCI waf",
    scope: "REGIONAL",
    defaultAction: { allow: {} },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: "virtualcareint-firewall",
    },
    rules: [
      {
        name: "AWS-AWSManagedRulesCommonRuleSet",
        priority: 1,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
          },
        },
        overrideAction: { none: {} },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWS-AWSManagedRulesCommonRuleSet",
        },
      },
      {
        name: "LimitRequests1000",
        priority: 2,
        action: {
          block: {},
        },
        statement: {
          rateBasedStatement: {
            limit: 1000,
            aggregateKeyType: "IP",
          },
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "LimitRequests1000",
        },
      },
    ],
  });

  new wafv2.CfnWebACLAssociation(scope, `${id}-waf-association`, {
    resourceArn: `arn:aws:apigateway:${scope.region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`,
    webAclArn: waf.attrArn,
  });
}
