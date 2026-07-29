import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { Construct } from "constructs";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";

// Import construct helpers
import { createLambdaLayers } from "./constructs/lambda-layers";
import { createApiGateway, createWaf } from "./constructs/api-gateway";
import { createCognitoAuth } from "./constructs/cognito-auth";
import { createAuthorizerLambdas } from "./constructs/authorizer-lambdas";
import { createAppSyncApi } from "./constructs/appsync-streaming";
import { createBusinessLambdas } from "./constructs/business-lambdas";
import { createMonitoring } from "./constructs/monitoring";

export class ApiServiceStack extends cdk.Stack {
  private readonly api: apigateway.SpecRestApi;
  public readonly appClient: cognito.UserPoolClient;
  public readonly userPool: cognito.UserPool;
  public readonly identityPool: cognito.CfnIdentityPool;
  private readonly layerList: { [key: string]: LayerVersion };
  public readonly stageARN_APIGW: string;
  public readonly apiGW_basedURL: string;
  public readonly secret: secretsmanager.ISecret;
  public readonly appSyncApi: appsync.GraphqlApi;
  public getEndpointUrl = () => this.api.url;
  public getUserPoolId = () => this.userPool.userPoolId;
  public getUserPoolClientId = () => this.appClient.userPoolClientId;
  public getIdentityPoolId = () => this.identityPool.ref;
  public addLayer = (name: string, layer: LayerVersion) =>
    (this.layerList[name] = layer);
  public getLayers = () => this.layerList;

  constructor(
    scope: Construct,
    id: string,
    db: DatabaseStack,
    vpcStack: VpcStack,
    ecsSocketStack: any = null,
    idleMode: boolean = false,
    simulatedRole: string = "patient",
    practitionerRole: string = "pharmacist",
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // CORS configuration parameter and environment variable
    const corsAllowedOrigin = new cdk.CfnParameter(this, "corsAllowedOrigin", {
      type: "String",
      default: "*",
      description: "Allowed origin for CORS requests (default: *)",
    });

    const nodeLogLevel = new cdk.CfnParameter(this, "nodeLogLevel", {
      type: "String",
      default: "info",
      description: "Node service log level (error|warn|info|debug)",
      allowedValues: ["error", "warn", "info", "debug"],
    });

    // Get CORS origin from environment variable or parameter (default: *)
    const corsOriginEnv = process.env.CORS_ALLOWED_ORIGIN || "*";

    // 1. Create Lambda layers
    const layers = createLambdaLayers(this, id);
    this.layerList = layers.layerList;

    // 2. Create API Gateway
    const apiGw = createApiGateway(this, {
      id,
      corsOriginEnv,
      corsAllowedOrigin,
    });
    this.api = apiGw.api;
    this.stageARN_APIGW = apiGw.stageARN;
    this.apiGW_basedURL = apiGw.apiBaseUrl;

    // 3. Create Cognito auth (user pool, identity pool, roles, trigger lambdas)
    const auth = createCognitoAuth(this, {
      id,
      db,
      vpcStack,
      apiRestApiId: this.api.restApiId,
      postgres: layers.postgres,
    });
    this.userPool = auth.userPool;
    this.appClient = auth.appClient;
    this.identityPool = auth.identityPool;
    this.secret = auth.secret;

    // 4. Create AppSync API for text streaming
    const appSync = createAppSyncApi(this, {
      id,
      userPool: this.userPool,
      db,
      vpcStack,
      postgres: layers.postgres,
      lambdaRole: auth.lambdaRole,
    });
    this.appSyncApi = appSync.appSyncApi;

    // 5. Create business Lambda functions
    const business = createBusinessLambdas(this, {
      id,
      db,
      vpcStack,
      apiRestApiId: this.api.restApiId,
      lambdaRole: auth.lambdaRole,
      postgres: layers.postgres,
      psycopgLayer: layers.psycopgLayer,
      powertoolsLayer: layers.powertoolsLayer,
      corsAllowedOrigin,
      appSyncApi: this.appSyncApi,
      simulatedRole,
      practitionerRole,
      nodeLogLevel,
    });

    // Set USER_POOL environment on student and instructor functions
    business.studentFn.addEnvironment("USER_POOL", this.userPool.userPoolId);
    business.instructorFn.addEnvironment("USER_POOL", this.userPool.userPoolId);

    // 6. Create authorizer Lambda functions
    createAuthorizerLambdas(this, {
      id,
      vpcStack,
      secret: this.secret,
      jwt: layers.jwt,
      lambdaRole: auth.lambdaRole,
    });

    // 7. Create monitoring (log groups, metric filters, alarms, EventBridge)
    createMonitoring(this, {
      id,
      db,
      vpcStack,
      dataIngestFn: business.dataIngestFn,
      psycopgLayer: layers.psycopgLayer,
      powertoolsLayer: layers.powertoolsLayer,
      lambdaRole: auth.lambdaRole,
    });

    // 8. WAF Firewall -- skipped in idle mode to eliminate the per-WebACL fixed cost
    if (idleMode) return;
    createWaf(this, id, this.api);
  }
}
