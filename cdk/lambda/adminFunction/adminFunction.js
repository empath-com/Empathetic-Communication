const { initializeConnection } = require("./libadmin.js");
const { handleAiAnalyticsQuery } = require("./analytics/aiAnalyticsHandler");

let { SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT, CORS_ALLOWED_ORIGIN = "*" } = process.env;

// SQL conneciton from global variable at libadmin.js
let sqlConnectionTableCreator = global.sqlConnectionTableCreator;
const VALID_EMPATHY_TOOLS = ["CARE", "PRISM"];

exports.handler = async (event) => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": CORS_ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "*",
    },
    body: "",
  };

  // Initialize the database connection if not already initialized
  if (!sqlConnectionTableCreator) {
    await initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT);
    sqlConnectionTableCreator = global.sqlConnectionTableCreator;
  }

  // Function to format student full names (lowercase and spaces replaced with "_")
  const formatNames = (name) => {
    return name.toLowerCase().replace(/\s+/g, "_");
  };

  let data;
  try {
    const pathData = event.httpMethod + " " + event.resource;
    switch (pathData) {
      case "GET /admin/active_students_count":
        try {
          console.log('[active_students_count] Request received');
          const qs = event.queryStringParameters || {};
          const days = qs.days ? parseInt(qs.days, 10) : null; // optional days filter
          const groupId = qs.simulation_group_id || null; // optional group filter
          console.log(`[active_students_count] Params - days: ${days}, groupId: ${groupId}`);

          // Build base query with optional JOIN when scoping to a group
          if (groupId) {
            const result = await sqlConnectionTableCreator`
              SELECT COUNT(DISTINCT u.user_id)::int AS active_students
              FROM "users" u
              JOIN "enrolments" e ON e.user_id = u.user_id
              WHERE u.roles @> ARRAY['student']::varchar[]
                AND u.last_sign_in IS NOT NULL
                ${days ? sqlConnectionTableCreator`AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnectionTableCreator``}
                AND e.simulation_group_id = ${groupId};
            `;
            response.body = JSON.stringify({ active_students: result[0].active_students });
          } else {
            const result = await sqlConnectionTableCreator`
              SELECT COUNT(*)::int AS active_students
              FROM "users" u
              WHERE u.roles @> ARRAY['student']::varchar[]
                AND u.last_sign_in IS NOT NULL
                ${days ? sqlConnectionTableCreator`AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnectionTableCreator``};
            `;
            response.body = JSON.stringify({ active_students: result[0].active_students });
          }
          console.log('[active_students_count] Success');
        } catch (err) {
          response.statusCode = 500;
          console.error('[active_students_count] Error:', err);
          response.body = JSON.stringify({ error: "Internal server error", details: err.message });
        }
        break;
      case "GET /admin/completed_exercises_count":
        try {
          console.log('[completed_exercises_count] Request received');
          const qs = event.queryStringParameters || {};
          const days = qs.days ? parseInt(qs.days, 10) : null;
          const groupId = qs.simulation_group_id || null;
          console.log(`[completed_exercises_count] Params - days: ${days}, groupId: ${groupId}`);

          const result = await sqlConnectionTableCreator`
            SELECT COUNT(DISTINCT e.user_id)::int AS completed_students
            FROM "student_interactions" si
            JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
            WHERE si.is_completed = TRUE
              ${days ? sqlConnectionTableCreator`AND si.last_accessed IS NOT NULL AND si.last_accessed >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})` : sqlConnectionTableCreator``}
              ${groupId ? sqlConnectionTableCreator`AND e.simulation_group_id = ${groupId}` : sqlConnectionTableCreator``};
          `;

          response.body = JSON.stringify({ completed_students: result[0].completed_students });
          console.log('[completed_exercises_count] Success');
        } catch (err) {
          response.statusCode = 500;
          console.error('[completed_exercises_count] Error:', err);
          response.body = JSON.stringify({ error: "Internal server error", details: err.message });
        }
        break;
      case "GET /admin/active_students_trend":
        try {
          console.log('[active_students_trend] Request received');
          const qs = event.queryStringParameters || {};
          const days = parseInt(qs.days || "30", 10);
          const groupId = qs.simulation_group_id || null;
          console.log(`[active_students_trend] Params - days: ${days}, groupId: ${groupId}`);

          if (groupId) {
            const trend = await sqlConnectionTableCreator`
              SELECT u.last_sign_in::date AS day, COUNT(DISTINCT u.user_id)::int AS count
              FROM "users" u
              JOIN "enrolments" e ON e.user_id = u.user_id
              WHERE u.roles @> ARRAY['student']::varchar[]
                AND u.last_sign_in IS NOT NULL
                AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
                AND e.simulation_group_id = ${groupId}
              GROUP BY day
              ORDER BY day;
            `;
            response.body = JSON.stringify(trend);
          } else {
            const trend = await sqlConnectionTableCreator`
              SELECT u.last_sign_in::date AS day, COUNT(*)::int AS count
              FROM "users" u
              WHERE u.roles @> ARRAY['student']::varchar[]
                AND u.last_sign_in IS NOT NULL
                AND u.last_sign_in >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
              GROUP BY day
              ORDER BY day;
            `;
            response.body = JSON.stringify(trend);
          }

          response.body = JSON.stringify(trend);
          console.log('[active_students_trend] Success');
        } catch (err) {
          response.statusCode = 500;
          console.error('[active_students_trend] Error:', err);
          response.body = JSON.stringify({ error: "Internal server error", details: err.message });
        }
        break;
      case "GET /admin/completed_exercises_trend":
        try {
          console.log('[completed_exercises_trend] Request received');
          const qs = event.queryStringParameters || {};
          const days = parseInt(qs.days || "30", 10);
          const groupId = qs.simulation_group_id || null;
          console.log(`[completed_exercises_trend] Params - days: ${days}, groupId: ${groupId}`);

          const trend = await sqlConnectionTableCreator`
            SELECT si.last_accessed::date AS day, COUNT(DISTINCT e.user_id)::int AS count
            FROM "student_interactions" si
            JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
            WHERE si.is_completed = TRUE
              AND si.last_accessed IS NOT NULL
              AND si.last_accessed >= CURRENT_DATE - (INTERVAL '1 day' * ${days - 1})
              ${groupId ? sqlConnectionTableCreator`AND e.simulation_group_id = ${groupId}` : sqlConnectionTableCreator``}
            GROUP BY day
            ORDER BY day;
          `;
          response.body = JSON.stringify(trend);
          console.log('[completed_exercises_trend] Success');
        } catch (err) {
          response.statusCode = 500;
          console.error('[completed_exercises_trend] Error:', err);
          response.body = JSON.stringify({ error: "Internal server error", details: err.message });
        }
        break;
      case "GET /admin/instructors":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.instructor_email
        ) {
          const { instructor_email } = event.queryStringParameters;

          // SQL query to fetch all users who are instructors
          const instructors = await sqlConnectionTableCreator`
                SELECT user_email, first_name, last_name
                FROM "users"
                WHERE roles @> ARRAY['instructor']::varchar[]
                ORDER BY last_name ASC;
              `;

          response.body = JSON.stringify(instructors);
        } else {
          response.statusCode = 400;
          response.body = "instructor_email is required";
        }
        break;
      case "GET /admin/simulation_groups":
        try {
          // Query all simulation groups from simulation_groups table
          const simulationGroups = await sqlConnectionTableCreator`
                    SELECT *
                    FROM "simulation_groups";
                `;

          response.body = JSON.stringify(simulationGroups);
        } catch (err) {
          response.statusCode = 500;
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/enroll_instructor":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.simulation_group_id &&
          event.queryStringParameters.instructor_email
        ) {
          try {
            const { simulation_group_id, instructor_email } =
              event.queryStringParameters;

            // Retrieve user_id from users table based on the instructor email
            const userResult = await sqlConnectionTableCreator`
                  SELECT user_id
                  FROM "users"
                  WHERE user_email = ${instructor_email};
                `;

            const user_id = userResult[0]?.user_id;

            if (!user_id) {
              response.statusCode = 400;
              response.body = JSON.stringify({
                error: "Instructor email not found",
              });
              break;
            }

            // Insert enrollment into enrolments table with current timestamp for the 'instructor' role
            const enrollment = await sqlConnectionTableCreator`
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
              // Retrieve all patient IDs associated with the simulation group
              const patientsResult = await sqlConnectionTableCreator`
                    SELECT patient_id
                    FROM "patients"
                    WHERE simulation_group_id = ${simulation_group_id};
                  `;

              // Insert a record into student_interactions for each patient in the simulation group
              const studentInteractionInsertions = patientsResult.map(
                (patient) => {
                  return sqlConnectionTableCreator`
                      INSERT INTO "student_interactions" (student_interaction_id, patient_id, enrolment_id, patient_score, last_accessed, patient_context_embedding, is_completed)
                      VALUES (uuid_generate_v4(), ${patient.patient_id}, ${enrolment_id}, 0, CURRENT_TIMESTAMP, NULL, FALSE);
                    `;
                }
              );

              // Execute all insertions
              await Promise.all(studentInteractionInsertions);
            }

            response.body = JSON.stringify({
              message: "Instructor enrolled and patients linked successfully.",
            });

            // Optionally insert into User Engagement Log (uncomment if needed)
            // await sqlConnectionTableCreator`
            //   INSERT INTO "user_engagement_log" (log_id, user_id, simulation_group_id, patient_id, enrolment_id, timestamp, engagement_type)
            //   VALUES (uuid_generate_v4(), ${user_id}, ${simulation_group_id}, null, ${enrolment_id}, CURRENT_TIMESTAMP, 'enrollment_created');
            // `;
          } catch (err) {
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body =
            "simulation_group_id and instructor_email are required";
        }
        break;
      case "POST /admin/create_simulation_group":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.group_name &&
          event.queryStringParameters.group_access_code &&
          event.queryStringParameters.group_description &&
          event.queryStringParameters.group_student_access &&
          event.body
        ) {
          try {
            console.log("simulation group creation start");
            const {
              group_name,
              group_access_code,
              group_description,
              group_student_access,
              empathy_enabled,
              admin_voice_enabled,
              instructor_voice_enabled,
            } = event.queryStringParameters;

            const {
              system_prompt,
              empathy_prompt_override,
              empathy_tool_override,
              use_global_empathy_defaults,
            } = JSON.parse(event.body);

            const useGlobalEmpathyDefaults = use_global_empathy_defaults !== false;
            const normalizedEmpathyPromptOverride = useGlobalEmpathyDefaults
              ? null
              : (typeof empathy_prompt_override === "string" && empathy_prompt_override.trim())
                ? empathy_prompt_override
                : null;
            const normalizedEmpathyToolOverride = useGlobalEmpathyDefaults
              ? null
              : (typeof empathy_tool_override === "string" && empathy_tool_override.trim())
                ? empathy_tool_override.toUpperCase()
                : null;

            if (
              normalizedEmpathyToolOverride &&
              !VALID_EMPATHY_TOOLS.includes(normalizedEmpathyToolOverride)
            ) {
              response.statusCode = 400;
              response.body = JSON.stringify({
                error: `Invalid empathy_tool_override. Allowed values: ${VALID_EMPATHY_TOOLS.join(", ")}`,
              });
              break;
            }

            // Insert new simulation group into simulation_groups table
            const newSimulationGroup = await sqlConnectionTableCreator`
                  INSERT INTO "simulation_groups" (
                      simulation_group_id,
                      group_name,
                      group_description,
                      group_access_code,
                      group_student_access,
                      system_prompt,
                      empathy_enabled,
                      admin_voice_enabled,
                      instructor_voice_enabled,
                      empathy_prompt_override,
                      empathy_tool_override
                  )
                  VALUES (
                      uuid_generate_v4(),
                      ${group_name},
                      ${group_description}, -- optional, can be null if not provided
                      ${group_access_code},
                      ${group_student_access.toLowerCase() === "true"},
                      ${system_prompt},
                      ${empathy_enabled ? empathy_enabled.toLowerCase() === "true" : true},
                      ${admin_voice_enabled ? admin_voice_enabled.toLowerCase() === "true" : true},
                      ${instructor_voice_enabled ? instructor_voice_enabled.toLowerCase() === "true" : true},
                      ${normalizedEmpathyPromptOverride},
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
        } else {
          response.statusCode = 400;
          response.body = "Missing required parameters";
        }
        break;
      case "GET /admin/groupInstructors":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.simulation_group_id
        ) {
          const { simulation_group_id } = event.queryStringParameters;

          // SQL query to fetch all instructors for a given group
          const instructors = await sqlConnectionTableCreator`
              SELECT u.user_email, u.first_name, u.last_name
              FROM "enrolments" e
              JOIN "users" u ON e.user_id = u.user_id
              WHERE e.simulation_group_id = ${simulation_group_id} AND e.enrolment_type = 'instructor';
            `;

          response.body = JSON.stringify(instructors);
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "simulation_group_id is required",
          });
        }
        break;
      case "GET /admin/instructorGroups":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.instructor_email
        ) {
          const { instructor_email } = event.queryStringParameters;

          // SQL query to fetch all groups for a given instructor
          const groups = await sqlConnectionTableCreator`
              SELECT g.simulation_group_id, g.group_name, g.group_description
              FROM "enrolments" e
              JOIN "simulation_groups" g ON e.simulation_group_id = g.simulation_group_id
              JOIN "users" u ON e.user_id = u.user_id
              WHERE u.user_email = ${instructor_email} AND e.enrolment_type = 'instructor';
            `;

          response.body = JSON.stringify(groups);
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "instructor_email is required",
          });
        }
        break;
      case "POST /admin/updateGroupAccess":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.simulation_group_id &&
          event.queryStringParameters.access
        ) {
          const {
            simulation_group_id,
            group_name,
            access,
            empathy_enabled,
            admin_voice_enabled,
            instructor_voice_enabled,
          } = event.queryStringParameters;
          const accessBool = access.toLowerCase() === "true";
          const empathyBool = empathy_enabled ? empathy_enabled.toLowerCase() === "true" : true;
          const adminVoiceBool = admin_voice_enabled ? admin_voice_enabled.toLowerCase() === "true" : true;
          const instructorVoiceBool = instructor_voice_enabled ? instructor_voice_enabled.toLowerCase() === "true" : true;

          let hasEmpathyOverridePayload = false;
          let useGlobalEmpathyDefaults = true;
          let normalizedEmpathyPromptOverride = null;
          let normalizedEmpathyToolOverride = null;

          if (event.body) {
            hasEmpathyOverridePayload = true;
            const parsedBody = JSON.parse(event.body);
            useGlobalEmpathyDefaults = parsedBody.use_global_empathy_defaults !== false;
            normalizedEmpathyPromptOverride = useGlobalEmpathyDefaults
              ? null
              : (typeof parsedBody.empathy_prompt_override === "string" && parsedBody.empathy_prompt_override.trim())
                ? parsedBody.empathy_prompt_override
                : null;
            normalizedEmpathyToolOverride = useGlobalEmpathyDefaults
              ? null
              : (typeof parsedBody.empathy_tool_override === "string" && parsedBody.empathy_tool_override.trim())
                ? parsedBody.empathy_tool_override.toUpperCase()
                : null;
          }

          if (
            normalizedEmpathyToolOverride &&
            !VALID_EMPATHY_TOOLS.includes(normalizedEmpathyToolOverride)
          ) {
            response.statusCode = 400;
            response.body = JSON.stringify({
              error: `Invalid empathy_tool_override. Allowed values: ${VALID_EMPATHY_TOOLS.join(", ")}`,
            });
            break;
          }

          if (group_name) { // update WITH group name
            if (hasEmpathyOverridePayload) {
              await sqlConnectionTableCreator`
                UPDATE "simulation_groups"
                SET group_name = ${group_name},
                    group_student_access = ${accessBool},
                    empathy_enabled = ${empathyBool},
                    admin_voice_enabled = ${adminVoiceBool},
                    instructor_voice_enabled = ${instructorVoiceBool},
                    empathy_prompt_override = ${normalizedEmpathyPromptOverride},
                    empathy_tool_override = ${normalizedEmpathyToolOverride}
                WHERE simulation_group_id = ${simulation_group_id};
              `;
            } else {
              await sqlConnectionTableCreator`
                UPDATE "simulation_groups"
                SET group_name = ${group_name},
                    group_student_access = ${accessBool},
                    empathy_enabled = ${empathyBool},
                    admin_voice_enabled = ${adminVoiceBool},
                    instructor_voice_enabled = ${instructorVoiceBool}
                WHERE simulation_group_id = ${simulation_group_id};
              `;
            }
          } else { // SQL query to update group access, empathy_enabled, and voice settings
            if (hasEmpathyOverridePayload) {
              await sqlConnectionTableCreator`
                UPDATE "simulation_groups"
                SET group_student_access = ${accessBool},
                    empathy_enabled = ${empathyBool},
                    admin_voice_enabled = ${adminVoiceBool},
                    instructor_voice_enabled = ${instructorVoiceBool},
                    empathy_prompt_override = ${normalizedEmpathyPromptOverride},
                    empathy_tool_override = ${normalizedEmpathyToolOverride}
                WHERE simulation_group_id = ${simulation_group_id};
              `;
            } else {
              await sqlConnectionTableCreator`
                UPDATE "simulation_groups"
                SET group_student_access = ${accessBool},
                    empathy_enabled = ${empathyBool},
                    admin_voice_enabled = ${adminVoiceBool},
                    instructor_voice_enabled = ${instructorVoiceBool}
                WHERE simulation_group_id = ${simulation_group_id};
              `;
            }
          }


          response.body = JSON.stringify({
            message: "Group settings updated successfully.",
          });
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error:
              "simulation_group_id and access query parameters are required",
          });
        }
        break;
      case "DELETE /admin/delete_instructor_enrolments":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.instructor_email
        ) {
          try {
            const { instructor_email } = event.queryStringParameters;

            // Retrieve the user's ID
            const userResult = await sqlConnectionTableCreator`
                        SELECT user_id 
                        FROM "users"
                        WHERE user_email = ${instructor_email};
                    `;

            const userId = userResult[0]?.user_id;

            if (!userId) {
              response.statusCode = 404;
              response.body = JSON.stringify({ error: "Instructor not found" });
              return;
            }

            // Delete all enrolments for the instructor
            await sqlConnectionTableCreator`
                        DELETE FROM "enrolments"
                        WHERE user_id = ${userId} AND enrolment_type = 'instructor';
                    `;

            response.body = JSON.stringify({
              message: "Instructor enrolments deleted successfully.",
            });
          } catch (err) {
            await sqlConnectionTableCreator.rollback();
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = "instructor_email query parameter is required";
        }
        break;
      case "DELETE /admin/delete_group_instructor_enrolments":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.simulation_group_id
        ) {
          try {
            const { simulation_group_id } = event.queryStringParameters;

            // Delete all enrolments for the group where enrolment_type is 'instructor'
            await sqlConnectionTableCreator`
                      DELETE FROM "enrolments"
                      WHERE simulation_group_id = ${simulation_group_id} AND enrolment_type = 'instructor';
                  `;

            response.body = JSON.stringify({
              message: "Group instructor enrolments deleted successfully.",
            });
          } catch (err) {
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = "simulation_group_id query parameter is required";
        }
        break;
      case "DELETE /admin/delete_group":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.simulation_group_id
        ) {
          try {
            const { simulation_group_id } = event.queryStringParameters;

            // // Drop the table whose name is the simulation_group_id
            // await sqlConnectionTableCreator`
            //   DROP TABLE IF EXISTS ${sqlConnectionTableCreator(simulation_group_id)};
            // `;

            // Delete the group, related records will be automatically deleted due to cascading
            await sqlConnectionTableCreator`
                      DELETE FROM "simulation_groups"
                      WHERE simulation_group_id = ${simulation_group_id};
                  `;

            response.body = JSON.stringify({
              message: "Group and related records deleted successfully.",
            });
          } catch (err) {
            await sqlConnection.rollback();
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = "simulation_group_id query parameter is required";
        }
        break;
      case "POST /admin/elevate_instructor":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.email
        ) {
          const instructorEmail = event.queryStringParameters.email;

          try {
            // Check if the user exists
            const existingUser = await sqlConnectionTableCreator`
                          SELECT * FROM "users"
                          WHERE user_email = ${instructorEmail};
                      `;

            if (existingUser.length > 0) {
              const userRoles = existingUser[0].roles;

              // Check if the role is already 'instructor' or 'admin'
              if (
                userRoles.includes("instructor") ||
                userRoles.includes("admin")
              ) {
                response.statusCode = 200;
                response.body = JSON.stringify({
                  message:
                    "No changes made. User is already an instructor or admin.",
                });
                break;
              }

              // If the role is 'student', elevate to 'instructor'
              if (userRoles.includes("student")) {
                const newRoles = userRoles.map((role) =>
                  role === "student" ? "instructor" : role
                );

                await sqlConnectionTableCreator`
                                UPDATE "users"
                                SET roles = ${newRoles}
                                WHERE user_email = ${instructorEmail};
                            `;

                response.statusCode = 200;
                response.body = JSON.stringify({
                  message: "User role updated to instructor.",
                });
                break;
              }
            } else {
              // Create a new user with the role 'instructor'
              await sqlConnectionTableCreator`
                              INSERT INTO "users" (user_email, roles)
                              VALUES (${instructorEmail}, ARRAY['instructor']);
                          `;

              response.statusCode = 201;
              response.body = JSON.stringify({
                message: "New user created and elevated to instructor.",
              });
            }
          } catch (err) {
            response.statusCode = 500;
            console.error(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({ error: "Email is required" });
        }
        break;
      case "POST /admin/lower_instructor":
        if (
          event.queryStringParameters != null &&
          event.queryStringParameters.email
        ) {
          try {
            const userEmail = event.queryStringParameters.email;

            // Fetch the roles for the user
            const userRoleData = await sqlConnectionTableCreator`
                    SELECT roles, user_id
                    FROM "users"
                    WHERE user_email = ${userEmail};
                  `;

            const userRoles = userRoleData[0]?.roles;
            const userId = userRoleData[0]?.user_id;

            if (!userRoles || !userRoles.includes("instructor")) {
              response.statusCode = 400;
              response.body = JSON.stringify({
                error: "User is not an instructor or doesn't exist",
              });
              break;
            }

            // Replace 'instructor' with 'student'
            const updatedRoles = userRoles
              .filter((role) => role !== "instructor")
              .concat("student");

            // Update the roles in the database
            await sqlConnectionTableCreator`
                    UPDATE "users"
                    SET roles = ${updatedRoles}
                    WHERE user_email = ${userEmail};
                  `;

            // Delete all enrolments where the enrolment type is instructor
            await sqlConnectionTableCreator`
                    DELETE FROM "enrolments"
                    WHERE user_id = ${userId} AND enrolment_type = 'instructor';
                  `;

            response.statusCode = 200;
            response.body = JSON.stringify({
              message: `User role updated to student for ${userEmail} and all instructor enrolments deleted.`,
            });
          } catch (err) {
            console.log(err);
            response.statusCode = 500;
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = JSON.stringify({
            error: "email query parameter is missing",
          });
        }
        break;
      case "GET /admin/system_prompts":
        try {
          // Get the latest system prompt from history table
          const latestPrompt = await sqlConnectionTableCreator`
            SELECT prompt_content, created_at
            FROM "system_prompt_history"
            ORDER BY created_at DESC
            LIMIT 1;
          `;

          // Get prompt history excluding the latest one
          const promptHistory = await sqlConnectionTableCreator`
            SELECT history_id, prompt_content, created_at
            FROM "system_prompt_history"
            ORDER BY created_at DESC
            OFFSET 1;
          `;

          response.body = JSON.stringify({
            current_prompt: latestPrompt[0]?.prompt_content || "",
            history: promptHistory,
          });
        } catch (err) {
          response.statusCode = 500;
          console.log(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/update_system_prompt":
        if (event.body) {
          try {
            const { prompt_content } = JSON.parse(event.body);
            if (!prompt_content || !prompt_content.trim()) {
              response.statusCode = 400;
              response.body = "prompt_content is required";
              break;
            }

            // Insert new prompt into history (created_by removed)
            await sqlConnectionTableCreator`
              INSERT INTO "system_prompt_history" (prompt_content)
              VALUES (${prompt_content});
            `;

            response.body = JSON.stringify({
              message: "System prompt updated successfully",
            });
          } catch (err) {
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = "prompt_content is required";
        }
        break;
      case "POST /admin/restore_system_prompt":
        try {
          // Prefer query param history_id; fallback to body with prompt_content for backward compatibility
          const historyId =
            event.queryStringParameters &&
              event.queryStringParameters.history_id
              ? event.queryStringParameters.history_id
              : null;

          if (historyId) {
            // Fetch the prompt_content for the given history_id and insert as new active prompt
            const rows = await sqlConnectionTableCreator`
              SELECT prompt_content
              FROM "system_prompt_history"
              WHERE history_id = ${historyId}
              LIMIT 1;
            `;

            const fromHistory = rows[0]?.prompt_content;
            if (!fromHistory) {
              response.statusCode = 404;
              response.body = JSON.stringify({
                error: "History entry not found",
              });
              break;
            }

            await sqlConnectionTableCreator`
              INSERT INTO "system_prompt_history" (prompt_content)
              VALUES (${fromHistory});
            `;

            response.body = JSON.stringify({
              message: "System prompt restored successfully",
            });
            break;
          }

          // Fallback: body-based restore (no created_by)
          if (event.body) {
            const { prompt_content } = JSON.parse(event.body);
            if (!prompt_content || !prompt_content.trim()) {
              response.statusCode = 400;
              response.body = "prompt_content is required";
              break;
            }

            await sqlConnectionTableCreator`
              INSERT INTO "system_prompt_history" (prompt_content)
              VALUES (${prompt_content});
            `;

            response.body = JSON.stringify({
              message: "System prompt restored successfully",
            });
          } else {
            response.statusCode = 400;
            response.body = "history_id or prompt_content is required";
          }
        } catch (err) {
          response.statusCode = 500;
          console.log(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "GET /admin/empathy_prompts":
        try {
          // Get the latest empathy prompt from history table
          const latestPrompt = await sqlConnectionTableCreator`
            SELECT prompt_content, empathy_tool, created_at
            FROM "empathy_prompt_history"
            ORDER BY created_at DESC
            LIMIT 1;
          `;

          // Get prompt history excluding the latest one
          const promptHistory = await sqlConnectionTableCreator`
            SELECT history_id, prompt_content, empathy_tool, created_at
            FROM "empathy_prompt_history"
            ORDER BY created_at DESC
            OFFSET 1;
          `;

          response.body = JSON.stringify({
            current_prompt: latestPrompt[0]?.prompt_content || "",
            current_empathy_tool: latestPrompt[0]?.empathy_tool || "CARE",
            history: promptHistory,
          });
        } catch (err) {
          response.statusCode = 500;
          console.log(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/update_empathy_prompt":
        if (event.body) {
          try {
            const { prompt_content, empathy_tool: bodyTool } = JSON.parse(event.body);
            if (!prompt_content || !prompt_content.trim()) {
              response.statusCode = 400;
              response.body = "prompt_content is required";
              break;
            }
            const validTools = ['CARE', 'PRISM'];
            const resolvedTool = validTools.includes(bodyTool) ? bodyTool : 'CARE';

            // Insert new prompt into history
            await sqlConnectionTableCreator`
              INSERT INTO "empathy_prompt_history" (prompt_content, empathy_tool)
              VALUES (${prompt_content}, ${resolvedTool});
            `;

            response.body = JSON.stringify({
              message: "Empathy prompt updated successfully",
            });
          } catch (err) {
            response.statusCode = 500;
            console.log(err);
            response.body = JSON.stringify({ error: "Internal server error" });
          }
        } else {
          response.statusCode = 400;
          response.body = "prompt_content is required";
        }
        break;
      case "POST /admin/restore_empathy_prompt":
        try {
          const historyId =
            event.queryStringParameters &&
              event.queryStringParameters.history_id
              ? event.queryStringParameters.history_id
              : null;

          if (historyId) {
            // Fetch the prompt_content and empathy_tool for the given history_id
            const rows = await sqlConnectionTableCreator`
              SELECT prompt_content, empathy_tool
              FROM "empathy_prompt_history"
              WHERE history_id = ${historyId}
              LIMIT 1;
            `;

            const fromHistory = rows[0]?.prompt_content;
            if (!fromHistory) {
              response.statusCode = 404;
              response.body = JSON.stringify({
                error: "History entry not found",
              });
              break;
            }
            const validTools = ['CARE', 'PRISM'];
            const restoredTool = validTools.includes(rows[0]?.empathy_tool) ? rows[0].empathy_tool : 'CARE';

            await sqlConnectionTableCreator`
              INSERT INTO "empathy_prompt_history" (prompt_content, empathy_tool)
              VALUES (${fromHistory}, ${restoredTool});
            `;

            response.body = JSON.stringify({
              message: "Empathy prompt restored successfully",
            });
            break;
          }

          // Fallback: body-based restore
          if (event.body) {
            const { prompt_content } = JSON.parse(event.body);
            if (!prompt_content || !prompt_content.trim()) {
              response.statusCode = 400;
              response.body = "prompt_content is required";
              break;
            }

            await sqlConnectionTableCreator`
              INSERT INTO "empathy_prompt_history" (prompt_content)
              VALUES (${prompt_content});
            `;

            response.body = JSON.stringify({
              message: "Empathy prompt restored successfully",
            });
          } else {
            response.statusCode = 400;
            response.body = "history_id or prompt_content is required";
          }
        } catch (err) {
          response.statusCode = 500;
          console.log(err);
          response.body = JSON.stringify({ error: "Internal server error" });
        }
        break;
      case "POST /admin/ai_analytics_query":
        try {
          if (!event.body) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: "Request body is required" });
            break;
          }

          const requestBody = JSON.parse(event.body);
          const question = (requestBody.question || "").trim();
          if (!question) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: "question is required" });
            break;
          }

          const analyticsResult = await handleAiAnalyticsQuery(
            sqlConnectionTableCreator,
            question
          );
          response.body = JSON.stringify({
            question,
            ...analyticsResult,
          });
        } catch (err) {
          response.statusCode = 500;
          console.error("[ai_analytics_query] Error:", err);
          response.body = JSON.stringify({ error: "Failed to process analytics question", details: err.message });
        }
        break;
      default:
        console.error(`Unsupported route: "${pathData}"`);
        response.statusCode = 404;
        response.body = JSON.stringify({ error: `Unsupported route: "${pathData}"` });
    }
  } catch (error) {
    console.error('[Main catch block] Error:', error);
    response.statusCode = 400;
    response.body = JSON.stringify({ error: error.message });
  }
  console.log('[Response]', response);
  return response;
};
