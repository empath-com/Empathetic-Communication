const { getSimulationGroupVoiceConfig } = require("./groupsService");
const { BadRequestError, NotFoundError } = require("../shared/errors");
const {
  DescribeVoicesCommand,
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");

const ENGINE_PREFERENCE = ["generative", "long-form", "neural", "standard"];
const VOICE_SAMPLE_TEXT = "Hello, I am here to talk about how I am feeling today.";

async function getStudentVoiceEnabledConfig(sqlConnection, simulationGroupId) {
  return getSimulationGroupVoiceConfig(sqlConnection, simulationGroupId);
}

async function updateInstructorVoiceSetting(sqlConnection, simulationGroupId, instructorVoiceEnabled) {
  const result = await sqlConnection`
    UPDATE "simulation_groups"
    SET instructor_voice_enabled = ${instructorVoiceEnabled === "true"}
    WHERE simulation_group_id = ${simulationGroupId}
    RETURNING *;
  `;

  if (!result.length) {
    throw new NotFoundError("Simulation group not found");
  }

  return {
    message: "Voice settings updated successfully",
    instructor_voice_enabled: result[0].instructor_voice_enabled,
  };
}

async function getPollyVoices() {
  const client = new PollyClient({ region: process.env.AWS_REGION });
  const voices = [];
  let nextToken;

  do {
    const response = await client.send(new DescribeVoicesCommand({ NextToken: nextToken }));
    voices.push(...(response.Voices || []));
    nextToken = response.NextToken;
  } while (nextToken);

  return voices
    .map((voice) => {
      const supportedEngines = voice.SupportedEngines || [];
      const preferredEngine = ENGINE_PREFERENCE.find((engine) => supportedEngines.includes(engine));
      return {
        id: voice.Id,
        name: voice.Name,
        gender: voice.Gender,
        languageCode: voice.LanguageCode,
        languageName: voice.LanguageName,
        supportedEngines,
        preferredEngine,
      };
    })
    .sort((left, right) => {
      const leftEngine = ENGINE_PREFERENCE.indexOf(left.preferredEngine);
      const rightEngine = ENGINE_PREFERENCE.indexOf(right.preferredEngine);
      const leftRank = leftEngine === -1 ? ENGINE_PREFERENCE.length : leftEngine;
      const rightRank = rightEngine === -1 ? ENGINE_PREFERENCE.length : rightEngine;
      return leftRank - rightRank
        || left.languageName.localeCompare(right.languageName)
        || left.name.localeCompare(right.name);
    });
}

async function streamToBuffer(stream) {
  if (!stream) {
    throw new Error("Polly did not return audio data");
  }

  if (typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function synthesizeVoiceSample(voiceId) {
  if (!voiceId) {
    throw new BadRequestError("voice_id is required");
  }

  const voice = (await getPollyVoices()).find((item) => item.id === voiceId);
  if (!voice) {
    throw new BadRequestError("Selected voice is not available");
  }

  const client = new PollyClient({ region: process.env.AWS_REGION });
  const response = await client.send(
    new SynthesizeSpeechCommand({
      Engine: voice.preferredEngine,
      OutputFormat: "mp3",
      Text: VOICE_SAMPLE_TEXT,
      TextType: "text",
      VoiceId: voice.id,
    })
  );

  return {
    audio: (await streamToBuffer(response.AudioStream)).toString("base64"),
  };
}

module.exports = {
  getStudentVoiceEnabledConfig,
  updateInstructorVoiceSetting,
  getPollyVoices,
  synthesizeVoiceSample,
};
