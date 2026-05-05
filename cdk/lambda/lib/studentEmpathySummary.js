/**
 * Returns the most recent stored empathy evaluation for a student.
 * No evaluation is performed here — data is read directly from the messages table.
 */
const CARE_CRITERIA = [
  'making_feel_at_ease', 'letting_tell_story', 'really_listening',
  'interested_in_whole_person', 'understanding_concerns', 'showing_care_compassion',
  'being_positive', 'explaining_clearly', 'helping_take_control', 'making_plan_of_action',
];

const PRISM_CRITERIA = ['prepare', 'recognise', 'interact', 'self_assess', 'master'];

const studentEmpathySummary = async (event, sqlConnection) => {
  const { session_id, email, simulation_group_id, patient_id } =
    event.queryStringParameters || {};

  if (!email || !simulation_group_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters: email, simulation_group_id" }),
    };
  }

  try {
    const columnCheck = await sqlConnection`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'empathy_evaluation';
    `;
    if (columnCheck.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ summary: "Empathy evaluation feature not yet available." }),
      };
    }

    const userResult = await sqlConnection`
      SELECT user_id FROM "users" WHERE user_email = ${email} LIMIT 1;
    `;
    const userId = userResult[0]?.user_id;
    if (!userId) {
      return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
    }

    // Fetch only the single most recent stored evaluation.
    let rows;
    if (session_id) {
      rows = await sqlConnection`
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
        ORDER BY m.time_sent DESC
        LIMIT 1;
      `;
    } else if (patient_id) {
      rows = await sqlConnection`
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
        ORDER BY m.time_sent DESC
        LIMIT 1;
      `;
    } else {
      rows = await sqlConnection`
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
        ORDER BY m.time_sent DESC
        LIMIT 1;
      `;
    }

    if (!rows || rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ summary: "No empathy evaluation data available yet." }),
      };
    }

    const evaluation = rows[0].empathy_evaluation;
    if (!evaluation || typeof evaluation !== 'object') {
      return {
        statusCode: 200,
        body: JSON.stringify({ summary: "No valid empathy evaluation data available yet." }),
      };
    }

    const empathyTool = evaluation.evaluation_tool || 'CARE';
    const toolLabel = empathyTool === 'PRISM' ? 'PRISM' : 'CARE';
    const criteria = empathyTool === 'PRISM' ? PRISM_CRITERIA : CARE_CRITERIA;

    // Extract and clamp criterion scores to 1-5
    const criteriaScores = Object.fromEntries(
      criteria.map(k => {
        const score = evaluation[k];
        return [k, typeof score === 'number' ? Math.max(1, Math.min(5, score)) : 3];
      })
    );

    const totalCriteriaHits = criteria.reduce((sum, k) => sum + criteriaScores[k], 0);
    const averageScore = Math.round((totalCriteriaHits / criteria.length) * 10) / 10;

    // For CARE: aggregate individual scores into 6 display domains
    const domainScores = empathyTool !== 'PRISM' ? {
      rapport:           criteriaScores.making_feel_at_ease + criteriaScores.letting_tell_story,
      listening:         criteriaScores.really_listening,
      whole_person:      criteriaScores.interested_in_whole_person + criteriaScores.understanding_concerns,
      affective_empathy: criteriaScores.showing_care_compassion,
      communication:     criteriaScores.being_positive + criteriaScores.explaining_clearly,
      shared_planning:   criteriaScores.helping_take_control + criteriaScores.making_plan_of_action,
    } : {};

    const feedback = evaluation.feedback && typeof evaluation.feedback === 'object'
      ? evaluation.feedback : {};
    const strengths = Array.isArray(feedback.strengths) ? [...new Set(feedback.strengths)] : [];
    const recommendations = Array.isArray(feedback.improvement_suggestions)
      ? [...new Set(feedback.improvement_suggestions)] : [];
    const forwardTarget = feedback.forward_target || null;

    const overallAssessment = evaluation.judge_reasoning?.overall_assessment || '';
    const summary = overallAssessment
      ? `${overallAssessment} Latest full-thread score: ${averageScore}/5.0 across all ${toolLabel} criteria.`
      : `Latest full-thread empathy evaluation average: ${averageScore}/5.0 across all ${toolLabel} criteria.`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        empathy_tool: empathyTool,
        overall_score: averageScore,
        total_criteria_hits: totalCriteriaHits,
        ...criteriaScores,
        ...domainScores,
        summary,
        strengths: strengths.length > 0 ? strengths : null,
        recommendations: recommendations.length > 0 ? recommendations : null,
        forward_target: forwardTarget,
      }),
    };
  } catch (error) {
    console.error("[studentEmpathySummary] Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch empathy summary", details: error.message }),
    };
  }
};

module.exports = studentEmpathySummary;
