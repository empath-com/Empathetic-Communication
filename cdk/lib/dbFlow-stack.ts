import { Stack, StackProps, triggers, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

// Service files import
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

// Stack import
import { VpcStack } from './vpc-stack';
import { DatabaseStack } from './database-stack';
import { ApiServiceStack } from './api-service-stack';

export class DBFlowStack extends Stack {
    constructor(scope: Construct, id: string, vpcStack: VpcStack, db: DatabaseStack, apiStack: ApiServiceStack, props?: StackProps) {
        super(scope, id, props);

        // Create the node-pg-migrate layer from the ZIP file
        const nodePgMigrateLayer = new lambda.LayerVersion(this, `${id}-node-pg-migrate-layer`, {
            code: lambda.Code.fromAsset("layers/node-pg-migrate.zip"),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: "Node.js pg-migrate dependencies layer"
        });

        // Create IAM role for Lambda within the VPC
        const lambdaRole = new iam.Role(this, `${id}-lambda-vpc-role`, {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            description: "Role for all Lambda functions inside VPC",
        });

        // Add necessary policies to the Lambda role
        lambdaRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    // Secrets Manager
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:PutSecretValue"
                ],
                resources: [
                    `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
                ],
            })
        );

        lambdaRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    // CloudWatch Logs
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                resources: ["arn:aws:logs:*:*:*"],
            })
        );

        lambdaRole.addToPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ec2:CreateNetworkInterface",
                    "ec2:DeleteNetworkInterface",
                    "ec2:DescribeNetworkInterfaces",
                ],
                resources: ["*"],
            })
        );

        // Add additional managed policies
        lambdaRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMReadOnlyAccess")
        );

        lambdaRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
        );

        // Create an initializer Lambda function for the RDS instance, invoked on every deployment
        const initializerLambda = new triggers.TriggerFunction(this, `${id}-triggerLambda`, {
            // Force a new deployment by adding a timestamp
            description: `Database initializer and migration runner - ${new Date().toISOString()}`,
            functionName: `${id}-initializerFunction`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: "index.handler",
            timeout: Duration.seconds(300),
            memorySize: 512,
            environment: {
                DB_SECRET_NAME: db.secretPathAdminName,     // Admin Secret Manager name
                DB_USER_SECRET_NAME: db.secretPathUser.secretName, // User Secret Manager name
                DB_PROXY: db.secretPathTableCreator.secretName, // Proxy Secret
            },
            vpc: db.dbInstance.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            code: lambda.Code.fromAsset("lambda/db_setup"),
            layers: [nodePgMigrateLayer],
            role: lambdaRole,
        });

        // Retain the security group that was previously created here (pre-f2df852).
        // It was removed from the template but still has Lambda ENIs attached, so
        // CloudFormation cannot delete it. RETAIN prevents the delete attempt.
        // Once AWS cleans up the ENIs you can delete sg-0d3ca50f7acef4f5d manually
        // and remove this block.
        const _retainedLambdaSg = new ec2.SecurityGroup(this, `${id}-lambda-sg`, {
            vpc: vpcStack.vpc,
            description: 'Security group for Lambda to access RDS',
            allowAllOutbound: true
        });
        _retainedLambdaSg.applyRemovalPolicy(RemovalPolicy.RETAIN);

        // Use Lambda security group created in Database stack
        // (created there to avoid circular dependency)
        const lambdaSecurityGroup = db.lambdaSecurityGroup;

        // Add the security group to Lambda
        initializerLambda.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['rds-db:connect'],
                resources: ['*']
            })
        );

        // Override Lambda security groups
        const cfnFunction = initializerLambda.node.defaultChild as lambda.CfnFunction;
        cfnFunction.vpcConfig = {
            securityGroupIds: [lambdaSecurityGroup.securityGroupId],
            subnetIds: vpcStack.vpc.privateSubnets.map(subnet => subnet.subnetId)
        };
    }
}