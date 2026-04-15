/**
 * Handler for fetching empathy summary for a student
 */
const BINARY_CRITERIA = [
  'making_feel_at_ease', 'letting_tell_story', 'really_listening',
  'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
  'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
];

const CRITERIA_LABELS = {
  making_feel_at_ease:        'Making you feel at ease',
  letting_tell_story:         'Letting you tell your story',
  really_listening:           'Really listening',
  interested_in_whole_person: 'Being interested in you as a whole person',
  understanding_concerns:     'Fully understanding your concerns',
  showing_care_compassion:    'Showing care and compassion',
  being_positive:             'Being positive',
  explaining_clearly:         'Explaining things clearly',
  helping_take_control:       'Helping you take control',
  making_plan_of_action:      'Making a plan of action with you',
};

const EMPTY_SUMMARY = {
  overall_score: 0,
  total_messages_evaluated: 0,
  total_criteria_hits: 0,
  total_interactions: 0,
  empathy_interactions: 0,
  making_feel_at_ease: 0,
  letting_tell_story: 0,
  really_listening: 0,
  interested_in_whole_person: 0,
  understanding_concerns: 0,
  showing_care_compassion: 0,
  being_positive: 0,
  explaining_clearly: 0,
  helping_take_control: 0,
  making_plan_of_action: 0,
};

// When true, summary is derived from the latest evaluated student message only.
// This matches thread-level empathy evaluation where the latest row represents the full thread state.
const USE_LATEST_THREAD_EVALUATION_SUMMARY = true;

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
        body: JSON.stringify({ ...EMPTY_SUMMARY, summary: "Empathy evaluation feature not yet available." }),
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

    // Get ALL empathy evaluations for score calculation
    // Evaluations are now saved inline during streaming (streaming.py) so no backfill needed.
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
    
    if (!allEmpathyData || allEmpathyData.length === 0) {
      console.log("[studentEmpathySummary] No empathy data found, returning empty summary");
      return {
        statusCode: 200,
        body: JSON.stringify({ ...EMPTY_SUMMARY, summary: "No empathy evaluation data available yet." }),
      };
    }

    if (USE_LATEST_THREAD_EVALUATION_SUMMARY) {
      console.log("[studentEmpathySummary] Using latest-thread empathy summary mode");
      const latestEvaluation = allEmpathyData[0]?.empathy_evaluation;

      if (!latestEvaluation || typeof latestEvaluation !== "object") {
        return {
          statusCode: 200,
          body: JSON.stringify({ ...EMPTY_SUMMARY, summary: "No valid empathy evaluation data available yet." }),
        };
      }

      // For 1-5 scale: extract criterion scores
      const latestCriteria = Object.fromEntries(
        BINARY_CRITERIA.map((k) => {
          const score = latestEvaluation[k];
          // Map 1-5 scale to normalized value (1=1, 5=5)
          return [k, typeof score === "number" ? Math.max(1, Math.min(5, score)) : 3];
        })
      );
      
      // Calculate average across all 10 criteria (1-5 scale)
      const totalCriteriaHits = BINARY_CRITERIA.reduce((sum, k) => sum + latestCriteria[k], 0);
      const averageScore = totalCriteriaHits / BINARY_CRITERIA.length;

      const feedback = latestEvaluation.feedback && typeof latestEvaluation.feedback === "object"
        ? latestEvaluation.feedback
        : {};
      const uniqueStrengths = Array.isArray(feedback.strengths) ? [...new Set(feedback.strengths)] : [];
      const uniqueRecommendations = Array.isArray(feedback.improvement_suggestions)
        ? [...new Set(feedback.improvement_suggestions)]
        : [];
      const forwardTarget = feedback.forward_target || null;

      const judgeSummary = latestEvaluation.judge_reasoning && typeof latestEvaluation.judge_reasoning === "object"
        ? latestEvaluation.judge_reasoning.overall_assessment
        : "";

      const summary = judgeSummary
        ? `${judgeSummary} Latest full-thread score: ${averageScore.toFixed(1)}/5.0 across all CARE criteria.`
        : `Latest full-thread empathy evaluation average: ${averageScore.toFixed(1)}/5.0 across all CARE criteria.`;

      return {
        statusCode: 200,
        body: JSON.stringify({
          overall_score: Math.round(averageScore * 10) / 10,  // Average across 1-5 scale
          total_messages_evaluated: 1,
          total_criteria_hits: totalCriteriaHits,  // Sum of 1-5 scores
          total_interactions: allEmpathyData.length,
          empathy_interactions: 1,
          is_1_to_5_scale: true,
          ...latestCriteria,
          summary,
          strengths: uniqueStrengths.length > 0 ? uniqueStrengths : null,
          recommendations: uniqueRecommendations.length > 0 ? uniqueRecommendations : null,
          forward_target: forwardTarget,
        }),
      };
    }

    // Get recent evaluations for feedback text (top 3)
    const recentEmpathyData = allEmpathyData.slice(0, 3);

    // Accumulate binary criterion hit counts across all evaluated messages
    const criteriaTotals = Object.fromEntries(BINARY_CRITERIA.map(k => [k, 0]));
    let validCount = 0;
    let strengths = [];
    let recommendations = [];
    let forwardTarget = "";

    console.log(`Found ${allEmpathyData.length} empathy evaluations for scoring`);
    console.log(`Using ${recentEmpathyData.length} recent evaluations for feedback`);

    allEmpathyData.forEach((row) => {
      const evaluation = row.empathy_evaluation;
      // A valid evaluation has the first binary criterion defined as a number
      if (evaluation && typeof evaluation === "object" &&
          typeof evaluation.making_feel_at_ease === "number") {
        BINARY_CRITERIA.forEach(k => {
          criteriaTotals[k] += evaluation[k] === 1 ? 1 : 0;
        });
        validCount++;
      }
    });

    // Collect feedback text from recent evaluations (top 3), falling back to all if needed
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
        if (evaluation.feedback.improvement_suggestions && Array.isArray(evaluation.feedback.improvement_suggestions)) {
          recommendations = [...recommendations, ...evaluation.feedback.improvement_suggestions];
        }
        if (evaluation.feedback.forward_target && !forwardTarget) {
          forwardTarget = evaluation.feedback.forward_target;
        }
      }
    });

    // Total criteria hits across all messages
    const totalCriteriaHits = BINARY_CRITERIA.reduce((sum, k) => sum + criteriaTotals[k], 0);

    // Identify top and bottom criteria by hit rate (hits / messages evaluated)
    const criteriaByRate = BINARY_CRITERIA
      .map(k => ({ key: k, label: CRITERIA_LABELS[k], rate: validCount > 0 ? criteriaTotals[k] / validCount : 0 }))
      .sort((a, b) => b.rate - a.rate);

    const topCriteria = criteriaByRate.filter(c => c.rate >= 0.7).map(c => c.label).join(", ");
    const lowCriteria = criteriaByRate.filter(c => c.rate < 0.3).map(c => c.label).join(", ");

    const summary =
      `Across ${validCount} evaluated message${validCount !== 1 ? "s" : ""}, you demonstrated CARE criteria ${totalCriteriaHits} time${totalCriteriaHits !== 1 ? "s" : ""} in total. ` +
      (topCriteria ? `Most consistent areas: ${topCriteria}. ` : "") +
      (lowCriteria ? `Areas to develop: ${lowCriteria}. ` : "") +
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

    const uniqueStrengths = [...new Set(strengths)];
    const uniqueRecommendations = [...new Set(recommendations)];

    return {
      statusCode: 200,
      body: JSON.stringify({
        overall_score: totalCriteriaHits,
        total_messages_evaluated: validCount,
        total_criteria_hits: totalCriteriaHits,
        total_interactions: totalInteractions[0]?.count || 0,
        empathy_interactions: validCount,
        ...criteriaTotals,
        summary,
        strengths: uniqueStrengths.length > 0 ? uniqueStrengths : null,
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


