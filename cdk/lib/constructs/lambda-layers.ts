import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  Code,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";

export interface LambdaLayersResult {
  jwt: lambda.LayerVersion;
  postgres: lambda.LayerVersion;
  psycopgLayer: lambda.LayerVersion;
  powertoolsLayer: lambda.ILayerVersion;
  layerList: { [key: string]: LayerVersion };
}

export function createLambdaLayers(
  scope: cdk.Stack,
  id: string
): LambdaLayersResult {
  // Create Integration Lambda layer for aws-jwt-verify
  const jwt = new lambda.LayerVersion(scope, "aws-jwt-verify", {
    code: lambda.Code.fromAsset("./layers/aws-jwt-verify.zip"),
    compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
    description: "Contains the aws-jwt-verify library for JS",
  });

  // Create Integration Lambda layer for PSQL
  const postgres = new lambda.LayerVersion(scope, "postgres", {
    code: lambda.Code.fromAsset("./layers/postgres.zip"),
    compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
    description: "Contains the postgres library for JS",
  });

  // Create Lambda layer for Psycopg2
  const psycopgLayer = new LayerVersion(scope, "psycopgLambdaLayer", {
    code: Code.fromAsset("./layers/psycopg2.zip"),
    compatibleRuntimes: [Runtime.PYTHON_3_12],
    description: "Lambda layer containing the psycopg2 Python library",
  });

  // powertoolsLayer does not follow the format of layerList
  const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
    scope,
    `${id}-PowertoolsLayer`,
    `arn:aws:lambda:${scope.region}:017000801446:layer:AWSLambdaPowertoolsPythonV2:78`
  );

  const layerList: { [key: string]: LayerVersion } = {};
  layerList["psycopg2"] = psycopgLayer;
  layerList["postgres"] = postgres;
  layerList["jwt"] = jwt;

  return {
    jwt,
    postgres,
    psycopgLayer,
    powertoolsLayer,
    layerList,
  };
}
