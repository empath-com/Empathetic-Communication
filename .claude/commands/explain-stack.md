Give me a comprehensive explanation of a specific CDK stack or component in this project.

$ARGUMENTS

If no specific stack is named, explain the full deployment architecture:

1. Read `cdk/lib/api-service-stack.ts` and summarize what AWS resources it creates
2. Read `cdk/lib/ecs-socket-stack.ts` and explain the real-time voice/chat infrastructure
3. Read `cdk/lib/database-stack.ts` and describe the database setup
4. Read `cdk/lib/vpc-stack.ts` and describe the network topology
5. Read `cdk/lib/amplify-stack.ts` for frontend hosting details

Explain:
- What each stack creates and why
- How the stacks depend on each other
- Data flow between components
- Key configuration parameters and what they control
- Any important security boundaries (VPC, security groups, IAM roles)
