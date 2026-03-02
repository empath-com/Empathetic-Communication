Retrieve and analyze recent CloudWatch logs for the Empathetic Communication project.

$ARGUMENTS

If a specific function/service name is provided in $ARGUMENTS, search for logs from that component.
Otherwise, check logs from all key components.

Steps:
1. List log groups: `aws logs describe-log-groups --log-group-name-prefix /aws/lambda`
2. For each relevant log group, get the most recent log stream
3. Fetch the last 50 log events from that stream
4. Look for ERROR, WARN, or exception patterns

Key log groups to check:
- `/aws/lambda/` prefix for Lambda functions
- ECS task logs if checking socket server

Summarize:
- Any errors or exceptions found
- Which functions/services have recent activity
- Timestamps of the most recent logs
- Recommended investigation steps for any errors found

Use `aws logs describe-log-groups`, `aws logs describe-log-streams`, and `aws logs get-log-events`.
