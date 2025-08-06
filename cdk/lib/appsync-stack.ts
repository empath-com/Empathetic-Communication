import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ApiGatewayStack } from './api-gateway-stack';

export class AppSyncStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, apiStack: ApiGatewayStack, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = apiStack.userPool;

    // Create AppSync API
    this.api = new appsync.GraphqlApi(this, 'TextStreamingApi', {
      name: 'text-streaming-api',
      schema: appsync.SchemaFile.fromAsset('lib/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: userPool,
          },
        },
        additionalAuthorizationModes: [{
          authorizationType: appsync.AuthorizationType.IAM,
        }],
      },
    });

    // Create None data source for local resolvers
    const noneDataSource = this.api.addNoneDataSource('NoneDataSource');

    // Mutation resolver for publishing text streams
    noneDataSource.createResolver('PublishTextStreamResolver', {
      typeName: 'Mutation',
      fieldName: 'publishTextStream',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "payload": {
            "sessionId": "$ctx.args.sessionId",
            "data": "$ctx.args.data"
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        $util.toJson($ctx.result)
      `),
    });

    // Output the API URL and ID
    new cdk.CfnOutput(this, 'AppSyncApiUrl', {
      value: this.api.graphqlUrl,
    });

    new cdk.CfnOutput(this, 'AppSyncApiId', {
      value: this.api.apiId,
    });

    // Create SSM parameter with AppSync GraphQL URL
    new ssm.StringParameter(this, 'AppSyncUrlParameter', {
      parameterName: '/EC-Api/VCI/AppSyncUrl',
      description: 'AppSync GraphQL URL for streaming',
      stringValue: this.api.graphqlUrl,
    });
  }
}