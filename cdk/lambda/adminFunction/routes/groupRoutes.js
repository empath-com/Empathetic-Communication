/**
 * Admin group management route handlers.
 * Routes: GET simulation_groups, POST create_simulation_group,
 *         POST updateGroupAccess, DELETE delete_group,
 *         DELETE delete_group_instructor_enrolments,
 *         POST enroll_instructor, DELETE delete_instructor_enrolments,
 *         GET groupInstructors, GET instructorGroups
 */

const VALID_EMPATHY_TOOLS = ["CARE", "PRISM"];
const REQUIRED_EMPATHY_PROMPT_PLACEHOLDERS = ["{patient_context}", "{user_text}"];

function normalizeEmpathyPromptOverride(value, useGlobalDefaults) {
  if (useGlobalDefaults || value == null || (typeof value === "string" && !value.trim())) {
    return { value: null };
  }
  if (typeof value !== "string") {
    return { error: "empathy_prompt_override must be a string when provided" };
  }
  const prompt = value.trim();
  const missingPlaceholders = REQUIRED_EMPATHY_PROMPT_PLACEHOLDERS.filter(
    (p) => !prompt.includes(p)
  );
  if (missingPlaceholders.length > 0) {
    return { error: `empathy_prompt_override must include: ${missingPlaceholders.join(", ")}` };
  }
  return { value: prompt };
}

module.exports = {
  "GET /admin/simulation_groups": async ({ sqlConnection, response }) => {
    try {
      const simulationGroups = await sqlConnection`SELECT * FROM "simulation_groups";`;
      response.body = JSON.stringify(simulationGroups);
    } catch (err) {
      response.statusCode = 500;
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "GET /admin/groupInstructors": async ({ event, sqlConnection, response }) => {
    if (event.queryStringParameters?.simulation_group_id) {
      const { simulation_group_id } = event.queryStringParameters;
      const instructors = await sqlConnection`
        SELECT u.user_email, u.first_name, u.last_name
        FROM "enrolments" e
        JOIN "users" u ON e.user_id = u.user_id
        WHERE e.simulation_group_id = ${simulation_group_id} AND e.enrolment_type = 'instructor';
      `;
      response.body = JSON.stringify(instructors);
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "simulation_group_id is required" });
    }
  },

  "GET /admin/instructorGroups": async ({ event, sqlConnection, response }) => {
    if (event.queryStringParameters?.instructor_email) {
      const { instructor_email } = event.queryStringParameters;
      const groups = await sqlConnection`
        SELECT g.simulation_group_id, g.group_name, g.group_description
        FROM "enrolments" e
        JOIN "simulation_groups" g ON e.simulation_group_id = g.simulation_group_id
        JOIN "users" u ON e.user_id = u.user_id
        WHERE u.user_email = ${instructor_email} AND e.enrolment_type = 'instructor';
      `;
      response.body = JSON.stringify(groups);
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "instructor_email is required" });
    }
  },

  "POST /admin/enroll_instructor": async ({ event, sqlConnection, response }) => {
    const qs = event.queryStringParameters || {};
    if (!qs.simulation_group_id || !qs.instructor_email) {
      response.statusCode = 400;
      response.body = "simulation_group_id and instructor_email are required";
      return;
    }
    try {
      const { simulation_group_id, instructor_email } = qs;

      const userResult = await sqlConnection`
        SELECT user_id FROM "users" WHERE user_email = ${instructor_email};
      `;
      const user_id = userResult[0]?.user_id;
      if (!user_id) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: "Instructor email not found" });
        return;
      }

      const enrollment = await sqlConnection`
        INSERT INTO "enrolments" (enrolment_id, simulation_group_id, user_id, enrolment_type, time_enroled)
        VALUES (uuid_generate_v4(), ${simulation_group_id}, ${user_id}, 'instructor', CURRENT_TIMESTAMP)
        ON CONFLICT (simulation_group_id, user_id)
        DO UPDATE SET
            enrolment_id = EXCLUDED.enrolment_id,
            enrolment_type = EXCLUDED.enrolment_type,
            time_enroled = EXCLUDED.time_enroled
        RETURNING enrolment_id;
      `;
      const enrolment_id = enrollment[0]?.enrolment_id;

      if (enrolment_id) {
        const patientsResult = await sqlConnection`
          SELECT patient_id FROM "patients" WHERE simulation_group_id = ${simulation_group_id};
        `;
        await Promise.all(
          patientsResult.map((patient) => sqlConnection`
            INSERT INTO "student_interactions" (student_interaction_id, patient_id, enrolment_id, patient_score, last_accessed, patient_context_embedding, is_completed)
            VALUES (uuid_generate_v4(), ${patient.patient_id}, ${enrolment_id}, 0, CURRENT_TIMESTAMP, NULL, FALSE);
          `)
        );
      }

      response.body = JSON.stringify({ message: "Instructor enrolled and patients linked successfully." });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/create_simulation_group": async ({ event, sqlConnection, response }) => {
    const qs = event.queryStringParameters || {};
    if (!qs.group_name || !qs.group_access_code || !qs.group_description || !qs.group_student_access || !event.body) {
      response.statusCode = 400;
      response.body = "Missing required parameters";
      return;
    }
    try {
      console.log("simulation group creation start");
      const {
        group_name, group_access_code, group_description,
        group_student_access, empathy_enabled, admin_voice_enabled, instructor_voice_enabled,
      } = qs;

      const { system_prompt, empathy_prompt_override, empathy_tool_override, use_global_empathy_defaults } = JSON.parse(event.body);
      const useGlobalEmpathyDefaults = use_global_empathy_defaults !== false;
      const promptOverrideValidation = normalizeEmpathyPromptOverride(empathy_prompt_override, useGlobalEmpathyDefaults);
      const normalizedEmpathyToolOverride = useGlobalEmpathyDefaults
        ? null
        : (typeof empathy_tool_override === "string" && empathy_tool_override.trim())
          ? empathy_tool_override.toUpperCase()
          : null;

      if (promptOverrideValidation.error) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: promptOverrideValidation.error });
        return;
      }
      if (normalizedEmpathyToolOverride && !VALID_EMPATHY_TOOLS.includes(normalizedEmpathyToolOverride)) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: `Invalid empathy_tool_override. Allowed values: ${VALID_EMPATHY_TOOLS.join(", ")}` });
        return;
      }

      const newSimulationGroup = await sqlConnection`
        INSERT INTO "simulation_groups" (
            simulation_group_id, group_name, group_description, group_access_code,
            group_student_access, system_prompt, empathy_enabled, admin_voice_enabled,
            instructor_voice_enabled, empathy_prompt_override, empathy_tool_override
        )
        VALUES (
            uuid_generate_v4(),
            ${group_name},
            ${group_description},
            ${group_access_code},
            ${group_student_access.toLowerCase() === "true"},
            ${system_prompt},
            ${empathy_enabled ? empathy_enabled.toLowerCase() === "true" : true},
            ${admin_voice_enabled ? admin_voice_enabled.toLowerCase() === "true" : true},
            ${instructor_voice_enabled ? instructor_voice_enabled.toLowerCase() === "true" : true},
            ${promptOverrideValidation.value},
            ${normalizedEmpathyToolOverride}
        )
        RETURNING *;
      `;
      response.body = JSON.stringify(newSimulationGroup[0]);
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "POST /admin/updateGroupAccess": async ({ event, sqlConnection, response }) => {
    const qs = event.queryStringParameters || {};
    if (!qs.simulation_group_id || !qs.access) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: "simulation_group_id and access query parameters are required" });
      return;
    }

    const { simulation_group_id, group_name, access, empathy_enabled, admin_voice_enabled, instructor_voice_enabled } = qs;
    const accessBool = access.toLowerCase() === "true";
    const empathyBool = empathy_enabled ? empathy_enabled.toLowerCase() === "true" : true;
    const adminVoiceBool = admin_voice_enabled ? admin_voice_enabled.toLowerCase() === "true" : true;
    const instructorVoiceBool = instructor_voice_enabled ? instructor_voice_enabled.toLowerCase() === "true" : true;

    let hasEmpathyOverridePayload = false;
    let empathyPromptOverride = null;
    let normalizedEmpathyToolOverride = null;

    if (event.body) {
      hasEmpathyOverridePayload = true;
      const parsedBody = JSON.parse(event.body);
      const useGlobalEmpathyDefaults = parsedBody.use_global_empathy_defaults !== false;
      const promptOverrideValidation = normalizeEmpathyPromptOverride(parsedBody.empathy_prompt_override, useGlobalEmpathyDefaults);
      if (promptOverrideValidation.error) {
        response.statusCode = 400;
        response.body = JSON.stringify({ error: promptOverrideValidation.error });
        return;
      }
      empathyPromptOverride = promptOverrideValidation.value;
      normalizedEmpathyToolOverride = useGlobalEmpathyDefaults
        ? null
        : (typeof parsedBody.empathy_tool_override === "string" && parsedBody.empathy_tool_override.trim())
          ? parsedBody.empathy_tool_override.toUpperCase()
          : null;
    }

    if (normalizedEmpathyToolOverride && !VALID_EMPATHY_TOOLS.includes(normalizedEmpathyToolOverride)) {
      response.statusCode = 400;
      response.body = JSON.stringify({ error: `Invalid empathy_tool_override. Allowed values: ${VALID_EMPATHY_TOOLS.join(", ")}` });
      return;
    }

    if (group_name) {
      if (hasEmpathyOverridePayload) {
        await sqlConnection`
          UPDATE "simulation_groups"
          SET group_name = ${group_name}, group_student_access = ${accessBool},
              empathy_enabled = ${empathyBool}, admin_voice_enabled = ${adminVoiceBool},
              instructor_voice_enabled = ${instructorVoiceBool},
              empathy_prompt_override = ${empathyPromptOverride},
              empathy_tool_override = ${normalizedEmpathyToolOverride}
          WHERE simulation_group_id = ${simulation_group_id};
        `;
      } else {
        await sqlConnection`
          UPDATE "simulation_groups"
          SET group_name = ${group_name}, group_student_access = ${accessBool},
              empathy_enabled = ${empathyBool}, admin_voice_enabled = ${adminVoiceBool},
              instructor_voice_enabled = ${instructorVoiceBool}
          WHERE simulation_group_id = ${simulation_group_id};
        `;
      }
    } else {
      if (hasEmpathyOverridePayload) {
        await sqlConnection`
          UPDATE "simulation_groups"
          SET group_student_access = ${accessBool}, empathy_enabled = ${empathyBool},
              admin_voice_enabled = ${adminVoiceBool}, instructor_voice_enabled = ${instructorVoiceBool},
              empathy_prompt_override = ${empathyPromptOverride},
              empathy_tool_override = ${normalizedEmpathyToolOverride}
          WHERE simulation_group_id = ${simulation_group_id};
        `;
      } else {
        await sqlConnection`
          UPDATE "simulation_groups"
          SET group_student_access = ${accessBool}, empathy_enabled = ${empathyBool},
              admin_voice_enabled = ${adminVoiceBool}, instructor_voice_enabled = ${instructorVoiceBool}
          WHERE simulation_group_id = ${simulation_group_id};
        `;
      }
    }

    response.body = JSON.stringify({ message: "Group settings updated successfully." });
  },

  "DELETE /admin/delete_group": async ({ event, sqlConnection, response }) => {
    if (!event.queryStringParameters?.simulation_group_id) {
      response.statusCode = 400;
      response.body = "simulation_group_id query parameter is required";
      return;
    }
    try {
      const { simulation_group_id } = event.queryStringParameters;
      await sqlConnection`
        DELETE FROM "simulation_groups" WHERE simulation_group_id = ${simulation_group_id};
      `;
      response.body = JSON.stringify({ message: "Group and related records deleted successfully." });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "DELETE /admin/delete_group_instructor_enrolments": async ({ event, sqlConnection, response }) => {
    if (!event.queryStringParameters?.simulation_group_id) {
      response.statusCode = 400;
      response.body = "simulation_group_id query parameter is required";
      return;
    }
    try {
      const { simulation_group_id } = event.queryStringParameters;
      await sqlConnection`
        DELETE FROM "enrolments"
        WHERE simulation_group_id = ${simulation_group_id} AND enrolment_type = 'instructor';
      `;
      response.body = JSON.stringify({ message: "Group instructor enrolments deleted successfully." });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },

  "DELETE /admin/delete_instructor_enrolments": async ({ event, sqlConnection, response }) => {
    if (!event.queryStringParameters?.instructor_email) {
      response.statusCode = 400;
      response.body = "instructor_email query parameter is required";
      return;
    }
    try {
      const { instructor_email } = event.queryStringParameters;
      const userResult = await sqlConnection`
        SELECT user_id FROM "users" WHERE user_email = ${instructor_email};
      `;
      const userId = userResult[0]?.user_id;
      if (!userId) {
        response.statusCode = 404;
        response.body = JSON.stringify({ error: "Instructor not found" });
        return;
      }
      await sqlConnection`
        DELETE FROM "enrolments" WHERE user_id = ${userId} AND enrolment_type = 'instructor';
      `;
      response.body = JSON.stringify({ message: "Instructor enrolments deleted successfully." });
    } catch (err) {
      response.statusCode = 500;
      console.log(err);
      response.body = JSON.stringify({ error: "Internal server error" });
    }
  },
};
