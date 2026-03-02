Guide me through adding a new Lambda function to the Empathetic Communication project.

$ARGUMENTS

Follow these steps:

1. **Read context files first**:
   - Read `cdk/lib/api-service-stack.ts` to understand how existing Lambda functions are registered
   - Read `cdk/OpenAPI_Swagger_Definition.yaml` (first 100 lines) to understand the API spec format
   - Read an example Lambda in `cdk/lambda/lib/studentFunction.js` to see the pattern

2. **Ask clarifying questions** if the function name/purpose wasn't specified:
   - What is the function's purpose?
   - Which user role does it serve (admin/instructor/student)?
   - What HTTP method and path should it be on?
   - Does it need database access?

3. **Create the Lambda function file** in `cdk/lambda/<functionName>/index.js` following the existing pattern

4. **Register in api-service-stack.ts**: Add the Lambda construct and wire to API Gateway

5. **Update the OpenAPI spec** in `OpenAPI_Swagger_Definition.yaml` with the new endpoint

6. Remind me to run `cd cdk && npm run build` to check for TypeScript errors after changes
