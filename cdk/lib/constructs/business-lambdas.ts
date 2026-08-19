import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { Duration } from "aws-cdk-lib";
import { DatabaseStack } from "../database-stack";
import { VpcStack } from "../vpc-stack";

export interface BusinessLambdasProps {
  id: string;
  db: DatabaseStack;
  vpcStack: VpcStack;
  apiRestApiId: string;
  lambdaRole: iam.Role;
  postgres: lambda.LayerVersion;
  psycopgLayer: lambda.LayerVersion;
  powertoolsLayer: lambda.ILayerVersion;
  corsAllowedOrigin: cdk.CfnParameter;
  appSyncApi: appsync.GraphqlApi;
  simulatedRole: string;
  practitionerRole: string;
  nodeLogLevel: cdk.CfnParameter;
}

export interface BusinessLambdasResult {
  studentFn: lambda.Function;
  instructorFn: lambda.Function;
  adminFn: lambda.Function;
  textGenFn: lambda.DockerImageFunction;
  dataIngestFn: lambda.DockerImageFunction;
  embeddingStorageBucket: s3.Bucket;
  dataIngestionBucket: s3.Bucket;
  bedrockLLMParameter: ssm.StringParameter;
  embeddingModelParameter: ssm.StringParameter;
  tableNameParameter: ssm.StringParameter;
}

export function createBusinessLambdas(
  scope: cdk.Stack,
  props: BusinessLambdasProps
): BusinessLambdasResult {
  const {
    id,
    db,
    vpcStack,
    apiRestApiId,
    lambdaRole,
    postgres,
    psycopgLayer,
    powertoolsLayer,
    corsAllowedOrigin,
    appSyncApi,
    simulatedRole,
    practitionerRole,
    nodeLogLevel,
  } = props;

  // S3 Buckets
  const embeddingStorageBucket = new s3.Bucket(
    scope,
    `${id}-embeddingStorageBucket`,
    {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    }
  );

  const dataIngestionBucket = new s3.Bucket(
    scope,
    `${id}-DataIngestionBucket`,
    {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    }
  );

  // SSM Parameters
  const bedrockLLMParameter = new ssm.StringParameter(
    scope,
    "BedrockLLMParameter",
    {
      parameterName: `/${id}/VCI/BedrockLLMId`,
      description: "Parameter containing the Bedrock LLM ID",
      stringValue: "meta.llama3-70b-instruct-v1:0",
    }
  );

  const embeddingModelParameter = new ssm.StringParameter(
    scope,
    "EmbeddingModelParameter",
    {
      parameterName: `/${id}/VCI/EmbeddingModelId`,
      description: "Parameter containing the Embedding Model ID",
      stringValue: "amazon.titan-embed-text-v2:0",
    }
  );

  const tableNameParameter = new ssm.StringParameter(
    scope,
    "TableNameParameter",
    {
      parameterName: `/${id}/VCI/TableName`,
      description: "Parameter containing the DynamoDB table name",
      stringValue: "DynamoDB-Conversation-Table",
    }
  );

  // Student Lambda
  const lambdaStudentFunction = new lambda.Function(
    scope,
    `${id}-studentFunction`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "studentFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        USER_POOL: "", // Will be set by orchestrator
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
        LOG_LEVEL: nodeLogLevel.valueAsString,
      },
      functionName: `${id}-studentFunction`,
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    }
  );

  lambdaStudentFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student*`,
  });

  const cfnLambda_student = lambdaStudentFunction.node
    .defaultChild as lambda.CfnFunction;
  cfnLambda_student.overrideLogicalId("studentFunction");

  // Instructor Lambda
  const lambdaInstructorFunction = new lambda.Function(
    scope,
    `${id}-instructorFunction`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "instructorFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        USER_POOL: "", // Will be set by orchestrator
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
        LOG_LEVEL: nodeLogLevel.valueAsString,
      },
      functionName: `${id}-instructorFunction`,
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    }
  );

  lambdaInstructorFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  const cfnLambda_Instructor = lambdaInstructorFunction.node
    .defaultChild as lambda.CfnFunction;
  cfnLambda_Instructor.overrideLogicalId("instructorFunction");

  // Admin Lambda
  const lambdaAdminFunction = new lambda.Function(
    scope,
    `${id}-adminFunction`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "adminFunction/adminFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
        LOG_LEVEL: nodeLogLevel.valueAsString,
      },
      functionName: `${id}-adminFunction`,
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    }
  );

  lambdaAdminFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/admin*`,
  });

  const cfnLambda_Admin = lambdaAdminFunction.node
    .defaultChild as lambda.CfnFunction;
  cfnLambda_Admin.overrideLogicalId("adminFunction");

  // Grant admin Lambda access to SSM Parameter Store for Bedrock LLM ID
  lambdaAdminFunction.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [bedrockLLMParameter.parameterArn],
    })
  );

  // Custom policy statement for Bedrock access (shared by admin and text gen functions)
  const bedrockPolicyStatement = new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:InvokeEndpoint",
      "bedrock:ApplyGuardrail",
    ],
    resources: [
      "arn:aws:bedrock:" +
      scope.region +
      "::foundation-model/meta.llama3-70b-instruct-v1:0",
      "arn:aws:bedrock:" +
      scope.region +
      "::foundation-model/amazon.titan-embed-text-v2:0",
      "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0",
      "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
      "arn:aws:bedrock:" + scope.region + "::foundation-model/amazon.nova-lite-v1:0",
      "arn:aws:bedrock:ca-west-1::foundation-model/amazon.nova-lite-v1:0",
      `arn:aws:bedrock:${scope.region}:${scope.account}:inference-profile/ca.amazon.nova-lite-v1:0`,
      `arn:aws:bedrock:${scope.region}:${scope.account}:guardrail/*`,
    ],
  });

  // Add Bedrock policy to admin function for AI analytics
  lambdaAdminFunction.addToRolePolicy(bedrockPolicyStatement);

  // Text Generation Docker Lambda
  const textGenLambdaDockerFunc = new lambda.DockerImageFunction(
    scope,
    `${id}-TextGenLambdaDockerFunction`,
    {
      code: lambda.DockerImageCode.fromImageAsset(".", {
        file: "text_generation/Dockerfile",
        platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(300),
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      architecture: lambda.Architecture.X86_64,
      functionName: `${id}-TextGenLambdaDockerFunction`,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathAdminName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        REGION: scope.region,
        BEDROCK_LLM_PARAM: bedrockLLMParameter.parameterName,
        EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
        TABLE_NAME_PARAM: tableNameParameter.parameterName,
        BEDROCK_GUARDRAIL_ID: "",
        APPSYNC_GRAPHQL_URL: appSyncApi.graphqlUrl,
        APPSYNC_API_ID: appSyncApi.apiId,
        BEDROCK_TIMEOUT_SECONDS: "90",
        CONVERSATION_ANALYTICS_MODEL_ID: "ca.amazon.nova-lite-v1:0",
        SIMULATED_ROLE: simulatedRole,
        PRACTITIONER_ROLE: practitionerRole,
      },
    }
  );

  // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
  const cfnTextGenDockerFunc = textGenLambdaDockerFunc.node
    .defaultChild as lambda.CfnFunction;
  cfnTextGenDockerFunc.overrideLogicalId("TextGenLambdaDockerFunc");

  textGenLambdaDockerFunc.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student*`,
  });

  // Allow the function to self-invoke for async handoff
  textGenLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: ["*"],
    })
  );


  textGenLambdaDockerFunc.addToRolePolicy(bedrockPolicyStatement);

  // Grant access to Secret Manager
  textGenLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  // Grant access to DynamoDB actions
  textGenLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "dynamodb:ListTables",
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
      ],
      resources: [`arn:aws:dynamodb:${scope.region}:${scope.account}:table/*`],
    })
  );

  // Grant access to SSM Parameter Store for specific parameters
  textGenLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [
        bedrockLLMParameter.parameterArn,
        embeddingModelParameter.parameterArn,
        tableNameParameter.parameterArn,
      ],
    })
  );

  // Grant access to AppSync for streaming with comprehensive permissions
  textGenLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "appsync:GraphQL",
        "appsync:GetGraphqlApi",
        "appsync:ListGraphqlApis",
      ],
      resources: [
        appSyncApi.arn,
        appSyncApi.arn + "/*",
        appSyncApi.arn + "/types/Mutation/fields/publishTextStream",
      ],
    })
  );

  // Allow the student Lambda to invoke the text gen Lambda for empathy backfill
  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [textGenLambdaDockerFunc.functionArn],
    })
  );

  // Pass the text gen function name so the student Lambda can invoke it for backfill
  lambdaStudentFunction.addEnvironment(
    "TEXT_GEN_FUNCTION_NAME",
    textGenLambdaDockerFunc.functionName
  );
  lambdaAdminFunction.addEnvironment(
    "TEXT_GEN_FUNCTION_NAME",
    textGenLambdaDockerFunc.functionName
  );

  // Generate PreSigned URL Lambda
  const generatePreSignedURL = new lambda.Function(
    scope,
    `${id}-GeneratePreSignedURLFunction`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/generatePreSignedURL"),
      handler: "generatePreSignedURL.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      environment: {
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
      },
      functionName: `${id}-GeneratePreSignedURLFunction`,
      layers: [powertoolsLayer],
    }
  );

  const cfnGeneratePreSignedURL = generatePreSignedURL.node
    .defaultChild as lambda.CfnFunction;
  cfnGeneratePreSignedURL.overrideLogicalId("GeneratePreSignedURLFunc");

  dataIngestionBucket.grantReadWrite(generatePreSignedURL);
  generatePreSignedURL.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject"],
      resources: [
        dataIngestionBucket.bucketArn,
        `${dataIngestionBucket.bucketArn}/*`,
      ],
    })
  );

  generatePreSignedURL.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  // Data Ingestion Docker Lambda
  const dataIngestLambdaDockerFunc = new lambda.DockerImageFunction(
    scope,
    `${id}-DataIngestLambdaDockerFunction`,
    {
      code: lambda.DockerImageCode.fromImageAsset("./data_ingestion", {
        platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
      }),
      memorySize: 3008,
      timeout: cdk.Duration.seconds(900),
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      functionName: `${id}-DataIngestLambdaDockerFunction`,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathAdminName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        EMBEDDING_BUCKET_NAME: embeddingStorageBucket.bucketName,
        EMBEDDING_MODEL_PARAM: embeddingModelParameter.parameterName,
      },
    }
  );

  const cfnDataIngestLambdaDockerFunc = dataIngestLambdaDockerFunc.node
    .defaultChild as lambda.CfnFunction;
  cfnDataIngestLambdaDockerFunc.overrideLogicalId(
    "DataIngestLambdaDockerFunc"
  );

  dataIngestionBucket.grantRead(dataIngestLambdaDockerFunc);

  dataIngestLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: [dataIngestionBucket.bucketArn],
    })
  );

  dataIngestLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:ListBucket"],
      resources: [embeddingStorageBucket.bucketArn],
    })
  );

  dataIngestLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:HeadObject",
      ],
      resources: [
        `arn:aws:s3:::${embeddingStorageBucket.bucketName}/*`,
      ],
    })
  );

  dataIngestLambdaDockerFunc.addToRolePolicy(bedrockPolicyStatement);

  dataIngestLambdaDockerFunc.addEventSource(
    new lambdaEventSources.S3EventSource(dataIngestionBucket, {
      events: [
        s3.EventType.OBJECT_CREATED,
        s3.EventType.OBJECT_REMOVED,
        s3.EventType.OBJECT_RESTORE_COMPLETED,
      ],
    })
  );

  dataIngestLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  dataIngestLambdaDockerFunc.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [embeddingModelParameter.parameterArn],
    })
  );

  // GetFiles Lambda (instructor)
  const getFilesFunction = new lambda.Function(
    scope,
    `${id}-GetFilesFunction`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/getFilesFunction"),
      handler: "getFilesFunction.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-GetFilesFunction`,
      layers: [psycopgLayer, powertoolsLayer],
    }
  );

  const cfnGetFilesFunction = getFilesFunction.node
    .defaultChild as lambda.CfnFunction;
  cfnGetFilesFunction.overrideLogicalId("GetFilesFunction");

  dataIngestionBucket.grantRead(getFilesFunction);

  getFilesFunction.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  getFilesFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  // GetFiles Lambda (student)
  const getFilesFunctionStudent = new lambda.Function(
    scope,
    `${id}-GetFilesFunctionStudent`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/getFilesFunction"),
      handler: "getFilesFunction.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-GetFilesFunctionStudent`,
      layers: [psycopgLayer, powertoolsLayer],
    }
  );

  const cfnGetFilesFunctionStudent = getFilesFunctionStudent.node
    .defaultChild as lambda.CfnFunction;
  cfnGetFilesFunctionStudent.overrideLogicalId("GetFilesFunctionStudent");

  dataIngestionBucket.grantRead(getFilesFunctionStudent);

  getFilesFunctionStudent.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  getFilesFunctionStudent.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student*`,
  });

  // GetProfilePictures Lambda (instructor)
  const getProfilePictures = new lambda.Function(
    scope,
    `${id}-GetProfilePictures`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/getProfilePictures"),
      handler: "getProfilePictures.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-GetProfilePictures`,
      layers: [psycopgLayer, powertoolsLayer],
    }
  );

  const cfnGetProfilePictures = getProfilePictures.node
    .defaultChild as lambda.CfnFunction;
  cfnGetProfilePictures.overrideLogicalId("GetProfilePictures");

  dataIngestionBucket.grantRead(getProfilePictures);

  getProfilePictures.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  getProfilePictures.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  // GetProfilePictures Lambda (student)
  const getProfilePicturesStudent = new lambda.Function(
    scope,
    `${id}-GetProfilePicturesStudent`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/getProfilePictures"),
      handler: "getProfilePictures.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-GetProfilePicturesStudent`,
      layers: [psycopgLayer, powertoolsLayer],
    }
  );

  const cfnGetProfilePicturesStudent = getProfilePicturesStudent.node
    .defaultChild as lambda.CfnFunction;
  cfnGetProfilePicturesStudent.overrideLogicalId("GetProfilePicturesStudent");

  dataIngestionBucket.grantRead(getProfilePicturesStudent);

  getProfilePicturesStudent.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  getProfilePicturesStudent.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student*`,
  });

  // DeleteFile Lambda
  const deleteFile = new lambda.Function(scope, `${id}-DeleteFileFunction`, {
    runtime: lambda.Runtime.PYTHON_3_12,
    code: lambda.Code.fromAsset("lambda/deleteFile"),
    handler: "deleteFile.lambda_handler",
    timeout: Duration.seconds(300),
    memorySize: 256,
    vpc: vpcStack.vpc,
    securityGroups: [db.lambdaSecurityGroup],
    environment: {
      SM_DB_CREDENTIALS: db.secretPathUser.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
      BUCKET: dataIngestionBucket.bucketName,
      REGION: scope.region,
      CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
    },
    functionName: `${id}-DeleteFileFunction`,
    layers: [psycopgLayer, powertoolsLayer],
  });

  const cfndeleteFile = deleteFile.node.defaultChild as lambda.CfnFunction;
  cfndeleteFile.overrideLogicalId("DeleteFileFunc");

  dataIngestionBucket.grantDelete(deleteFile);

  deleteFile.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  deleteFile.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  // DeletePatient Lambda
  const deletePatientFunction = new lambda.Function(
    scope,
    `${id}-DeletePatientFunction`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/deletePatient"),
      handler: "deletePatient.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      environment: {
        BUCKET: dataIngestionBucket.bucketName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-DeletePatientFunction`,
      layers: [powertoolsLayer],
    }
  );

  const cfnDeletePatientFunction = deletePatientFunction.node
    .defaultChild as lambda.CfnFunction;
  cfnDeletePatientFunction.overrideLogicalId("DeletePatientFunc");

  dataIngestionBucket.grantRead(deletePatientFunction);
  dataIngestionBucket.grantDelete(deletePatientFunction);

  deletePatientFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor*`,
  });

  // DeleteLastMessage Lambda
  const deleteLastMessage = new lambda.Function(
    scope,
    `${id}-DeleteLastMessage`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/deleteLastMessage"),
      handler: "deleteLastMessage.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        TABLE_NAME_PARAM: tableNameParameter.parameterName,
        REGION: scope.region,
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
      functionName: `${id}-DeleteLastMessage`,
      layers: [psycopgLayer, powertoolsLayer],
    }
  );

  const cfnDeleteLastMessage = deleteLastMessage.node
    .defaultChild as lambda.CfnFunction;
  cfnDeleteLastMessage.overrideLogicalId("DeleteLastMessage");

  deleteLastMessage.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  deleteLastMessage.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [`arn:aws:dynamodb:${scope.region}:${scope.account}:table/*`],
    })
  );

  deleteLastMessage.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student*`,
  });

  deleteLastMessage.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [tableNameParameter.parameterArn],
    })
  );

  return {
    studentFn: lambdaStudentFunction,
    instructorFn: lambdaInstructorFunction,
    adminFn: lambdaAdminFunction,
    textGenFn: textGenLambdaDockerFunc,
    dataIngestFn: dataIngestLambdaDockerFunc,
    embeddingStorageBucket,
    dataIngestionBucket,
    bedrockLLMParameter,
    embeddingModelParameter,
    tableNameParameter,
  };
}
