import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cdk from "aws-cdk-lib";
import { Fn } from "aws-cdk-lib";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

export class VpcStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly vpcCidrString: string;
  public readonly privateSubnetsCidrStrings: string[];
  public readonly frontPrivateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // CDK Parameters for flexible deployment
    const vpcIdParam = new cdk.CfnParameter(this, "vpcId", {
      type: "String",
      description: "The existing VPC ID to use (leave empty to create new VPC)",
      default: "",
    });

    const subnetPrefixParam = new cdk.CfnParameter(this, "subnetPrefix", {
      type: "String",
      description: "Subnet name prefix (e.g., 'prd-phar-empath-ai-prd'). Leave empty to use hardcoded subnet IDs.",
      default: "",
    });

    const existingVpcId: string = vpcIdParam.valueAsString;

    if (existingVpcId !== "") {
      const AWSControlTowerStackSet =
        "ProvisionVPC"; // CHANGE TO YOUR CONTROL TOWER STACK SET
      
      // Dynamic subnet and route table lookup configuration
      // Use subnetPrefix parameter (e.g., "prd-phar-empath-ai-prd") or leave empty for hardcoded IDs
      const subnetNamePrefix = subnetPrefixParam.valueAsString; // e.g., "prd-phar-empath-ai-prd"
      const region = this.region; // Get region dynamically from stack
      
      // Helper function to construct subnet/route names dynamically
      const constructResourceName = (type: "back" | "front", az: string): string => {
        return `${subnetNamePrefix}-${type}-${region}${az}`;
      };
      
      // **IMPORTANT**: Replace these with your actual subnet IDs and route table IDs
      // You can find these in AWS Console > VPC > Subnets
      // Backend (app/data) private subnets used by DB, API, Lambdas
      const backendSubnetId: string = subnetNamePrefix ? "" : "subnet-0369c2fa2e5d70695"; // prd-phar-empath-ai-prd-back-ca-central-1a
      const backendSubnetId2: string = subnetNamePrefix ? "" : "subnet-07434d19387938307"; // prd-phar-empath-ai-prd-back-ca-central-1b
      const backendSubnetId3: string = ""; // OPTIONAL: Backend subnet for ca-central-1d

      // Front (LB/ECS/frontend) private subnets requested for frontend systems
      const frontSubnetId: string = subnetNamePrefix ? "" : "subnet-017bb497f28d38596"; // prd-phar-empath-ai-prd-front-ca-central-1a
      const frontSubnetId2: string = subnetNamePrefix ? "" : "subnet-064739f90fa0d44c5"; // prd-phar-empath-ai-prd-front-ca-central-1b
      // optional third AZ if needed in future
      const frontSubnetId3: string = "";
      
      // Route table IDs for the subnets above (find in AWS Console > VPC > Subnets > Route table tab)
      // Note: If multiple subnets share the same route table, list it only once
      const backendRouteTableId: string = subnetNamePrefix ? "" : "rtb-0ac8f0231dd8db334"; // Route table ID for backendSubnetId and backendSubnetId2 (they share the same table)
      const backendRouteTableId3: string = ""; // OPTIONAL: Route table ID for backendSubnetId3
      
      // If using dynamic naming, lookup subnet and route table IDs by name tag
      let resolvedBackendSubnetIds: string[] = [];
      let resolvedFrontSubnetIds: string[] = [];
      let resolvedRouteTableIds: string[] = [];
      
      if (subnetNamePrefix) {
        // Create custom resources to look up subnet and route table IDs by name
        const availabilityZones = ["a", "b"]; // Can add "d" if needed
        
        availabilityZones.forEach((az, index) => {
          const backendSubnetName = constructResourceName("back", az);
          const frontSubnetName = constructResourceName("front", az);
          
          // Lookup backend subnet ID by name
          const backendSubnetLookup = new AwsCustomResource(this, `BackendSubnetLookup-${az}`, {
            onUpdate: {
              service: "EC2",
              action: "describeSubnets",
              parameters: {
                Filters: [
                  { Name: "tag:Name", Values: [backendSubnetName] },
                  { Name: "vpc-id", Values: [existingVpcId] }
                ]
              },
              physicalResourceId: PhysicalResourceId.of(`BackendSubnet-${existingVpcId}-${backendSubnetName}`)
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE })
          });
          
          const backendSubnetIdFromLookup = backendSubnetLookup.getResponseField("Subnets.0.SubnetId");
          resolvedBackendSubnetIds.push(backendSubnetIdFromLookup);
          
          // Lookup front subnet ID by name
          const frontSubnetLookup = new AwsCustomResource(this, `FrontSubnetLookup-${az}`, {
            onUpdate: {
              service: "EC2",
              action: "describeSubnets",
              parameters: {
                Filters: [
                  { Name: "tag:Name", Values: [frontSubnetName] },
                  { Name: "vpc-id", Values: [existingVpcId] }
                ]
              },
              physicalResourceId: PhysicalResourceId.of(`FrontSubnet-${existingVpcId}-${frontSubnetName}`)
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE })
          });
          
          const frontSubnetIdFromLookup = frontSubnetLookup.getResponseField("Subnets.0.SubnetId");
          resolvedFrontSubnetIds.push(frontSubnetIdFromLookup);
          
          // Lookup route table ID associated with backend subnet
          const routeTableLookup = new AwsCustomResource(this, `RouteTableLookup-${az}`, {
            onUpdate: {
              service: "EC2",
              action: "describeRouteTables",
              parameters: {
                Filters: [
                  { Name: "association.subnet-id", Values: [backendSubnetIdFromLookup] }
                ]
              },
              physicalResourceId: PhysicalResourceId.of(`RouteTable-${existingVpcId}-${backendSubnetName}`)
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE })
          });
          
          const routeTableIdFromLookup = routeTableLookup.getResponseField("RouteTables.0.RouteTableId");
          resolvedRouteTableIds.push(routeTableIdFromLookup);
        });
      }

      const vciPrefix = "VIRTUAL-CARE-INTERACTION-production";

      this.vpcCidrString = "10.102.0.0/16";

      // Determine if we should use specific subnets or CloudFormation imports
      // When using specific subnets, we will only use the AZs for which subnets are provided
      const finalBackendSubnetIds = subnetNamePrefix 
        ? resolvedBackendSubnetIds 
        : [backendSubnetId, backendSubnetId2, backendSubnetId3].filter((s) => !!s);
      
      const finalFrontSubnetIds = subnetNamePrefix
        ? resolvedFrontSubnetIds
        : [frontSubnetId, frontSubnetId2, frontSubnetId3].filter((s) => !!s);
      
      const finalRouteTableIds = subnetNamePrefix
        ? resolvedRouteTableIds
        : [backendRouteTableId, backendRouteTableId3].filter((r) => !!r);
      
      const providedSubnetIds = finalBackendSubnetIds;
      
      // Deduplicate route table IDs - convert to string for comparison to handle CDK tokens
      const uniqueRouteTableIds: string[] = [];
      const seenRtIds = new Set<string>();
      
      for (const rtId of finalRouteTableIds) {
        const rtIdStr = rtId.toString();
        if (!seenRtIds.has(rtIdStr)) {
          seenRtIds.add(rtIdStr);
          uniqueRouteTableIds.push(rtId as string);
        }
      }
      
      const useSpecificSubnets = providedSubnetIds.length > 0;

      // VPC for application
      this.vpc = ec2.Vpc.fromVpcAttributes(this, `${id}-Vpc`, {
        vpcId: existingVpcId,
        availabilityZones: useSpecificSubnets
          ? // Infer AZs from known mapping of provided subnets; if only one, keep single AZ
            providedSubnetIds.length === 1
              ? ["ca-central-1a"]
              : ["ca-central-1a", "ca-central-1b", "ca-central-1d"].slice(0, providedSubnetIds.length)
          : ["ca-central-1a", "ca-central-1b", "ca-central-1d"],
        privateSubnetIds: useSpecificSubnets
          ? providedSubnetIds
          : [
              Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet1AID`),
              Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet2AID`),
              Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet3AID`),
            ],
        // Provide deduplicated route table IDs for gateway endpoints
        privateSubnetRouteTableIds: useSpecificSubnets
          ? uniqueRouteTableIds.length > 0 ? uniqueRouteTableIds : undefined
          : [
              Fn.importValue(
                `${AWSControlTowerStackSet}-PrivateSubnet1ARouteTable`
              ),
              Fn.importValue(
                `${AWSControlTowerStackSet}-PrivateSubnet2ARouteTable`
              ),
              Fn.importValue(
                `${AWSControlTowerStackSet}-PrivateSubnet3ARouteTable`
              ),
            ],
        vpcCidrBlock: useSpecificSubnets ? this.vpcCidrString : Fn.importValue(`${AWSControlTowerStackSet}-VPCCIDR`),
      }) as ec2.Vpc;

      // Extract CIDR ranges from the private subnets
      this.privateSubnetsCidrStrings = useSpecificSubnets ? [] : [
        Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet1ACIDR`),
        Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet2ACIDR`),
        Fn.importValue(`${AWSControlTowerStackSet}-PrivateSubnet3ACIDR`),
      ];

      // Expose front-end subnets for selective placement (e.g., ALB/NLB/ECS)
      // These subnets remain separate from the VPC's default private subnets (backend)
      // Using lightweight ISubnet references from IDs is sufficient for placement
      this.frontPrivateSubnets = finalFrontSubnetIds.map((sid, idx) =>
        ec2.Subnet.fromSubnetId(this, `${id}-FrontSubnet-${idx + 1}`, sid)
      );

      // Skip public subnet creation if using specific subnets or if existingPublicSubnetID is set
      if (false && !useSpecificSubnets) {
        console.log(
          "No public subnet exists. Creating new public subnet, IGW, and NAT GW."
        );

        // Create a public subnet
        const publicSubnet = new ec2.Subnet(this, `PublicSubnet`, {
          vpcId: this.vpc.vpcId,
          availabilityZone: this.vpc.availabilityZones[0],
          cidrBlock: this.vpcCidrString,
          mapPublicIpOnLaunch: true,
        });

        // Create an Internet Gateway and attach it to the VPC
        const internetGateway = new ec2.CfnInternetGateway(
          this,
          `InternetGateway`,
          {}
        );
        new ec2.CfnVPCGatewayAttachment(this, "VPCGatewayAttachment", {
          vpcId: this.vpc.vpcId,
          internetGatewayId: internetGateway.ref,
        });

        // Add a NAT Gateway in the public subnet
        const natGateway = new ec2.CfnNatGateway(this, `NatGateway`, {
          subnetId: publicSubnet.subnetId,
          allocationId: new ec2.CfnEIP(this, "EIP", {}).attrAllocationId,
        });

        // Use the route table associated with the public subnet
        const publicRouteTableId = publicSubnet.routeTable.routeTableId;

        // Add a route to the Internet Gateway in the existing public route table
        new ec2.CfnRoute(this, `PublicRoute`, {
          routeTableId: publicRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          gatewayId: internetGateway.ref,
        });

        // Update route table for private subnets
        new ec2.CfnRoute(this, `${vciPrefix}PrivateSubnetRoute1`, {
          routeTableId: this.vpc.privateSubnets[0].routeTable.routeTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });

        new ec2.CfnRoute(this, `${vciPrefix}PrivateSubnetRoute2`, {
          routeTableId: this.vpc.privateSubnets[1].routeTable.routeTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });

        new ec2.CfnRoute(this, `${vciPrefix}PrivateSubnetRoute3`, {
          routeTableId: this.vpc.privateSubnets[2].routeTable.routeTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });
      } else {
        console.log(
          useSpecificSubnets 
            ? `Using specific subnets. Skipping creation of public resources.`
            : `Public subnet already exists. Skipping creation of public resources.`
        );
      }

      // Add interface endpoints for private subnets
      // Note: Using privateSubnetIds directly since we're working with an existing VPC
      const subnetSelection = { subnets: this.vpc.privateSubnets };

      // Create a security group for VPC endpoints
      const endpointSecurityGroup = new ec2.SecurityGroup(
        this,
        `${id}-EndpointSecurityGroup`,
        {
          vpc: this.vpc,
          description: "Security group for VPC endpoints",
          // Set allowAllOutbound to false so we can use explicit rules
          allowAllOutbound: false,
        }
      );

      // Allow HTTPS traffic (port 443) from the VPC CIDR
      endpointSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(this.vpcCidrString),
        ec2.Port.tcp(443),
        "Allow HTTPS from VPC"
      );

      // Explicit egress for HTTPS keeps traffic flowing
      endpointSecurityGroup.addEgressRule(
        ec2.Peer.ipv4(this.vpcCidrString),
        ec2.Port.tcp(443),
        "Allow HTTPS egress to VPC"
      );

      /*
      

      */
      this.vpc.addInterfaceEndpoint("SSM Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });


      this.vpc.addInterfaceEndpoint("Glue Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.GLUE,
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });

      // Add API Gateway VPC endpoint
      this.vpc.addInterfaceEndpoint("API Gateway Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });

      this.vpc.addInterfaceEndpoint("RDS Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });
      
      this.vpc.addInterfaceEndpoint("Secrets Manager Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });

      // Add Cognito Identity Provider VPC endpoint (required for JWT verification)
      // Using custom service name as COGNITO_IDP is not available in CDK
      this.vpc.addInterfaceEndpoint("Cognito IDP Endpoint", {
        service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${this.region}.cognito-idp`, 443),
        subnets: subnetSelection,
        privateDnsEnabled: true, // Disable to avoid DNS conflicts
        securityGroups: [endpointSecurityGroup],
      });

      // SSM Session Manager requires two additional endpoints beyond the base SSM endpoint
      this.vpc.addInterfaceEndpoint("SSM Messages Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: subnetSelection,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
      });

      this.vpc.addInterfaceEndpoint("EC2 Messages Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: subnetSelection,
        privateDnsEnabled: true,
        securityGroups: [endpointSecurityGroup],
      });

      // Only add gateway endpoints if NOT using specific subnets
      // (existing VPC likely already has them, and they cause route table duplicate issues)
      if (!useSpecificSubnets) {
        // Add DynamoDB VPC endpoint (required for chat history)
        this.vpc.addGatewayEndpoint("DynamoDB Endpoint", {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [subnetSelection],
        });

        // Add S3 gateway endpoint for private-subnet S3 access without NAT
        this.vpc.addGatewayEndpoint("S3 Endpoint", {
          service: ec2.GatewayVpcEndpointAwsService.S3,
          subnets: [subnetSelection],
        });
      }

      this.vpc.addFlowLog(`${id}-vpcFlowLog`);

      // ── Bastion host ─────────────────────────────────────────────────────────
      // t4g.nano (ARM Graviton2) in the back-1b subnet.
      // Access is exclusively via AWS SSM Session Manager — no key pair, no open
      // inbound ports.  SSH tunnelling is done through SSM port forwarding:
      //   aws ssm start-session --target <instance-id> \
      //     --document-name AWS-StartSSHSession --parameters portNumber=22

      const bastionSg = new ec2.SecurityGroup(this, `${id}-BastionSg`, {
        vpc: this.vpc,
        description: "Bastion host - SSM Session Manager only, no inbound ports required",
        allowAllOutbound: true,
      });

      const bastion = new ec2.Instance(this, `${id}-Bastion`, {
        vpc: this.vpc,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
        machineImage: ec2.MachineImage.latestAmazonLinux2023({
          cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        }),
        securityGroup: bastionSg,
        vpcSubnets: { subnets: [this.vpc.privateSubnets[1]] },
        // No keyName — use SSM Session Manager instead of direct SSH key auth
      });
      cdk.Tags.of(bastion).add("Name", "bastion");

      // Auto-stop bastion every night at 08:00 UTC (3 AM Eastern / midnight Pacific)
      const stopBastionRule = new events.Rule(this, `${id}-StopBastionNightly`, {
        schedule: events.Schedule.cron({ hour: "8", minute: "0" }),
        description: "Stop bastion host nightly at 08:00 UTC (3 AM ET / midnight PT)",
      });
      stopBastionRule.addTarget(new targets.AwsApi({
        service: "EC2",
        action: "stopInstances",
        parameters: { InstanceIds: [bastion.instanceId] },
        policyStatement: new iam.PolicyStatement({
          actions: ["ec2:StopInstances"],
          resources: [`arn:${this.partition}:ec2:${this.region}:${this.account}:instance/${bastion.instanceId}`],
        }),
      }));
      // ─────────────────────────────────────────────────────────────────────────

      // Get default security group for VPC
      const defaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        id,
        this.vpc.vpcDefaultSecurityGroup
      );
    } else {
      this.vpcCidrString = "10.0.0.0/16";

      const natGatewayProvider = ec2.NatProvider.gateway();

      // VPC for application
      this.vpc = new ec2.Vpc(this, "vci-Vpc", {
        ipAddresses: ec2.IpAddresses.cidr(this.vpcCidrString),
        natGatewayProvider: natGatewayProvider,
        natGateways: 1,
        maxAzs: 2,
        subnetConfiguration: [
          {
            name: "public-subnet-1",
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            name: "private-subnet-1",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            name: "isolated-subnet-1",
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });

      this.vpc.addFlowLog("vci-vpcFlowLog");

      // Add secrets manager endpoint to VPC
      this.vpc.addInterfaceEndpoint(`${id}-Secrets Manager Endpoint`, {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });

      // Add RDS endpoint to VPC
      this.vpc.addInterfaceEndpoint(`${id}-RDS Endpoint`, {
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });
    }
  }
}