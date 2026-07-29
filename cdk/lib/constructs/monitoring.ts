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

  // Structured Lambda log groups used by the shared request pipeline.
  const studentLogGroup = new logs.LogGroup(scope, `${id}-StudentLambdaLogGroup`, {
    logGroupName: `/aws/lambda/${id}-studentFunction`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const instructorLogGroup = new logs.LogGroup(scope, `${id}-InstructorLambdaLogGroup`, {
    logGroupName: `/aws/lambda/${id}-instructorFunction`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const adminLogGroup = new logs.LogGroup(scope, `${id}-AdminLambdaLogGroup`, {
    logGroupName: `/aws/lambda/${id}-adminFunction`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const textGenLogGroup = new logs.LogGroup(scope, `${id}-TextGenLambdaLogGroup`, {
    logGroupName: `/aws/lambda/${id}-TextGenLambdaDockerFunction`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

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

  // Structured request/error metrics from Lambda shared request pipeline.
  const requestMetricFilters = [studentLogGroup, instructorLogGroup, adminLogGroup].map(
    (targetGroup, idx) =>
      new logs.MetricFilter(scope, `${id}-LambdaRequestCountFilter-${idx}`, {
        logGroup: targetGroup,
        metricNamespace: "EmpathAI/Observability",
        metricName: "LambdaRequestCount",
        filterPattern: logs.FilterPattern.stringValue("$.event", "=", "lambda_request_received"),
        metricValue: "1",
      })
  );

  const errorMetricFilters = [studentLogGroup, instructorLogGroup, adminLogGroup].map(
    (targetGroup, idx) =>
      new logs.MetricFilter(scope, `${id}-LambdaRequestErrorFilter-${idx}`, {
        logGroup: targetGroup,
        metricNamespace: "EmpathAI/Observability",
        metricName: "LambdaRequestErrors",
        filterPattern: logs.FilterPattern.stringValue("$.event", "=", "lambda_request_error"),
        metricValue: "1",
      })
  );

  const dbConnectionErrorFilters = [studentLogGroup, instructorLogGroup, adminLogGroup, textGenLogGroup].map(
    (targetGroup, idx) =>
      new logs.MetricFilter(scope, `${id}-LambdaDbConnectionErrorFilter-${idx}`, {
        logGroup: targetGroup,
        metricNamespace: "EmpathAI/Observability",
        metricName: "DbConnectionErrors",
        filterPattern: logs.FilterPattern.stringValue("$.event", "=", "db_connection_error"),
        metricValue: "1",
      })
  );

  const lambdaRequestCount = requestMetricFilters[0].metric({
    statistic: "Sum",
    period: Duration.minutes(5),
  });
  const lambdaRequestErrors = errorMetricFilters[0].metric({
    statistic: "Sum",
    period: Duration.minutes(5),
  });
  const lambdaDbConnectionErrors = dbConnectionErrorFilters[0].metric({
    statistic: "Sum",
    period: Duration.minutes(5),
  });

  const lambdaErrorRatePercent = new cloudwatch.MathExpression({
    expression: "100 * errors / MAX([requests, 1])",
    usingMetrics: {
      errors: lambdaRequestErrors,
      requests: lambdaRequestCount,
    },
    period: Duration.minutes(5),
    label: "Lambda Error Rate (%)",
  });

  // SLO target is 99.0% request success => 1.0% error budget.
  const lambdaErrorBudgetBurn = new cloudwatch.MathExpression({
    expression: "(100 * errors / MAX([requests, 1])) / 1",
    usingMetrics: {
      errors: lambdaRequestErrors,
      requests: lambdaRequestCount,
    },
    period: Duration.minutes(5),
    label: "Lambda Error Budget Burn (x)",
  });

  new cloudwatch.Alarm(scope, `${id}-LambdaErrorRateWarnAlarm`, {
    metric: lambdaErrorRatePercent,
    threshold: 2,
    evaluationPeriods: 2,
    alarmDescription:
      "[SEV3][SLO] Lambda error rate exceeded 2% over 10 minutes; investigate route-level failures.",
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });

  new cloudwatch.Alarm(scope, `${id}-LambdaErrorBudgetBurnWarnAlarm`, {
    metric: lambdaErrorBudgetBurn,
    threshold: 1,
    evaluationPeriods: 3,
    alarmDescription:
      "[SEV3][ErrorBudget] Lambda error budget burn rate >= 1.0x for 15 minutes.",
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });

  new cloudwatch.Alarm(scope, `${id}-LambdaDbConnectionCriticalAlarm`, {
    metric: lambdaDbConnectionErrors,
    threshold: 1,
    evaluationPeriods: 1,
    alarmDescription:
      "[SEV2] Lambda DB connection errors detected. Check Secrets Manager and RDS proxy health.",
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });

  const opsDashboard = new cloudwatch.Dashboard(scope, `${id}-LambdaOpsDashboard`, {
    dashboardName: `${id}-lambda-ops`,
  });

  opsDashboard.addWidgets(
    new cloudwatch.TextWidget({
      markdown:
        "## Lambda Operability\nSLO: 99.0% success over 5-minute windows. Alerts are tiered to reduce noise and preserve on-call focus.",
      width: 24,
      height: 3,
    })
  );

  opsDashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: "Lambda Request Volume vs Errors",
      width: 12,
      left: [lambdaRequestCount, lambdaRequestErrors],
      stacked: false,
    }),
    new cloudwatch.GraphWidget({
      title: "Lambda Error Rate and Error Budget Burn",
      width: 12,
      left: [lambdaErrorRatePercent, lambdaErrorBudgetBurn],
      stacked: false,
    })
  );
}
