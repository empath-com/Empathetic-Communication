const {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} = require("@aws-sdk/client-s3");
const { getInstructorGroups } = require("../services/groupsService");

const s3Client = new S3Client({});

function copySource(bucket, key) {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

async function deleteCopiedObjects(bucket, keys) {
  for (let index = 0; index < keys.length; index += 1000) {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.slice(index, index + 1000).map((Key) => ({ Key })) },
      })
    );
  }
}

async function copyPatientAssets(
  bucket,
  sourcePrefix,
  destinationPrefix,
  sourcePatientId,
  destinationPatientId,
  copiedKeys
) {
  let continuationToken;

  do {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: sourcePrefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const sourceObject of page.Contents || []) {
      const sourceKey = sourceObject.Key;
      const assetPath = sourceKey.slice(sourcePrefix.length);
      const destinationAssetPath = assetPath.replace(
        `profile_picture/${sourcePatientId}_profile_pic.`,
        `profile_picture/${destinationPatientId}_profile_pic.`
      );
      const destinationKey = `${destinationPrefix}${destinationAssetPath}`;
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: copySource(bucket, sourceKey),
          Key: destinationKey,
        })
      );
      copiedKeys.push(destinationKey);
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return copiedKeys;
}

const routes = {
  "POST /instructor/create_patient": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id &&
      event.queryStringParameters.patient_name &&
      event.queryStringParameters.patient_number &&
      event.queryStringParameters.patient_age &&
      event.queryStringParameters.patient_gender &&
      event.queryStringParameters.instructor_email &&
      event.body
    ) {
      const {
        simulation_group_id,
        patient_name,
        patient_number,
        patient_age,
        patient_gender,
        instructor_email,
        voice_id: provided_voice_id
      } = event.queryStringParameters;

      let { patient_prompt } = JSON.parse(event.body);

      // Set improved default patient prompt if not provided
      if (!patient_prompt || patient_prompt.trim() === "") {
        patient_prompt = "Act as a patient with the context you are given. You are interacting with a pharmacist to practice realistic patient-pharmacist communication. Engage naturally by describing your symptoms to help the pharmacist understand your condition. If the pharmacist seems uncertain, provide additional relevant information about how you're feeling. Stay in character as a patient seeking help.";
      }

      try {
        // Check if a patient with the same name already exists in the simulation group
        const existingPatient = await sqlConnection`
                SELECT * FROM "patients"
                WHERE simulation_group_id = ${simulation_group_id}
                AND patient_name = ${patient_name};
            `;

        if (existingPatient.length > 0) {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error:
              "A patient with this name already exists in the given simulation group.",
          });
          return response;
        }

        const feminine_voices = [
          "tiffany",
          "amy",
          "ambre",
          "beatrice",
          "greta",
          "lupe",
        ];
        const masculine_voices = [
          "matthew",
          "florian",
          "lorenzo",
          "lennart",
          "carlos",
        ];

        function getRandomVoice(voices) {
          return voices[Math.floor(Math.random() * voices.length)];
        }

        const voice_id = provided_voice_id?.trim() || (
          patient_gender.toLowerCase() === "female"
            ? getRandomVoice(feminine_voices)
            : getRandomVoice(masculine_voices)
        );

        // Insert new patient into the "patients" table with age and gender
        const newPatient = await sqlConnection`
                INSERT INTO "patients" (
                    patient_id,
                    simulation_group_id,
                    patient_name,
                    patient_number,
                    patient_age,
                    patient_gender,
                    patient_prompt,
                    voice_id
                )
                VALUES (
                    uuid_generate_v4(),
                    ${simulation_group_id},
                    ${patient_name},
                    ${patient_number},
                    ${patient_age},
                    ${patient_gender},
                    ${patient_prompt},
                    ${voice_id}
                )
                RETURNING *;
            `;

        // Log the patient creation in the User Engagement Log
        await sqlConnection`
                INSERT INTO "user_engagement_log" (
                    log_id,
                    user_id,
                    simulation_group_id,
                    patient_id,
                    enrolment_id,
                    timestamp,
                    engagement_type
                )
                VALUES (
                    uuid_generate_v4(),
                    (SELECT user_id FROM "users" WHERE user_email = ${instructor_email}),
                    ${simulation_group_id},
                    ${newPatient[0].patient_id},
                    null,
                    CURRENT_TIMESTAMP,
                    'instructor_created_patient'
                );
            `;

        // Find all student enrolments for the given simulation group
        const enrolments = await sqlConnection`
                SELECT enrolment_id FROM "enrolments"
                WHERE simulation_group_id = ${simulation_group_id};
            `;

        // Create entries for each enrolment in the "student_interactions" table
        await Promise.all(
          enrolments.map(async (enrolment) => {
            await sqlConnection`
                        INSERT INTO "student_interactions" (
                            student_interaction_id,
                            patient_id,
                            enrolment_id,
                            patient_score
                        )
                        VALUES (
                            uuid_generate_v4(),
                            ${newPatient[0].patient_id},
                            ${enrolment.enrolment_id},
                            0
                        );
                    `;
          })
        );

        response.statusCode = 201;
        response.body = JSON.stringify(newPatient[0]);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "simulation_group_id, patient_name, patient_number, patient_age, patient_gender, or instructor_email is missing",
      });
    }
    return response;
  },

  "PUT /instructor/reorder_patient": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.patient_number &&
      event.queryStringParameters.instructor_email
    ) {
      const { patient_id, patient_number, instructor_email } =
        event.queryStringParameters;
      const { patient_name } = JSON.parse(event.body || "{}");

      if (patient_name) {
        try {
          // Update the patient in the patients table
          await sqlConnection`
                UPDATE "patients"
                SET patient_name = ${patient_name}, patient_number = ${patient_number}
                WHERE patient_id = ${patient_id};
              `;

          // Insert into User Engagement Log
          await sqlConnection`
                INSERT INTO "user_engagement_log" (log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type)
                VALUES (uuid_generate_v4(), (SELECT user_id FROM "users" WHERE user_email = ${instructor_email}), NULL, ${patient_id}, NULL, CURRENT_TIMESTAMP, 'instructor_edited_patient');
              `;

          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "Patient updated successfully",
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({
            error: "Internal server error",
          });
        }
      } else {
        response.statusCode = 400;
        response.body = JSON.stringify({
          error: "patient_name is required in the body",
        });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "patient_id, patient_number, or instructor_email is missing in query string parameters",
      });
    }
    return response;
  },

  "PUT /instructor/edit_patient": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id &&
      event.queryStringParameters.instructor_email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { patient_id, instructor_email, simulation_group_id } =
        event.queryStringParameters;
      const { patient_name, patient_age, patient_gender, patient_prompt, voice_id } =
        JSON.parse(event.body || "{}");

      if (
        patient_name != null &&
        patient_age != null &&
        patient_gender != null &&
        patient_prompt != null
      ) {
        try {
          // Check if another patient with the same name exists under the same simulation group
          const existingPatient = await sqlConnection`
                    SELECT * FROM "patients"
                    WHERE simulation_group_id = ${simulation_group_id}
                    AND patient_name = ${patient_name}
                    AND patient_id != ${patient_id};
                `;

          if (existingPatient.length > 0) {
            response.statusCode = 400;
            response.body = JSON.stringify({
              error: "A patient with this name already exists.",
            });
            return response;
          }

          const currentPatient = await sqlConnection`
                    SELECT patient_prompt
                    FROM "patients"
                    WHERE patient_id = ${patient_id}
                      AND simulation_group_id = ${simulation_group_id};
                `;

          // Update the patient details in the patients table
          await sqlConnection`
                    UPDATE "patients"
                    SET
                        patient_name = ${patient_name},
                        patient_age = ${patient_age},
                        patient_gender = ${patient_gender},
                        patient_prompt = ${patient_prompt},
                        voice_id = COALESCE(${voice_id ?? null}, voice_id)
                    WHERE patient_id = ${patient_id};
                `;

          if (
            currentPatient[0] &&
            currentPatient[0].patient_prompt !== patient_prompt
          ) {
            await sqlConnection`
                      INSERT INTO "patient_prompt_history" (patient_id, prompt_content)
                      VALUES (${patient_id}, ${currentPatient[0].patient_prompt});
                  `;
          }

          // Insert into User Engagement Log
          await sqlConnection`
                    INSERT INTO "user_engagement_log" (
                        log_id,
                        user_id,
                        simulation_group_id,
                        patient_id,
                        enrolment_id,
                        timestamp,
                        engagement_type
                    ) VALUES (
                        uuid_generate_v4(),
                        (SELECT user_id FROM "users" WHERE user_email = ${instructor_email}),
                        ${simulation_group_id},
                        ${patient_id},
                        NULL,
                        CURRENT_TIMESTAMP,
                        'instructor_edited_patient'
                    );
                `;

          response.statusCode = 200;
          response.body = JSON.stringify({
            message: "Patient updated successfully",
          });
        } catch (err) {
          response.statusCode = 500;
          console.error(err);
          response.body = JSON.stringify({
            error: "Internal server error",
          });
        }
      } else {
        response.statusCode = 400;
        response.body = JSON.stringify({
          error:
            "patient_name, patient_age, patient_gender, and patient_prompt are required in the body",
        });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "patient_id or instructor_email is missing in query string parameters",
      });
    }
    return response;
  },

  "GET /instructor/patient_prompt_history": async ({
    event,
    sqlConnection,
    response,
  }) => {
    const { patient_id, simulation_group_id, instructor_email } =
      event.queryStringParameters || {};

    if (!patient_id || !simulation_group_id || !instructor_email) {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error:
          "patient_id, simulation_group_id, and instructor_email query parameters are required",
      });
      return response;
    }

    try {
      const promptHistory = await sqlConnection`
        SELECT history_id, prompt_content, created_at
        FROM "patient_prompt_history"
        WHERE patient_id = ${patient_id}
          AND EXISTS (
            SELECT 1
            FROM "patients"
            WHERE patient_id = ${patient_id}
              AND simulation_group_id = ${simulation_group_id}
          )
        ORDER BY created_at DESC;
      `;

      response.statusCode = 200;
      response.body = JSON.stringify(promptHistory);
    } catch (err) {
      response.statusCode = 500;
      console.error(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }

    return response;
  },

  "POST /instructor/duplicate_patient": async ({
    event,
    sqlConnection,
    response,
    userEmailAttribute,
  }) => {
    const {
      source_patient_id: sourcePatientId,
      destination_simulation_group_id: destinationGroupId,
    } = event.queryStringParameters || {};

    let requestedName;
    try {
      ({ patient_name: requestedName } = JSON.parse(event.body || "{}"));
    } catch {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "Request body must be valid JSON" });
      return response;
    }

    if (requestedName != null && (typeof requestedName !== "string" || !requestedName.trim())) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "patient_name must be a non-empty string" });
      return response;
    }

    try {
      const [sourcePatients, instructorGroups] = await Promise.all([
        sqlConnection`
          SELECT * FROM "patients"
          WHERE patient_id = ${sourcePatientId};
        `,
        getInstructorGroups(sqlConnection, userEmailAttribute),
      ]);
      const sourcePatient = sourcePatients[0];
      const authorizedGroupIds = new Set(
        instructorGroups.map((group) => group.simulation_group_id)
      );

      if (!sourcePatient) {
        response.statusCode = 404;
        response.body = JSON.stringify({ error: "Patient not found" });
        return response;
      }

      if (
        !authorizedGroupIds.has(sourcePatient.simulation_group_id) ||
        !authorizedGroupIds.has(destinationGroupId)
      ) {
        response.statusCode = 403;
        response.body = JSON.stringify({ error: "Unauthorized" });
        return response;
      }

      const defaultName = `Copy of ${sourcePatient.patient_name}`;
      let patientName = requestedName?.trim() || defaultName;
      const bucket = process.env.BUCKET;
      if (!bucket) {
        throw new Error("Patient asset bucket is not configured");
      }
      const existingNames = await sqlConnection`
        SELECT patient_name FROM "patients"
        WHERE simulation_group_id = ${destinationGroupId};
      `;
      const names = new Set(existingNames.map((patient) => patient.patient_name));

      if (names.has(patientName)) {
        let copyNumber = 2;
        do {
          patientName = `Copy ${copyNumber} of ${sourcePatient.patient_name}`;
          copyNumber += 1;
        } while (names.has(patientName));
      }

      const patientData = await sqlConnection`
        SELECT filetype, filename, metadata, file_number
        FROM "patient_data"
        WHERE patient_id = ${sourcePatientId};
      `;
      const [{ next_patient_number: patientNumber }] = await sqlConnection`
        SELECT COALESCE(MAX(patient_number), 0) + 1 AS next_patient_number
        FROM "patients"
        WHERE simulation_group_id = ${destinationGroupId};
      `;

      const duplicatePatient = await sqlConnection.begin(async (sql) => {
        const [newPatient] = await sql`
          INSERT INTO "patients" (
            patient_id,
            simulation_group_id,
            patient_name,
            patient_number,
            patient_age,
            patient_gender,
            patient_prompt,
            voice_id,
            llm_completion
          ) VALUES (
            uuid_generate_v4(),
            ${destinationGroupId},
            ${patientName},
            ${patientNumber},
            ${sourcePatient.patient_age},
            ${sourcePatient.patient_gender},
            ${sourcePatient.patient_prompt},
            ${sourcePatient.voice_id},
            ${sourcePatient.llm_completion}
          )
          RETURNING *;
        `;

        for (const file of patientData) {
          await sql`
            INSERT INTO "patient_data" (file_id, patient_id, filetype, filename, metadata, file_number)
            VALUES (
              uuid_generate_v4(),
              ${newPatient.patient_id},
              ${file.filetype},
              ${file.filename},
              ${file.metadata},
              ${file.file_number}
            );
          `;
        }

        const enrolments = await sql`
          SELECT enrolment_id FROM "enrolments"
          WHERE simulation_group_id = ${destinationGroupId};
        `;
        for (const enrolment of enrolments) {
          await sql`
            INSERT INTO "student_interactions" (
              student_interaction_id,
              patient_id,
              enrolment_id,
              patient_score
            ) VALUES (
              uuid_generate_v4(),
              ${newPatient.patient_id},
              ${enrolment.enrolment_id},
              0
            );
          `;
        }

        await sql`
          INSERT INTO "user_engagement_log" (
            log_id,
            user_id,
            simulation_group_id,
            patient_id,
            enrolment_id,
            timestamp,
            engagement_type
          ) VALUES (
            uuid_generate_v4(),
            (SELECT user_id FROM "users" WHERE user_email = ${userEmailAttribute}),
            ${destinationGroupId},
            ${newPatient.patient_id},
            NULL,
            CURRENT_TIMESTAMP,
            'instructor_duplicated_patient'
          );
        `;

        return newPatient;
      });

      const sourcePrefix = `${sourcePatient.simulation_group_id}/${sourcePatientId}/`;
      const destinationPrefix = `${destinationGroupId}/${duplicatePatient.patient_id}/`;
      let copiedKeys = [];

      try {
        await copyPatientAssets(
          bucket,
          sourcePrefix,
          destinationPrefix,
          sourcePatientId,
          duplicatePatient.patient_id,
          copiedKeys
        );
      } catch (error) {
        try {
          await deleteCopiedObjects(bucket, copiedKeys);
          await sqlConnection`
            DELETE FROM "patients"
            WHERE patient_id = ${duplicatePatient.patient_id};
          `;
        } catch (cleanupError) {
          console.error(cleanupError);
        }
        throw error;
      }

      response.statusCode = 201;
      response.body = JSON.stringify(duplicatePatient);
    } catch (err) {
      response.statusCode = 500;
      console.error(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }

    return response;
  },

  "GET /instructor/view_patients": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { simulation_group_id } = event.queryStringParameters;

      try {
        // Query to get all patients for the given simulation group
        const simulationPatients = await sqlConnection`
                SELECT p.patient_id, p.patient_name, p.patient_age, p.patient_gender, p.patient_prompt, p.llm_completion, p.voice_id
                FROM "patients" p
                WHERE p.simulation_group_id = ${simulation_group_id}
                ORDER BY p.patient_name ASC;
            `;

        response.statusCode = 200;
        response.body = JSON.stringify(simulationPatients);
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "simulation_group_id is required",
      });
    }
    return response;
  },

  "DELETE /instructor/delete_patient": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.patient_id
    ) {
      const patientId = event.queryStringParameters.patient_id;

      try {
        // Delete the patient from the patients table
        await sqlConnection`
                DELETE FROM "patients"
                WHERE patient_id = ${patientId};
            `;

        response.statusCode = 200;
        response.body = JSON.stringify({
          message: "Patient deleted successfully",
        });
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "patient_id is required" });
    }
    return response;
  },
};

module.exports = routes;
