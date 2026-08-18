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
