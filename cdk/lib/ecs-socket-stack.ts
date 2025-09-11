import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";

export class EcsSocketStack extends Stack {
  public readonly socketUrl: string;

  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    db: DatabaseStack,
    apiServiceStack: any,
    props?: StackProps
  ) {
    super(scope, id, props);

    const vpc = vpcStack.vpc;

    // 1) ECS cluster
    const cluster = new ecs.Cluster(this, "SocketCluster", { vpc });

    // 2) Task role
    const taskRole = new iam.Role(this, "SocketTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
      inlinePolicies: {
        BedrockPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithBidirectionalStream",
                "bedrock:Converse",
                "bedrock:ConverseStream",
                "bedrock:InvokeModelWithResponseStream",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["sts:AssumeRole", "sts:GetCallerIdentity"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // DynamoDB permissions for ECS task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/DynamoDB-Conversation-Table`,
        ],
      })
    );

    // Add permissions for Cognito Identity operations
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-identity:GetId",
          "cognito-identity:GetCredentialsForIdentity",
        ],
        resources: ["*"],
      })
    );
    
    // Add VPC endpoint permissions for private subnet access
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
        ],
        resources: ["*"],
      })
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          db.secretPathUser.secretArn,
          apiServiceStack.secret.secretArn
        ],
      })
    );

    // 3) Fargate task definition
    const taskDef = new ecs.FargateTaskDefinition(this, "SocketTaskDef", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole,
      executionRole: taskRole,
    });

    // 4) Container listening on port 80
    taskDef.addContainer("SocketContainer", {
      image: ecs.ContainerImage.fromAsset("./socket-server"),
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "Socket",
        logRetention: logs.RetentionDays.THREE_MONTHS,
      }),
      environment: {
        NODE_ENV: "production",
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        SM_COGNITO_CREDENTIALS: apiServiceStack.secret.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        AWS_REGION: this.region,
        AWS_DEFAULT_REGION: this.region,
        COGNITO_USER_POOL_ID: apiServiceStack.getUserPoolId(),
        COGNITO_CLIENT_ID: apiServiceStack.getUserPoolClientId(),
        IDENTITY_POOL_ID: apiServiceStack.getIdentityPoolId(),
        TEXT_GENERATION_ENDPOINT: apiServiceStack.getEndpointUrl(),
        APPSYNC_GRAPHQL_URL: apiServiceStack.appSyncApi.graphqlUrl,
        SOCKET_EXECUTION_ROLE_ARN: taskRole.roleArn,
      },
    });

    // 5) ECS service
    const service = new ecs.FargateService(this, "SocketService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2, // Always keep 2 running to prevent cold starts
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // 5.1) Allow the NLB (and CloudFront via NLB) to reach your service on port 80
    service.connections.allowFromAnyIpv4(
      ec2.Port.tcp(80),
      "AllowHTTPFromLoadBalancer"
    );
    
    // Allow NLB to reach ECS service from VPC
    service.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(80),
      "Allow NLB to reach ECS service"
    );

    // 6) Network Load Balancer on TCP 80
    const nlb = new elbv2.NetworkLoadBalancer(this, "SocketNLB", {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const listener = nlb.addListener("TcpListener", {
      port: 80,
      protocol: elbv2.Protocol.TCP,
    });
    listener.addTargets("EcsTargetGroupV2", {
      protocol: elbv2.Protocol.TCP,
      port: 80,
      targets: [service],
      healthCheck: {
        protocol: elbv2.Protocol.TCP,
        port: "80",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
      },
    });

    // 7) CloudFront distribution in front of the NLB
    const distro = new cloudfront.Distribution(this, "SocketDistro", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(nlb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    // 8) Output both CloudFront and direct NLB URLs
    this.socketUrl = `wss://${distro.domainName}`;
    new CfnOutput(this, "SocketUrl", {
      value: this.socketUrl,
      description: "WebSocket server URL via CloudFront + NLB",
      exportName: `${id}-SocketUrl`,
    });
    
    new CfnOutput(this, "DirectSocketUrl", {
      value: `ws://${nlb.loadBalancerDnsName}`,
      description: "Direct WebSocket server URL (bypasses CloudFront)",
      exportName: `${id}-DirectSocketUrl`,
    });
  }
}
