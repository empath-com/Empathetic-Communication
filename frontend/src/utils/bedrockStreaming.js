import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { fetchAuthSession } from "aws-amplify/auth";

/**
 * Stream response directly from Bedrock using AWS SDK
 */
export async function streamBedrockResponse({
  messages,
  systemPrompt,
  onChunk,
  onComplete,
  onError
}) {
  try {
    // Get AWS credentials from Cognito
    const session = await fetchAuthSession();
    const credentials = session.credentials;

    if (!credentials) {
      throw new Error("No AWS credentials available");
    }

    // Create Bedrock client
    const client = new BedrockRuntimeClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    // Prepare the conversation
    const conversationMessages = messages.map(msg => ({
      role: msg.role,
      content: [{ text: msg.content }]
    }));

    const command = new ConverseStreamCommand({
      modelId: "meta.llama3-70b-instruct-v1:0",
      messages: conversationMessages,
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        temperature: 0.7,
        maxTokens: 1000,
      },
    });

    // Execute streaming command
    const response = await client.send(command);
    let fullResponse = "";

    // Process the stream
    for await (const chunk of response.stream) {
      if (chunk.contentBlockDelta?.delta?.text) {
        const text = chunk.contentBlockDelta.delta.text;
        fullResponse += text;
        onChunk(text);
      }
    }

    onComplete(fullResponse);
  } catch (error) {
    console.error("Bedrock streaming error:", error);
    onError(error);
  }
}