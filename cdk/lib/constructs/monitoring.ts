import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Duration } from "aws-cdk-lib";
import { DatabaseStack } from "../database-stack";
import { VpcStack } from "../vpc-stack";

export interface MonitoringProps {
  id: string;
  db: DatabaseStack;
  vpcStack: VpcStack;
  dataIngestFn: lambda.DockerImageFunction;
  psycopgLayer: lambda.LayerVersion;
  powertoolsLayer: lambda.ILayerVersion;
  lambdaRole: iam.Role;
}

export function createMonitoring(
  scope: cdk.Stack,
  props: MonitoringProps
): void {
  const { id, db, vpcStack, dataIngestFn, psycopgLayer, powertoolsLayer, lambdaRole } = props;

  // Create Log Group for dataIngestLambdaDockerFunc
  const logGroup = new logs.LogGroup(scope, `${id}-DataIngestLambdaLogGroup`, {
    logGroupName: `/aws/lambda/${dataIngestFn.functionName}`,
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  // Define a CloudWatch Log Metric Filter to detect timeouts
  const timeoutMetricFilter = new logs.MetricFilter(
    scope,
    `${id}-LambdaTimeoutMetricFilter`,
    {
      logGroup: logGroup,
      metricNamespace: "LambdaTimeouts",
      metricName: "DataIngestLambdaTimeouts",
      filterPattern: logs.FilterPattern.literal("Task timed out after"),
      metricValue: "1",
    }
  );

  // Define the CloudWatch Alarm for Lambda timeout
  const timeoutAlarm = new cloudwatch.Alarm(
    scope,
    `${id}-DataIngestLambdaTimeoutAlarm`,
    {
      metric: timeoutMetricFilter.metric({
        statistic: "Sum",
        period: cdk.Duration.seconds(10),
      }),
      alarmDescription: `Alarm when ${dataIngestFn.functionName} Lambda function times out`,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }
  );

  // This rule will help invoke timeout Lambda function when the alarm is triggered
  const timeoutRule = new events.Rule(
    scope,
    `${id}-DataIngestLambdaTimeoutRule`,
    {
      eventPattern: {
        source: ["aws.cloudwatch"],
        detailType: ["CloudWatch Alarm State Change"],
        detail: {
          state: { value: ["ALARM", "OK"] },
        },
      },
    }
  );

  // Timeout handler Lambda
  const timeoutHandlerLambda = new lambda.Function(
    scope,
    `${id}-TimeoutHandlerLambda`,
    {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset("lambda/timeoutHandler"),
      handler: "timeoutHandler.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 256,
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
      },
      functionName: `${id}-TimeoutHandlerLambda`,
      layers: [psycopgLayer, powertoolsLayer],
      role: lambdaRole,
    }
  );

  // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
  const cfnTimeoutHandlerLambda = timeoutHandlerLambda.node
    .defaultChild as lambda.CfnFunction;
  cfnTimeoutHandlerLambda.overrideLogicalId("TimeoutHandlerLambda");

  // Ensure EventBridge can invoke the timeout Lambda
  timeoutHandlerLambda.addPermission("AllowEventBridgeInvoke", {
    principal: new iam.ServicePrincipal("events.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: timeoutRule.ruleArn,
  });

  // Link the EventBridge rule to trigger timeoutHandlerLambda
  timeoutRule.addTarget(new targets.LambdaFunction(timeoutHandlerLambda));
}
