import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Duration } from "aws-cdk-lib";
import { DatabaseStack } from "../database-stack";
import { VpcStack } from "../vpc-stack";

export interface CognitoAuthProps {
  id: string;
  db: DatabaseStack;
  vpcStack: VpcStack;
  apiRestApiId: string;
  postgres: lambda.LayerVersion;
}

export interface CognitoAuthResult {
  userPool: cognito.UserPool;
  appClient: cognito.UserPoolClient;
  identityPool: cognito.CfnIdentityPool;
  secret: secretsmanager.Secret;
  lambdaRole: iam.Role;
  cogLambdaRole: iam.Role;
}

export function createCognitoAuth(
  scope: cdk.Stack,
  props: CognitoAuthProps
): CognitoAuthResult {
  const { id, db, vpcStack, apiRestApiId, postgres } = props;

  const sesFromEmail = process.env.COGNITO_SES_FROM_EMAIL?.trim();
  const sesFromName = process.env.COGNITO_SES_FROM_NAME?.trim();
  const sesReplyTo = process.env.COGNITO_SES_REPLY_TO?.trim();
  const sesConfigurationSetName =
    process.env.COGNITO_SES_CONFIGURATION_SET?.trim();
  const sesRegion = process.env.COGNITO_SES_REGION?.trim();
  const sesVerifiedDomain = process.env.COGNITO_SES_VERIFIED_DOMAIN?.trim();

  const userPoolEmail = sesFromEmail
    ? cognito.UserPoolEmail.withSES({
        fromEmail: sesFromEmail,
        fromName: sesFromName || "Virtual Care Interactions",
        replyTo: sesReplyTo,
        configurationSetName: sesConfigurationSetName,
        sesRegion,
        sesVerifiedDomain,
      })
    : undefined;

  cdk.Annotations.of(scope).addInfo(
    userPoolEmail
      ? "Cognito User Pool email sending configured to use Amazon SES (DEVELOPER mode)."
      : "Cognito User Pool email sending uses Cognito default sender. Set COGNITO_SES_FROM_EMAIL to switch to Amazon SES."
  );

  // Helper to create policy statements
  const createPolicyStatement = (actions: string[], resources: string[]) => {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: actions,
      resources: resources,
    });
  };

  // Create Cognito User Pool
  const userPoolName = `${id}-UserPool`;
  const userPool = new cognito.UserPool(scope, `${id}-pool`, {
    userPoolName: userPoolName,
    email: userPoolEmail,
    signInAliases: {
      email: true,
    },
    selfSignUpEnabled: true,
    autoVerify: {
      email: true,
    },
    userVerification: {
      emailSubject: "Confirm your email for Virtual Care Interactions",
      emailBody: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Verify your email</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    body { margin:0; padding:0; background:#f3faf6; font-family:'Outfit',Arial,'Helvetica Neue',Helvetica,sans-serif; -webkit-font-smoothing:antialiased; color:#203128; }
    a { color:#0d6b47; text-decoration:none; }
    .full { width:100%; }
    .container { max-width:600px; margin:0 auto; }
    .shadow { box-shadow:0 4px 16px rgba(0,0,0,0.06); }
    .rounded { border-radius:18px; }
    .p { padding:40px 44px 36px; }
    h1 { margin:0 0 16px; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:0.3px; color:#0d6b47; }
    p { margin:0 0 18px; font-size:15px; line-height:1.55; }
    .header-bar { background:linear-gradient(135deg,#0d6b47,#15915d); padding:24px 44px 70px; text-align:left; border-radius:24px 24px 0 0; position:relative; overflow:hidden; }
    .brand { font-size:18px; font-weight:600; color:#ffffff; letter-spacing:0.5px; }
    .panel { background:#ffffff; position:relative; top:-56px; border:1px solid #dcefe3; }
    .code-wrap { text-align:center; margin:28px 0 10px; }
    .code-label { font-size:12px; font-weight:600; letter-spacing:1px; color:#3d5a4b; text-transform:uppercase; margin-bottom:10px; }
    .code { display:inline-block; background:#0d6b47; color:#ffffff; font-weight:700; font-size:34px; letter-spacing:10px; padding:18px 26px 18px 32px; border-radius:14px; box-shadow:0 4px 10px rgba(13,107,71,0.25); font-family:'Outfit',Arial,sans-serif; }
    .divider { height:1px; background:linear-gradient(to right,rgba(13,107,71,0.15),rgba(13,107,71,0.05),rgba(13,107,71,0.15)); margin:34px 0 26px; border:none; }
    ul { margin:0 0 18px 20px; padding:0; }
    li { margin:0 0 8px; }
    .muted { font-size:12px; line-height:1.45; color:#5c6b61; margin-top:6px; }
    .footer { text-align:center; font-size:11px; line-height:1.4; color:#6f7d74; padding:0 24px 40px; }
    .btn-wrap { text-align:center; margin-top:30px; }
    .btn { background:#15915d; background:linear-gradient(135deg,#15915d,#0d6b47); color:#ffffff !important; padding:14px 30px; font-size:15px; font-weight:600; border-radius:40px; display:inline-block; letter-spacing:0.4px; box-shadow:0 4px 12px rgba(21,145,93,0.35); }
    .btn:hover { filter:brightness(1.05); }
    @media (max-width:640px){ .p { padding:34px 28px 30px; } .header-bar { padding:22px 28px 62px; } h1 { font-size:24px; } .code { font-size:30px; letter-spacing:8px; padding:16px 22px 16px 28px; } }
    @media (prefers-color-scheme: dark){ body { background:#0c1410; color:#e6efe9; } .panel { background:#15221b; border-color:#1e3027; } h1 { color:#6ee7b7; } p, .muted, .footer, li { color:#d9e7dd; } .code { background:#16a34a; box-shadow:0 4px 12px rgba(0,0,0,0.5); } .header-bar { background:linear-gradient(135deg,#0f5132,#157347); } .btn { background:linear-gradient(135deg,#16a34a,#0f5132); box-shadow:0 4px 12px rgba(0,0,0,0.6); } .divider { background:linear-gradient(to right,rgba(110,231,183,0.25),rgba(110,231,183,0.05),rgba(110,231,183,0.25)); } }
  </style>
</head>
<body>
  <table role="presentation" class="full" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:#f3faf6; padding:32px 14px;">
    <tr>
      <td>
        <div class="container">
          <div class="header-bar">
            <div class="brand">Virtual Care Interactions</div>
          </div>
          <div class="panel rounded shadow">
            <div class="p">
              <h1>Confirm your email</h1>
              <p>Welcome to <strong>Virtual Care Interactions</strong>!</p>
              <p>Use the verification code below to complete your sign up:</p>
              <div class="code-wrap">
                <div class="code-label">Your verification code</div>
                <div class="code">{####}</div>
              </div>
              <hr class="divider" />
              <p style="margin:0 0 12px; font-weight:600; color:#0d6b47;">Don't remember signing up?</p>
              <ul>
                <li>If you didn't request this email you can ignore it safely.</li>
              </ul>
            </div>
            <div class="footer">You are receiving this email because a sign-up was initiated for this address. If this wasn't you, no further action is required.</div>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`,
      emailStyle: cognito.VerificationEmailStyle.CODE,
    },
    passwordPolicy: {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: false,
    },
    accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  // Create app client
  const appClient = userPool.addClient(`${id}-pool`, {
    userPoolClientName: userPoolName,
    authFlows: {
      userPassword: true,
      custom: true,
      userSrp: true,
    },
  });

  const identityPool = new cognito.CfnIdentityPool(
    scope,
    `${id}-identity-pool`,
    {
      allowUnauthenticatedIdentities: true,
      identityPoolName: `${id}-IdentityPool`,
      cognitoIdentityProviders: [
        {
          clientId: appClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    }
  );

  const secretsName = `${id}-VCI_Cognito_Secrets`;

  const secret = new secretsmanager.Secret(scope, secretsName, {
    secretName: secretsName,
    description: "Cognito Secrets for authentication",
    secretObjectValue: {
      VITE_COGNITO_USER_POOL_ID: cdk.SecretValue.unsafePlainText(
        userPool.userPoolId
      ),
      VITE_COGNITO_USER_POOL_CLIENT_ID: cdk.SecretValue.unsafePlainText(
        appClient.userPoolClientId
      ),
      VITE_AWS_REGION: cdk.SecretValue.unsafePlainText(scope.region),
      VITE_IDENTITY_POOL_ID: cdk.SecretValue.unsafePlainText(
        identityPool.ref
      ),
    },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  // Create roles for each user group
  const studentRole = new iam.Role(scope, `${id}-StudentRole`, {
    assumedBy: new iam.FederatedPrincipal(
      "cognito-identity.amazonaws.com",
      {
        StringEquals: {
          "cognito-identity.amazonaws.com:aud": identityPool.ref,
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated",
        },
      },
      "sts:AssumeRoleWithWebIdentity"
    ),
  });

  studentRole.attachInlinePolicy(
    new iam.Policy(scope, `${id}-StudentPolicy`, {
      statements: [
        createPolicyStatement(
          ["execute-api:Invoke"],
          [
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student/*`,
          ]
        ),
        // Add DynamoDB permissions for Nova Sonic
        createPolicyStatement(
          [
            "dynamodb:GetItem",
            "dynamodb:Query",
            "dynamodb:Scan",
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
          ],
          [
            `arn:aws:dynamodb:${scope.region}:${scope.account}:table/DynamoDB-Conversation-Table`,
          ]
        ),
        // Add Bedrock permissions for Nova Sonic
        createPolicyStatement(
          [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithBidirectionalStream",
            "bedrock:Converse",
            "bedrock:ConverseStream",
            "bedrock:InvokeModelWithResponseStream",
          ],
          ["*"]
        ),
        // Add Transcribe streaming permission for Polly/Transcribe voice pipeline
        createPolicyStatement(
          ["transcribe:StartStreamTranscriptionWebSocket"],
          ["*"]
        ),
        // Add Polly permission for Polly/Transcribe voice pipeline
        createPolicyStatement(
          ["polly:DescribeVoices", "polly:SynthesizeSpeech", "polly:StartSpeechSynthesisStream"],
          ["*"]
        ),
        // Add Secrets Manager permissions for Nova Sonic
        createPolicyStatement(
          ["secretsmanager:GetSecretValue"],
          [db.secretPathUser.secretArn]
        ),
      ],
    })
  );

  const instructorRole = new iam.Role(scope, `${id}-InstructorRole`, {
    assumedBy: new iam.FederatedPrincipal(
      "cognito-identity.amazonaws.com",
      {
        StringEquals: {
          "cognito-identity.amazonaws.com:aud": identityPool.ref,
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated",
        },
      },
      "sts:AssumeRoleWithWebIdentity"
    ),
  });

  instructorRole.attachInlinePolicy(
    new iam.Policy(scope, `${id}-InstructorPolicy`, {
      statements: [
        createPolicyStatement(
          ["execute-api:Invoke"],
          [
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor/*`,
          ]
        ),
      ],
    })
  );

  const adminRole = new iam.Role(scope, `${id}-AdminRole`, {
    assumedBy: new iam.FederatedPrincipal(
      "cognito-identity.amazonaws.com",
      {
        StringEquals: {
          "cognito-identity.amazonaws.com:aud": identityPool.ref,
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated",
        },
      },
      "sts:AssumeRoleWithWebIdentity"
    ),
  });

  adminRole.attachInlinePolicy(
    new iam.Policy(scope, `${id}-AdminPolicy`, {
      statements: [
        createPolicyStatement(
          ["execute-api:Invoke"],
          [
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/admin/*`,
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/instructor/*`,
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*/*/student/*`,
          ]
        ),
      ],
    })
  );

  const techAdminRole = new iam.Role(scope, `${id}-TechAdminRole`, {
    assumedBy: new iam.FederatedPrincipal(
      "cognito-identity.amazonaws.com",
      {
        StringEquals: {
          "cognito-identity.amazonaws.com:aud": identityPool.ref,
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated",
        },
      },
      "sts:AssumeRoleWithWebIdentity"
    ),
  });

  techAdminRole.attachInlinePolicy(
    new iam.Policy(scope, `${id}-TechAdminPolicy`, {
      statements: [
        createPolicyStatement(
          ["execute-api:Invoke"],
          [
            `arn:aws:execute-api:${scope.region}:${scope.account}:${apiRestApiId}/*`,
          ]
        ),
      ],
    })
  );

  // Create Cognito user pool groups
  new cognito.CfnUserPoolGroup(scope, `${id}-StudentGroup`, {
    groupName: "student",
    userPoolId: userPool.userPoolId,
    roleArn: studentRole.roleArn,
  });

  new cognito.CfnUserPoolGroup(scope, `${id}-InstructorGroup`, {
    groupName: "instructor",
    userPoolId: userPool.userPoolId,
    roleArn: instructorRole.roleArn,
  });

  new cognito.CfnUserPoolGroup(scope, `${id}-AdminGroup`, {
    groupName: "admin",
    userPoolId: userPool.userPoolId,
    roleArn: adminRole.roleArn,
  });

  new cognito.CfnUserPoolGroup(scope, `${id}-TechAdminGroup`, {
    groupName: "techadmin",
    userPoolId: userPool.userPoolId,
    roleArn: techAdminRole.roleArn,
  });

  // Create unauthenticated role with no permissions
  const unauthenticatedRole = new iam.Role(
    scope,
    `${id}-UnauthenticatedRole`,
    {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    }
  );

  // Create the main Lambda role
  const lambdaRole = new iam.Role(
    scope,
    `${id}-postgresLambdaRole-${scope.region}`,
    {
      roleName: `${id}-postgresLambdaRole-${scope.region}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    }
  );

  // Grant access to Secret Manager
  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  // Grant access to EC2
  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ],
      resources: ["*"],
    })
  );

  // Grant access to log
  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      resources: ["arn:aws:logs:*:*:*"],
    })
  );

  // Grant access to RDS proxy
  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["rds-db:connect"],
      resources: [
        `arn:aws:rds-db:${scope.region}:${scope.account}:dbuser:*/applicationUsername`,
      ],
    })
  );

  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["polly:DescribeVoices"],
      resources: ["*"],
    })
  );

  // Inline policy to allow AdminAddUserToGroup action
  const adminAddUserToGroupPolicyLambda = new iam.Policy(
    scope,
    `${id}-adminAddUserToGroupPolicyLambda`,
    {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminRemoveUserFromGroup",
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminListGroupsForUser",
          ],
          resources: [
            `arn:aws:cognito-idp:${scope.region}:${scope.account}:userpool/${userPool.userPoolId}`,
          ],
        }),
      ],
    }
  );

  // Attach the inline policy to the role
  lambdaRole.attachInlinePolicy(adminAddUserToGroupPolicyLambda);

  // Attach roles to the identity pool
  new cognito.CfnIdentityPoolRoleAttachment(scope, `${id}-IdentityPoolRoles`, {
    identityPoolId: identityPool.ref,
    roles: {
      authenticated: studentRole.roleArn,
      unauthenticated: unauthenticatedRole.roleArn,
    },
  });

  // Create the Cognito Lambda role
  const cogLambdaRole = new iam.Role(
    scope,
    `${id}-cognitoLambdaRole-${scope.region}`,
    {
      roleName: `${id}-cognitoLambdaRole-${scope.region}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    }
  );

  // Grant access to Secret Manager
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  // Grant access to EC2
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ],
      resources: ["*"],
    })
  );

  // Grant access to log
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      resources: ["arn:aws:logs:*:*:*"],
    })
  );

  // Grant access to RDS proxy
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["rds-db:connect"],
      resources: [
        `arn:aws:rds-db:${scope.region}:${scope.account}:dbuser:*/applicationUsername`,
      ],
    })
  );

  // Grant permission to add users to an IAM group
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["iam:AddUserToGroup"],
      resources: [
        `arn:aws:iam::${scope.account}:user/*`,
        `arn:aws:iam::${scope.account}:group/*`,
      ],
    })
  );

  // Inline policy to allow AdminAddUserToGroup action
  const adminAddUserToGroupPolicy = new iam.Policy(
    scope,
    `${id}-AdminAddUserToGroupPolicy`,
    {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "cognito-idp:AdminAddUserToGroup",
            "cognito-idp:AdminRemoveUserFromGroup",
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminListGroupsForUser",
          ],
          resources: [
            `arn:aws:cognito-idp:${scope.region}:${scope.account}:userpool/${userPool.userPoolId}`,
          ],
        }),
      ],
    }
  );

  // Attach the inline policy to the role
  cogLambdaRole.attachInlinePolicy(adminAddUserToGroupPolicy);

  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
      ],
      resources: [
        `arn:aws:secretsmanager:${scope.region}:${scope.account}:secret:*`,
      ],
    })
  );

  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:aws:ssm:${scope.region}:${scope.account}:parameter/*`],
    })
  );

  // Grant access to RDS proxy (duplicate from original)
  cogLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["rds-db:connect"],
      resources: [
        `arn:aws:rds-db:${scope.region}:${scope.account}:dbuser:*/applicationUsername`,
      ],
    })
  );

  // Cognito trigger Lambdas
  const AutoSignupLambda = new lambda.Function(
    scope,
    `${id}-addStudentOnSignUp`,
    {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "addStudentOnSignUp.handler",
      timeout: Duration.seconds(300),
      environment: {
        SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
      },
      vpc: vpcStack.vpc,
      securityGroups: [db.lambdaSecurityGroup],
      functionName: `${id}-addStudentOnSignUp`,
      memorySize: 256,
      layers: [postgres],
      role: cogLambdaRole,
    }
  );

  const adjustUserRoles = new lambda.Function(scope, `${id}-adjustUserRoles`, {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/lib"),
    handler: "adjustUserRoles.handler",
    timeout: Duration.seconds(300),
    environment: {
      SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
    },
    vpc: vpcStack.vpc,
    securityGroups: [db.lambdaSecurityGroup],
    functionName: `${id}-adjustUserRoles`,
    memorySize: 512,
    layers: [postgres],
    role: cogLambdaRole,
  });

  userPool.addTrigger(
    cognito.UserPoolOperation.POST_AUTHENTICATION,
    adjustUserRoles
  );

  userPool.addTrigger(
    cognito.UserPoolOperation.POST_CONFIRMATION,
    AutoSignupLambda
  );

  new cdk.CfnOutput(scope, `${id}-UserPoolIdOutput`, {
    value: userPool.userPoolId,
    description: "The ID of the Cognito User Pool",
  });

  const preSignupLambda = new lambda.Function(scope, `preSignupLambda`, {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/lib"),
    handler: "preSignup.handler",
    timeout: Duration.seconds(300),
    environment: {
      ALLOWED_EMAIL_DOMAINS: "/VCI/AllowedEmailDomains",
    },
    vpc: vpcStack.vpc,
    functionName: `${id}-preSignupLambda`,
    memorySize: 256,
    role: cogLambdaRole,
  });
  userPool.addTrigger(
    cognito.UserPoolOperation.PRE_SIGN_UP,
    preSignupLambda
  );

  return {
    userPool,
    appClient,
    identityPool,
    secret,
    lambdaRole,
    cogLambdaRole,
  };
}
