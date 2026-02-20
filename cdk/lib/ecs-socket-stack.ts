import * as cdk from "aws-cdk-lib";
import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";

export class EcsSocketStack extends Stack {
  public readonly socketUrl: string;
  public readonly nlbDnsName: string;
  public readonly albDnsName: string;
  public readonly albArn: string;

  constructor(
    scope: Construct,
    id: string,
    vpcStack: VpcStack,
    db: DatabaseStack,
    apiServiceStack: any,
    props?: StackProps
  ) {
    super(scope, id, props);

    // CORS configuration parameter
    const corsAllowedOrigin = new cdk.CfnParameter(this, "corsAllowedOrigin", {
      type: "String",
      default: "*",
      description: "Allowed origin for CORS (e.g., https://example.com or * for all)",
    });

    // Socket domain parameter for reference
    const socketDomainParam = new cdk.CfnParameter(this, "socketDomain", {
      type: "String",
      default: "",
      description: "Custom domain for WebSocket server (e.g., ws.example.com). Certificate and DNS must be configured externally. Leave empty to use ALB DNS name.",
    });

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
      cpu: 2048,
      memoryLimitMiB: 4096,
      taskRole,
      executionRole: taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
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
        CORS_ALLOWED_ORIGIN: corsAllowedOrigin.valueAsString,
      },
    });

    // 5) ECS service - deployed in PRIVATE subnets
    const service = new ecs.FargateService(this, "SocketService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1, // Start with single task - deployment is simpler and more stable
      assignPublicIp: false, // No public IPs
      vpcSubnets: { subnets: vpcStack.frontPrivateSubnets },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      // Give containers 3 minutes to initialize before health check evaluation
      healthCheckGracePeriod: Duration.seconds(180),
      // Disable circuit breaker for now - let's see if it's a deployment state issue, not health
      // circuitBreaker: { rollback: true },
      // Standard deployment defaults for single task
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Auto-scaling configuration - starts from 1 task, scales up based on metrics
    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 80,
    });

    // ============================================
    // APPLICATION LOAD BALANCER (WebSocket/HTTP)
    // ============================================
    const alb = new elbv2.ApplicationLoadBalancer(this, "SocketALB", {
      vpc,
      internetFacing: false, // Private ALB for VPC access only
      vpcSubnets: { subnets: vpcStack.frontPrivateSubnets },
      loadBalancerName: `${id.replace(/Stack/g, "")}-socket-alb`,
    });

    // Allow load balancers to reach ECS service on port 80
    service.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(80),
      "Allow load balancers to reach ECS service"
    );

    // Update ALB security group to allow HTTP (80)
    const albSecurityGroup = alb.connections.securityGroups[0];
    albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.0.0/8"),
      ec2.Port.tcp(80),
      "Allow HTTP to WebSocket ALB"
    );

    // ============================================
    // NETWORK LOAD BALANCER (in front of ALB)
    // ============================================
    // NLB targets the ALB (not ECS tasks directly) to avoid deployment hangs.
    // Cold-start health check failures are isolated to the ALB layer.
    const nlb = new elbv2.NetworkLoadBalancer(this, "SocketNLB", {
      vpc,
      internetFacing: false,
      vpcSubnets: { subnets: vpcStack.frontPrivateSubnets },
      loadBalancerName: `${id.replace(/Stack/g, "")}-socket-nlb`,
    });

    const nlbListener = nlb.addListener("NlbTcpListener", {
      port: 80,
      protocol: elbv2.Protocol.TCP,
    });

    // Target the ALB, not ECS tasks — prevents deployment hangs
    // Note: deregistrationDelay is not supported for target type 'alb'
    nlbListener.addTargets("NlbAlbTarget", {
      port: 80,
      targets: [new elbv2targets.AlbTarget(alb, 80)],
      healthCheck: {
        protocol: elbv2.Protocol.HTTP,
        path: "/health",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        interval: Duration.seconds(30),
      },
    });

    // Add HTTP listener for WebSocket connections
    const httpListener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // Add targets to HTTP listener
    httpListener.addTargets("AlbEcsTargets", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targets: [service],
      healthCheck: {
        path: "/health",
        protocol: elbv2.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
      },
      deregistrationDelay: Duration.seconds(120),
    });

    // ============================================
    // CROSS-ACCOUNT ACCESS SETUP
    // ============================================
    // ALB security group already configured above
    albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.0.0/8"), // RFC 1918 private range - adjust as needed
      ec2.Port.tcp(80),
      "Allow HTTP to WebSocket ALB"
    );

    // ============================================
    // OUTPUTS FOR CROSS-ACCOUNT CONSUMPTION
    // ============================================
    this.nlbDnsName = nlb.loadBalancerDnsName;
    this.albDnsName = alb.loadBalancerDnsName;
    this.albArn = alb.loadBalancerArn;
    // Use custom domain if provided, otherwise use ALB DNS name
    const socketDomain = socketDomainParam.valueAsString;
    const domainForUrl = socketDomain && socketDomain.trim() !== "" ? socketDomain : alb.loadBalancerDnsName;
    // WebSocket uses ws:// (HTTP) protocol. HTTPS/WSS must be configured externally via Route53 alias and CloudFront or similar
    this.socketUrl = `ws://${domainForUrl}`;

    // Output ALB and NLB DNS names for HTTP/WebSocket access
    new CfnOutput(this, "ApplicationLoadBalancerDnsName", {
      value: this.albDnsName,
      description: "ALB DNS Name for WebSocket connections within same VPC or via VPC peering",
      exportName: `${id}-ALB-DNS`,
    });

    new CfnOutput(this, "ApplicationLoadBalancerArn", {
      value: this.albArn,
      description: "ALB ARN for cross-account access",
      exportName: `${id}-ALB-ARN`,
    });

    new CfnOutput(this, "NetworkLoadBalancerDnsName", {
      value: this.nlbDnsName,
      description: "NLB DNS Name (static IPs) — primary entry point for WebSocket connections",
      exportName: `${id}-NLB-DNS`,
    });

    new CfnOutput(this, "NetworkLoadBalancerArn", {
      value: nlb.loadBalancerArn,
      description: "NLB ARN",
      exportName: `${id}-NLB-ARN`,
    });

    // Output internal WebSocket URL
    new CfnOutput(this, "InternalWebSocketUrl", {
      value: this.socketUrl,
      description: "Internal WebSocket server URL (ws:// protocol - HTTP). Configure external TLS termination for wss:// (HTTPS).",
      exportName: `${id}-WebSocket-URL`,
    });

    // Output note about external HTTPS configuration
    new CfnOutput(this, "HttpsConfigurationNote", {
      value: socketDomain && socketDomain.trim() !== ""
        ? `Custom domain provided: ${socketDomain}. Configure DNS, TLS, and routing in the account managing that domain.`
        : `No custom domain provided. Using ALB DNS: ${alb.loadBalancerDnsName}. For HTTPS/WSS, set up external TLS termination.`,
      description: "Instructions for external HTTPS/WSS configuration",
    });

    // Export front subnet IDs used by the service and load balancers to validate placement
    new CfnOutput(this, "FrontSubnetIds", {
      value: cdk.Fn.join(",", vpcStack.frontPrivateSubnets.map((s: ec2.ISubnet) => (s as any).subnetId)),
      description: "Comma-separated front private subnet IDs used for ECS and ALBs",
      exportName: `${id}-Front-Subnets`,
    });

    // Documentation for cross-account setup
    new CfnOutput(this, "CrossAccountAccessGuide", {
      value: "For cross-account access: 1) Set up VPC peering/PrivateLink, 2) Update security group rules to allow consuming account VPC CIDR, 3) Use ALB DNS name from outputs above",
      description: "Steps for cross-account access configuration",
    });
  }
}
