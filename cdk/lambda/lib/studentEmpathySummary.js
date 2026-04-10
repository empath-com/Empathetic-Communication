/**
 * Handler for fetching empathy summary for a student
 */
const studentEmpathySummary = async (event, sqlConnection) => {
  console.log("[studentEmpathySummary] Incoming event:", JSON.stringify(event));
  
  const { session_id, email, simulation_group_id, patient_id } =
    event.queryStringParameters || {};

  console.log("[studentEmpathySummary] Parameters:", { session_id, email, simulation_group_id, patient_id });

  if (!email || !simulation_group_id) {
    console.error("[studentEmpathySummary] Missing required parameters");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters: email, simulation_group_id" }),
    };
  }

  try {
    console.log("[studentEmpathySummary] Checking if empathy_evaluation column exists");
    // First check if empathy_evaluation column exists
    const columnCheck = await sqlConnection`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'empathy_evaluation';
    `;

    console.log("[studentEmpathySummary] Column check result:", columnCheck.length);
    if (columnCheck.length === 0) {
      console.log("[studentEmpathySummary] empathy_evaluation column does not exist");
      return {
        statusCode: 200,
        body: JSON.stringify({
          overall_score: 0,
          total_interactions: 0,
          empathy_interactions: 0,
          avg_rapport: 0,
          avg_listening: 0,
          avg_whole_person: 0,
          avg_affective_empathy: 0,
          avg_communication: 0,
          avg_shared_planning: 0,
          summary: "Empathy evaluation feature not yet available.",
        }),
      };
    }

    console.log("[studentEmpathySummary] Getting user_id from email:", email);
    // Get user_id from email
    const userResult = await sqlConnection`
      SELECT user_id FROM "users" WHERE user_email = ${email} LIMIT 1;
    `;

    console.log("[studentEmpathySummary] User query result:", userResult.length, "rows");
    const userId = userResult[0]?.user_id;
    if (!userId) {
      console.error("[studentEmpathySummary] User not found for email:", email);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    console.log("[studentEmpathySummary] userId:", userId, "simulation_group_id:", simulation_group_id, "patient_id:", patient_id);

    // ── BACKFILL: evaluate messages that have no empathy score yet ──────────
    // TEXT_GEN_FUNCTION_NAME is set by CDK; fall back to naming convention
    // (e.g. "EmpathAI-studentFunction" → "EmpathAI-TextGenLambdaDockerFunction")
    const textGenFunctionName =
      process.env.TEXT_GEN_FUNCTION_NAME ||
      (process.env.AWS_LAMBDA_FUNCTION_NAME || "").replace(
        "-studentFunction",
        "-TextGenLambdaDockerFunction"
      );
    if (textGenFunctionName) {
      try {
        const unevaluatedMessages = session_id
          ? await sqlConnection`
              SELECT m.message_id, m.message_content, m.session_id, si.patient_id
              FROM "messages" m
              JOIN "sessions" s ON m.session_id = s.session_id
              JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
              JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
              WHERE e.user_id = ${userId}
                AND e.simulation_group_id = ${simulation_group_id}
                AND s.session_id = ${session_id}
                AND m.student_sent = true
                AND (m.empathy_evaluation IS NULL OR m.empathy_evaluation = '{}'::jsonb)
              ORDER BY m.time_sent ASC
              LIMIT 10`
          : patient_id
          ? await sqlConnection`
              SELECT m.message_id, m.message_content, m.session_id, si.patient_id
              FROM "messages" m
              JOIN "sessions" s ON m.session_id = s.session_id
              JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
              JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
              WHERE e.user_id = ${userId}
                AND e.simulation_group_id = ${simulation_group_id}
                AND si.patient_id = ${patient_id}
                AND m.student_sent = true
                AND (m.empathy_evaluation IS NULL OR m.empathy_evaluation = '{}'::jsonb)
              ORDER BY m.time_sent ASC
              LIMIT 10`
          : await sqlConnection`
              SELECT m.message_id, m.message_content, m.session_id, si.patient_id
              FROM "messages" m
              JOIN "sessions" s ON m.session_id = s.session_id
              JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
              JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
              WHERE e.user_id = ${userId}
                AND e.simulation_group_id = ${simulation_group_id}
                AND m.student_sent = true
                AND (m.empathy_evaluation IS NULL OR m.empathy_evaluation = '{}'::jsonb)
              ORDER BY m.time_sent ASC
              LIMIT 10`;

        if (unevaluatedMessages && unevaluatedMessages.length > 0) {
          console.log(`[studentEmpathySummary] Backfilling ${unevaluatedMessages.length} unevaluated messages`);
          const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
          const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

          await Promise.all(
            unevaluatedMessages.map(async (msg) => {
              const eventPayload = {
                path: "/student/empathy_evaluation",
                queryStringParameters: {
                  simulation_group_id,
                  session_id: msg.session_id,
                  patient_id: msg.patient_id,
                  message_id: msg.message_id,
                },
                body: JSON.stringify({ message_content: msg.message_content }),
              };
              try {
                await lambdaClient.send(
                  new InvokeCommand({
                    FunctionName: textGenFunctionName,
                    InvocationType: "RequestResponse",
                    Payload: Buffer.from(JSON.stringify(eventPayload)),
                  })
                );
                console.log(`[studentEmpathySummary] Backfilled message ${msg.message_id}`);
              } catch (invErr) {
                console.error(`[studentEmpathySummary] Failed to backfill message ${msg.message_id}: ${invErr.message}`);
              }
            })
          );
        }
      } catch (backfillErr) {
        // Non-fatal — log and continue to return whatever data we already have
        console.error(`[studentEmpathySummary] Backfill error (non-fatal): ${backfillErr.message}`);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Get ALL empathy evaluations for score calculation
    let allEmpathyData;
    try {
      if (session_id) {
        console.log("[studentEmpathySummary] Querying empathy data for session_id:", session_id);
        allEmpathyData = await sqlConnection`
          SELECT m.empathy_evaluation
          FROM "messages" m
          JOIN "sessions" s ON m.session_id = s.session_id
          JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
          JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
          WHERE e.user_id = ${userId}
            AND e.simulation_group_id = ${simulation_group_id}
            AND s.session_id = ${session_id}
            AND m.student_sent = true
            AND m.empathy_evaluation IS NOT NULL
            AND m.empathy_evaluation != '{}'::jsonb
          ORDER BY m.time_sent DESC;
        `;
      } else if (patient_id) {
        console.log("[studentEmpathySummary] Querying empathy data WITH patient_id");
        allEmpathyData = await sqlConnection`
          SELECT m.empathy_evaluation
          FROM "messages" m
          JOIN "sessions" s ON m.session_id = s.session_id
          JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
          JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
          WHERE e.user_id = ${userId}
            AND e.simulation_group_id = ${simulation_group_id}
            AND si.patient_id = ${patient_id}
            AND m.student_sent = true
            AND m.empathy_evaluation IS NOT NULL
            AND m.empathy_evaluation != '{}'::jsonb
          ORDER BY m.time_sent DESC;
        `;
      } else {
        console.log("[studentEmpathySummary] Querying empathy data WITHOUT patient_id");
        allEmpathyData = await sqlConnection`
          SELECT m.empathy_evaluation
          FROM "messages" m
          JOIN "sessions" s ON m.session_id = s.session_id
          JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
          JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
          WHERE e.user_id = ${userId}
            AND e.simulation_group_id = ${simulation_group_id}
            AND m.student_sent = true
            AND m.empathy_evaluation IS NOT NULL
            AND m.empathy_evaluation != '{}'::jsonb
          ORDER BY m.time_sent DESC;
        `;
      }
      console.log("[studentEmpathySummary] Query returned:", allEmpathyData?.length || 0, "rows");
    } catch (queryError) {
      console.error("[studentEmpathySummary] Query error:", queryError.message);
      throw queryError;
    }
    
    // Get recent evaluations for feedback text (top 3)
    const recentEmpathyData = allEmpathyData.slice(0, 3);

    if (!allEmpathyData || allEmpathyData.length === 0) {
      console.log("[studentEmpathySummary] No empathy data found, returning empty summary");
      return {
        statusCode: 200,
        body: JSON.stringify({
          overall_score: 0,
          total_interactions: 0,
          empathy_interactions: 0,
          avg_rapport: 0,
          avg_listening: 0,
          avg_whole_person: 0,
          avg_affective_empathy: 0,
          avg_communication: 0,
          avg_shared_planning: 0,
          summary: "No empathy evaluation data available yet.",
        }),
      };
    }

    // Calculate CARE Measure dimension totals
    let totalCareScore = 0,
      totalRapport = 0,
      totalListening = 0,
      totalWholePerson = 0,
      totalAffective = 0,
      totalCommunication = 0,
      totalSharedPlanning = 0;
    let validCount = 0;
    let strengths = [];
    let areasForImprovement = [];
    let recommendations = [];
    let forwardTarget = "";

    console.log(`Found ${allEmpathyData.length} empathy evaluations for scoring`);
    console.log(`Using ${recentEmpathyData.length} recent evaluations for feedback`);

    // Process ALL evaluations for score calculation
    allEmpathyData.forEach((row, index) => {
      const evaluation = row.empathy_evaluation;

      const isEmptyObject = evaluation && typeof evaluation === "object" && Object.keys(evaluation).length === 0;

      const hasValidScore = evaluation && typeof evaluation === "object" && !isEmptyObject &&
        (evaluation.rapport > 0 || evaluation.listening > 0 || evaluation['whole-person'] > 0 ||
         evaluation.affective_empathy > 0 || evaluation.communication > 0 || evaluation.shared_planning > 0);

      if (hasValidScore) {
        const dimTotal = (evaluation.feedback?.total_score) ||
          ((evaluation.rapport || 0) + (evaluation.listening || 0) + (evaluation['whole-person'] || 0) +
           (evaluation.affective_empathy || 0) + (evaluation.communication || 0) + (evaluation.shared_planning || 0));
        totalCareScore += dimTotal;
        totalRapport += evaluation.rapport || 0;
        totalListening += evaluation.listening || 0;
        totalWholePerson += evaluation['whole-person'] || 0;
        totalAffective += evaluation.affective_empathy || 0;
        totalCommunication += evaluation.communication || 0;
        totalSharedPlanning += evaluation.shared_planning || 0;
        validCount++;
      }
    });

    // Collect feedback from recent evaluations (top 3), falling back to all if needed
    const feedbackSource = recentEmpathyData.some(
      (row) => row.empathy_evaluation?.feedback && typeof row.empathy_evaluation.feedback === "object"
    ) ? recentEmpathyData : allEmpathyData;

    feedbackSource.forEach((row) => {
      const evaluation = row.empathy_evaluation;
      if (evaluation && typeof evaluation === "object" && evaluation.feedback &&
          typeof evaluation.feedback === "object") {
        if (evaluation.feedback.strengths && Array.isArray(evaluation.feedback.strengths)) {
          strengths = [...strengths, ...evaluation.feedback.strengths];
        }
        if (evaluation.feedback.areas_for_improvement && Array.isArray(evaluation.feedback.areas_for_improvement)) {
          areasForImprovement = [...areasForImprovement, ...evaluation.feedback.areas_for_improvement];
        }
        if (evaluation.feedback.improvement_suggestions && Array.isArray(evaluation.feedback.improvement_suggestions)) {
          recommendations = [...recommendations, ...evaluation.feedback.improvement_suggestions];
        }
        if (evaluation.feedback.forward_target && !forwardTarget) {
          forwardTarget = evaluation.feedback.forward_target;
        }
      }
    });

    // Calculate averages
    const avgScore = validCount > 0 ? (totalCareScore / validCount).toFixed(1) : 0;
    const avgRapport = validCount > 0 ? (totalRapport / validCount).toFixed(1) : 0;
    const avgListening = validCount > 0 ? (totalListening / validCount).toFixed(1) : 0;
    const avgWholePerson = validCount > 0 ? (totalWholePerson / validCount).toFixed(1) : 0;
    const avgAffective = validCount > 0 ? (totalAffective / validCount).toFixed(1) : 0;
    const avgCommunication = validCount > 0 ? (totalCommunication / validCount).toFixed(1) : 0;
    const avgSharedPlanning = validCount > 0 ? (totalSharedPlanning / validCount).toFixed(1) : 0;

    // Determine strongest and weakest CARE areas (using percentage of max)
    const careAreas = [
      { name: "rapport", avg: parseFloat(avgRapport), max: 10 },
      { name: "listening", avg: parseFloat(avgListening), max: 5 },
      { name: "whole-person care", avg: parseFloat(avgWholePerson), max: 10 },
      { name: "affective empathy", avg: parseFloat(avgAffective), max: 5 },
      { name: "communication", avg: parseFloat(avgCommunication), max: 10 },
      { name: "shared planning", avg: parseFloat(avgSharedPlanning), max: 10 },
    ];

    const strengthAreas = careAreas
      .filter((d) => d.avg / d.max >= 0.7)
      .map((d) => d.name)
      .join(", ");

    const weaknessAreas = careAreas
      .filter((d) => d.avg / d.max < 0.5)
      .map((d) => d.name)
      .join(", ");

    // Final summary string
    const scoreLabel = parseFloat(avgScore) >= 40 ? "strong" :
      parseFloat(avgScore) >= 30 ? "developing" :
      parseFloat(avgScore) >= 20 ? "emerging" : "foundational";

    const summary =
      `Your average CARE Measure score is ${avgScore}/50, reflecting ${scoreLabel} empathetic communication skills. ` +
      (strengthAreas ? `Your strongest areas include ${strengthAreas}. ` : "") +
      (weaknessAreas ? `Areas for development: ${weaknessAreas}. ` : "") +
      (forwardTarget ? `Focus for your next session: ${forwardTarget}.` : "");

    // Get total interactions count (only messages with empathy evaluations)
    let totalInteractions;
    if (patient_id) {
      totalInteractions = await sqlConnection`
        SELECT COUNT(*) as count
        FROM "messages" m
        JOIN "sessions" s ON m.session_id = s.session_id
        JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
        JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
        WHERE e.user_id = ${userId}
        AND e.simulation_group_id = ${simulation_group_id}
        AND si.patient_id = ${patient_id}
        AND m.student_sent = true
        AND m.empathy_evaluation IS NOT NULL
        AND m.empathy_evaluation != '{}'::jsonb;
      `;
    } else {
      totalInteractions = await sqlConnection`
        SELECT COUNT(*) as count
        FROM "messages" m
        JOIN "sessions" s ON m.session_id = s.session_id
        JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
        JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
        WHERE e.user_id = ${userId}
        AND e.simulation_group_id = ${simulation_group_id}
        AND m.student_sent = true
        AND m.empathy_evaluation IS NOT NULL
        AND m.empathy_evaluation != '{}'::jsonb;
      `;
    }

    // Remove duplicates from arrays
    const uniqueStrengths = [...new Set(strengths)];
    const uniqueAreasForImprovement = [...new Set(areasForImprovement)];
    const uniqueRecommendations = [...new Set(recommendations)];

    return {
      statusCode: 200,
      body: JSON.stringify({
        overall_score: avgScore,
        total_interactions: totalInteractions[0]?.count || 0,
        empathy_interactions: validCount,
        avg_rapport: parseFloat(avgRapport),
        avg_listening: parseFloat(avgListening),
        avg_whole_person: parseFloat(avgWholePerson),
        avg_affective_empathy: parseFloat(avgAffective),
        avg_communication: parseFloat(avgCommunication),
        avg_shared_planning: parseFloat(avgSharedPlanning),
        summary: summary,
        strengths: uniqueStrengths.length > 0 ? uniqueStrengths : null,
        areas_for_improvement: uniqueAreasForImprovement.length > 0 ? uniqueAreasForImprovement : null,
        recommendations: uniqueRecommendations.length > 0 ? uniqueRecommendations : null,
        forward_target: forwardTarget || null,
      }),
    };
  } catch (error) {
    console.error("[studentEmpathySummary] Error fetching empathy summary:", error);
    console.error("[studentEmpathySummary] Stack trace:", error.stack);
    console.error("[studentEmpathySummary] Error message:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch empathy summary", details: error.message }),
    };
  }
};

module.exports = studentEmpathySummary;


