import { Stack, StackProps, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import { VpcStack } from './vpc-stack';

export class DatabaseStack extends Stack {
    public readonly dbInstance: rds.DatabaseInstance;
    public readonly secretPathAdminName: string;
    public readonly secretPathUser: secretsmanager.Secret;
    public readonly secretPathTableCreator: secretsmanager.Secret;
    public readonly rdsProxyEndpoint: string;
    public readonly lambdaSecurityGroup: ec2.SecurityGroup;
    // Removed: rdsProxyEndpointTableCreator, rdsProxyEndpointAdmin - using single proxy

    constructor(scope: Construct, id: string, vpcStack: VpcStack, props?: StackProps) {
        super(scope, id, props);

        /**
         * Create the RDS service-linked role if it doesn't exist
         */
        // new iam.CfnServiceLinkedRole(this, `${id}-RDSServiceLinkedRole`, {
        //     awsServiceName: 'rds.amazonaws.com',
        // });

        /**
         * Create security group for Lambda to connect to RDS
         * Created here to avoid circular dependency with DBFlow stack
         */
        this.lambdaSecurityGroup = new ec2.SecurityGroup(this, `${id}-lambda-sg`, {
            vpc: vpcStack.vpc,
            description: 'Security group for Lambda to access RDS',
            allowAllOutbound: true
        });

        /**
         * Retrieve a secret from Secret Manager
         */
        const secret = secretmanager.Secret.fromSecretNameV2(this, "ImportedSecrets", "VCISecrets");

        /**
         * Create Secrets for various users
         */
        this.secretPathAdminName = `${id}-VCI/credentials/rdsDbCredential`;
        const secretPathUserName = `${id}-VCI/userCredentials/rdsDbCredential`;
        this.secretPathUser = new secretsmanager.Secret(this, secretPathUserName, {
            secretName: secretPathUserName,
            description: "Secrets for clients to connect to RDS",
            removalPolicy: RemovalPolicy.DESTROY,
            secretObjectValue: {
                username: SecretValue.unsafePlainText("applicationUsername"),   // will be changed at runtime
                password: SecretValue.unsafePlainText("applicationPassword")    // will be changed at runtime
            }
        });

        const secretPathTableCreator = `${id}-VCI/userCredentials/TableCreator`;
        this.secretPathTableCreator = new secretsmanager.Secret(this, secretPathTableCreator, {
            secretName: secretPathTableCreator,
            description: "Secrets for TableCreator to connect to RDS",
            removalPolicy: RemovalPolicy.DESTROY,
            secretObjectValue: {
                username: SecretValue.unsafePlainText("applicationUsername"),   // will be changed at runtime
                password: SecretValue.unsafePlainText("applicationPassword")    // will be changed at runtime
            }
        });

        const parameterGroup = new rds.ParameterGroup(this, `${id}-rdsParameterGroup`, {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16,
            }),
            description: "Empty parameter group",
            parameters: {
                'rds.force_ssl': '0'
            }
        });

        /**
         * Create the RDS Postgres database
         */
        this.dbInstance = new rds.DatabaseInstance(this, `${id}-database`, {
            vpc: vpcStack.vpc,
            // Use existing private subnets in the control tower VPC
            vpcSubnets: {
                subnets: vpcStack.vpc.privateSubnets,
            },
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16,
            }),
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE4_GRAVITON,
                ec2.InstanceSize.SMALL
            ),
            credentials: rds.Credentials.fromUsername(secret.secretValueFromJson("DB_Username").unsafeUnwrap(), {
                secretName: this.secretPathAdminName,
            }),
            multiAz: false, // cost optimization: single-AZ sufficient for low-usage deployment
            allocatedStorage: 100,
            maxAllocatedStorage: 115,
            allowMajorVersionUpgrade: false,
            autoMinorVersionUpgrade: true,
            backupRetention: Duration.days(7),
            deleteAutomatedBackups: true,
            deletionProtection: true,
            databaseName: "vci",
            publiclyAccessible: false,
            cloudwatchLogsRetention: logs.RetentionDays.INFINITE,
            storageEncrypted: true, // storage encryption at rest
            monitoringInterval: Duration.seconds(60), // enhanced monitoring interval
            parameterGroup: parameterGroup
        });
        
        // Add CIDR ranges of private subnets to inbound rules of RDS
        const dbSecurityGroup = this.dbInstance.connections.securityGroups[0];
        if (vpcStack.privateSubnetsCidrStrings && vpcStack.privateSubnetsCidrStrings.length > 0) {
            vpcStack.privateSubnetsCidrStrings.forEach((cidr) => {
                dbSecurityGroup.addIngressRule(
                    ec2.Peer.ipv4(cidr),
                    ec2.Port.tcp(5432),
                    `Allow PostgreSQL traffic from private subnet CIDR range ${cidr}`
                );
            });
        } else {
            console.log("Deploying with new VPC. No need to add private subnet CIDR ranges to inbound rules of RDS.");
        }

        // Add CIDR ranges of public subnets to inbound rules of RDS
        this.dbInstance.connections.securityGroups.forEach(function (securityGroup) {
            // Allow Postgres access in VPC
            securityGroup.addIngressRule(
                ec2.Peer.ipv4(vpcStack.vpcCidrString),
                ec2.Port.tcp(5432),
                "Allow PostgreSQL traffic from VPC"
            );
        });

        // Allow Lambda security group to connect to RDS
        this.dbInstance.connections.allowFrom(
            this.lambdaSecurityGroup,
            ec2.Port.tcp(5432),
            'Allow Lambda to connect to RDS on port 5432'
        );

        /**
         * Create IAM role for RDS Proxy
         */
        const rdsProxyRole = new iam.Role(this, `${id}-DBProxyRole`, {
            assumedBy: new iam.ServicePrincipal('rds.amazonaws.com')
        });

        rdsProxyRole.addToPolicy(new iam.PolicyStatement({
            resources: ['*'],
            actions: [
                'rds-db:connect',
            ],
        }));

        /**
         * Create single RDS Proxy with multiple secrets for optimal connection management
         * This consolidates 3 separate proxies into 1 for 68% cost reduction and better pooling
         */
        const secretPathAdmin = secretmanager.Secret.fromSecretNameV2(this, 'AdminSecret', this.secretPathAdminName);
        
        const rdsProxy = this.dbInstance.addProxy(id + '-proxy', {
            secrets: [
                this.secretPathUser!,
                this.secretPathTableCreator!,
                secretPathAdmin
            ],
            vpc: vpcStack.vpc,
            role: rdsProxyRole,
            securityGroups: this.dbInstance.connections.securityGroups,
            requireTLS: false, // Keep as false to match previous working version
            maxConnectionsPercent: 80, // Reserve 20% for direct connections
            maxIdleConnectionsPercent: 50, // Aggressive idle cleanup
            borrowTimeout: Duration.seconds(120), // Reasonable timeout
            sessionPinningFilters: [
                rds.SessionPinningFilter.EXCLUDE_VARIABLE_SETS
            ]
        });
        
        /**
         * Workaround for TargetGroupName not being set automatically
         */
        let targetGroup = rdsProxy.node.children.find((child: any) => {
            return child instanceof rds.CfnDBProxyTargetGroup;
        }) as rds.CfnDBProxyTargetGroup;

        targetGroup.addPropertyOverride('TargetGroupName', 'default');

        /**
         * Grant the role permission to connect to the database
         */
        this.dbInstance.grantConnect(rdsProxyRole);

        this.rdsProxyEndpoint = rdsProxy.endpoint;
        console.log(`🏗️ RDS_PROXY_ENDPOINT: ${this.rdsProxyEndpoint}`);
    }
}