Check the health status of the deployed AWS infrastructure for the Empathetic Communication project.

Run the following checks in sequence and summarize findings:

1. List ECS clusters and describe their services to check task counts and deployment status
2. Check ECS target health via the load balancer target groups
3. List recent CloudWatch log groups related to the project (filter for "Empathetic" or "empathetic")
4. Check any CloudWatch alarms that are in ALARM state
5. List Lambda functions and check for any with recent errors (check last invocation errors if possible)

Use these AWS CLI commands (already allowed in settings):
- `aws ecs list-clusters`
- `aws ecs list-services --cluster <cluster-arn>`
- `aws ecs describe-services --cluster <cluster> --services <service>`
- `aws elbv2 describe-target-groups`
- `aws elbv2 describe-target-health --target-group-arn <arn>`
- `aws logs describe-log-groups --log-group-name-prefix /aws/lambda`
- `aws cloudwatch describe-alarms --state-value ALARM`

Summarize: what's healthy, what needs attention, and any recommended next steps.
