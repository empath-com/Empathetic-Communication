import * as cdk from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { DatabaseStack } from "../database-stack";
import { VpcStack } from "../vpc-stack";

export interface AppSyncStreamingProps {
  id: string;
  userPool: cognito.UserPool;
  db: DatabaseStack;
  vpcStack: VpcStack;
  postgres: lambda.LayerVersion;
  lambdaRole: iam.Role;
}

export interface AppSyncStreamingResult {
  appSyncApi: appsync.GraphqlApi;
}

export function createAppSyncApi(
  scope: cdk.Stack,
  props: AppSyncStreamingProps
): AppSyncStreamingResult {
  const { userPool, db, vpcStack, postgres, lambdaRole } = props;

  // Create AppSync API for text streaming
  const appSyncApi = new appsync.GraphqlApi(scope, "TextStreamingApi", {
    name: "text-streaming-api",
    definition: appsync.Definition.fromFile("lib/schema.graphql"),
    authorizationConfig: {
      defaultAuthorization: {
        authorizationType: appsync.AuthorizationType.USER_POOL,
        userPoolConfig: {
          userPool: userPool,
        },
      },
      additionalAuthorizationModes: [
        {
          authorizationType: appsync.AuthorizationType.IAM,
        },
      ],
    },
  });

  // Create None data source for local resolvers
  const noneDataSource = appSyncApi.addNoneDataSource("NoneDataSource");

  // Mutation resolver for publishing text streams
  noneDataSource.createResolver("PublishTextStreamResolver", {
    typeName: "Mutation",
    fieldName: "publishTextStream",
    requestMappingTemplate: appsync.MappingTemplate.fromString(`
  {
    "version": "2018-05-29",
    "payload": {}
  }`),
    responseMappingTemplate: appsync.MappingTemplate.fromString(`
  $util.toJson({
    "sessionId": $ctx.args.sessionId,
    "data": $ctx.args.data
  })`),
  });

  // Create Lambda function for listing messages by session ID from RDS
  const listMessagesFunction = new lambda.Function(
    scope,
    "ListMessagesBySessionFunction",
    {
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      code: Code.fromInline(`
          const postgres = require('postgres');
          const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
          const smClient = new SecretsManagerClient({});

          let pool;

          const getConnection = async () => {
            if (pool) return pool;

            try {
              const secret = await smClient.send(new GetSecretValueCommand({
                SecretId: '${db.secretPathUser?.secretName}',
              }));

              const { username, password } = JSON.parse(secret.SecretString);

              pool = postgres({
                host: '${db.rdsProxyEndpoint}',
                port: 5432,
                database: 'vci',
                username: username,
                password: password,
                ssl: false,
              });

              return pool;
            } catch (error) {
              console.error('Failed to create connection:', error);
              throw error;
            }
          };

          exports.handler = async (event) => {
            const sessionId = event.arguments.sessionId;

            try {
              const sql = await getConnection();
              const messages = await sql\`
                SELECT message_id, session_id, message_content, student_sent, time_sent
                FROM messages
                WHERE session_id = \${sessionId}
                ORDER BY time_sent ASC
              \`;

              return messages;
            } catch (error) {
              console.error('Error fetching messages:', error);
              throw new Error('Failed to fetch messages');
            }
          };
        `),
      environment: {
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
      },
      vpcSubnets: { subnets: vpcStack.vpc.privateSubnets },
      layers: [postgres],
      role: lambdaRole,
    }
  );

  // Grant the Lambda function access to the secret
  db.secretPathUser?.grantRead(listMessagesFunction);

  const lambdaDataSource = appSyncApi.addLambdaDataSource(
    "ListMessagesDataSource",
    listMessagesFunction
  );

  // Query resolver for listing messages by session
  lambdaDataSource.createResolver("ListMessagesBySessionResolver", {
    typeName: "Query",
    fieldName: "listMessagesBySession",
  });

  // Output the API URL and ID
  new cdk.CfnOutput(scope, "AppSyncApiUrl", {
    value: appSyncApi.graphqlUrl,
  });

  new cdk.CfnOutput(scope, "AppSyncApiId", {
    value: appSyncApi.apiId,
  });

  return { appSyncApi };
}
