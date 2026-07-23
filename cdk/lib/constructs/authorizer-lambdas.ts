import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Duration } from "aws-cdk-lib";
import { VpcStack } from "../vpc-stack";

export interface AuthorizerLambdasProps {
  id: string;
  vpcStack: VpcStack;
  secret: secretsmanager.ISecret;
  jwt: lambda.LayerVersion;
  lambdaRole: iam.Role;
}

export interface AuthorizerLambdasResult {
  adminAuthorizer: lambda.Function;
  studentAuthorizer: lambda.Function;
  instructorAuthorizer: lambda.Function;
}

export function createAuthorizerLambdas(
  scope: cdk.Stack,
  props: AuthorizerLambdasProps
): AuthorizerLambdasResult {
  const { id, vpcStack, secret, jwt, lambdaRole } = props;

  // Create Lambda for Admin Authorization endpoints
  const authorizationFunction = new lambda.Function(
    scope,
    `${id}-admin-authorization-api-gateway`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "adminAuthorizerFunction/adminAuthorizerFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      environment: {
        SM_COGNITO_CREDENTIALS: secret.secretName,
      },
      functionName: `${id}-adminLambdaAuthorizer`,
      memorySize: 256,
      layers: [jwt],
      role: lambdaRole,
    }
  );

  // Add the permission to the Lambda function's policy to allow API Gateway access
  authorizationFunction.grantInvoke(
    new iam.ServicePrincipal("apigateway.amazonaws.com")
  );

  // Change Logical ID to match the one decleared in YAML file of Open API
  const apiGW_authorizationFunction = authorizationFunction.node
    .defaultChild as lambda.CfnFunction;
  apiGW_authorizationFunction.overrideLogicalId("adminLambdaAuthorizer");

  // Create Lambda for Student Authorization endpoints
  const authorizationFunction_student = new lambda.Function(
    scope,
    `${id}-student-authorization-api-gateway`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "studentAuthorizerFunction/studentAuthorizerFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      environment: {
        SM_COGNITO_CREDENTIALS: secret.secretName,
      },
      functionName: `${id}-studentLambdaAuthorizer`,
      memorySize: 256,
      layers: [jwt],
      role: lambdaRole,
    }
  );

  // Add the permission to the Lambda function's policy to allow API Gateway access
  authorizationFunction_student.grantInvoke(
    new iam.ServicePrincipal("apigateway.amazonaws.com")
  );

  // Change Logical ID to match the one decleared in YAML file of Open API
  const apiGW_authorizationFunction_student = authorizationFunction_student
    .node.defaultChild as lambda.CfnFunction;
  apiGW_authorizationFunction_student.overrideLogicalId(
    "studentLambdaAuthorizer"
  );

  // Create Lambda for Instructor Authorization endpoints
  const authorizationFunction_instructor = new lambda.Function(
    scope,
    `${id}-instructor-authorization-api-gateway`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "instructorAuthorizerFunction/instructorAuthorizerFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      environment: {
        SM_COGNITO_CREDENTIALS: secret.secretName,
      },
      functionName: `${id}-instructorLambdaAuthorizer`,
      memorySize: 256,
      layers: [jwt],
      role: lambdaRole,
    }
  );

  // Add the permission to the Lambda function's policy to allow API Gateway access
  authorizationFunction_instructor.grantInvoke(
    new iam.ServicePrincipal("apigateway.amazonaws.com")
  );

  // Change Logical ID to match the one decleared in YAML file of Open API
  const apiGW_authorizationFunction_instructor =
    authorizationFunction_instructor.node.defaultChild as lambda.CfnFunction;
  apiGW_authorizationFunction_instructor.overrideLogicalId(
    "instructorLambdaAuthorizer"
  );

  return {
    adminAuthorizer: authorizationFunction,
    studentAuthorizer: authorizationFunction_student,
    instructorAuthorizer: authorizationFunction_instructor,
  };
}
