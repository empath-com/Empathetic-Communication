const { getSimulationGroupVoiceConfig } = require("./groupsService");
const { NotFoundError } = require("../shared/errors");
const { DescribeVoicesCommand, PollyClient } = require("@aws-sdk/client-polly");

const ENGINE_PREFERENCE = ["generative", "long-form", "neural", "standard"];

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

module.exports = {
  getStudentVoiceEnabledConfig,
  updateInstructorVoiceSetting,
  getPollyVoices,
};
