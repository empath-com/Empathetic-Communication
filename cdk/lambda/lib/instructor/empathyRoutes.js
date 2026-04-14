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

const routes = {
  "GET /instructor/empathy_summary": async ({ event, sqlConnection, response }) => {
    if (
      event.queryStringParameters != null &&
      event.queryStringParameters.student_email &&
      event.queryStringParameters.simulation_group_id
    ) {
      const { student_email, simulation_group_id, patient_id } =
        event.queryStringParameters;

      try {
        // Get user_id from student email
        const userResult = await sqlConnection`
          SELECT user_id FROM "users" WHERE user_email = ${student_email} LIMIT 1;
        `;

        const userId = userResult[0]?.user_id;
        if (!userId) {
          response.statusCode = 404;
          response.body = JSON.stringify({ error: "Student not found" });
          return response;
        }

        // Check if empathy_evaluation column exists and get data
        let empathyData = [];
        try {
          // First check if column exists
          const columnCheck = await sqlConnection`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'messages' AND column_name = 'empathy_evaluation';
          `;

          if (columnCheck.length === 0) {
            console.log("empathy_evaluation column does not exist in messages table");
            response.statusCode = 200;
            response.body = JSON.stringify({
              ...EMPTY_SUMMARY,
              summary: "Empathy evaluation feature not yet available. Database schema needs to be updated.",
            });
            return response;
          }

          // Column exists, try to get data
          if (patient_id) {
            // If patient_id is provided, filter by that specific patient
            empathyData = await sqlConnection`
              SELECT m.empathy_evaluation
              FROM "messages" m
              JOIN "sessions" s ON m.session_id = s.session_id
              JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
              JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
              JOIN "patients" p ON si.patient_id = p.patient_id
              WHERE e.user_id = ${userId}
              AND e.simulation_group_id = ${simulation_group_id}
              AND p.patient_id = ${patient_id}
              AND m.student_sent = true
              AND m.empathy_evaluation IS NOT NULL
              AND m.empathy_evaluation != '{}'
              AND m.empathy_evaluation::text != 'null';
            `;
          } else {
            // If no patient_id, get all empathy data for the student in this simulation group
            // This retrieves empathy evaluations from messages where students have interacted with patients
            // The data includes perspective-taking, emotional resonance, acknowledgment, and communication scores
            empathyData = await sqlConnection`
              SELECT m.empathy_evaluation
              FROM "messages" m
              JOIN "sessions" s ON m.session_id = s.session_id
              JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
              JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
              WHERE e.user_id = ${userId}
              AND e.simulation_group_id = ${simulation_group_id}
              AND m.student_sent = true
              AND m.empathy_evaluation IS NOT NULL
              AND m.empathy_evaluation != '{}'
              AND m.empathy_evaluation::text != 'null';
            `;
          }
        } catch (error) {
          console.error("Error querying empathy data:", error);
          response.statusCode = 500;
          response.body = JSON.stringify({
            error: "Database query failed: " + error.message,
          });
          return response;
        }

        if (!empathyData || empathyData.length === 0) {
          response.statusCode = 200;
          response.body = JSON.stringify({
            ...EMPTY_SUMMARY,
            summary: "No empathy evaluation data available for this student.",
          });
          return response;
        }

        // Accumulate binary criterion hit counts across all evaluated messages
        const criteriaTotals = Object.fromEntries(BINARY_CRITERIA.map(k => [k, 0]));
        let validCount = 0;
        let forwardTarget = "";

        empathyData.forEach((row) => {
          const evaluation = row.empathy_evaluation;
          if (evaluation && typeof evaluation === "object" &&
              typeof evaluation.making_feel_at_ease === "number") {
            BINARY_CRITERIA.forEach(k => {
              criteriaTotals[k] += evaluation[k] === 1 ? 1 : 0;
            });
            if (evaluation.feedback?.forward_target && !forwardTarget) {
              forwardTarget = evaluation.feedback.forward_target;
            }
            validCount++;
          }
        });

        const totalCriteriaHits = BINARY_CRITERIA.reduce((sum, k) => sum + criteriaTotals[k], 0);

        const criteriaByRate = BINARY_CRITERIA
          .map(k => ({ label: CRITERIA_LABELS[k], rate: validCount > 0 ? criteriaTotals[k] / validCount : 0 }))
          .sort((a, b) => b.rate - a.rate);

        const topCriteria = criteriaByRate.filter(c => c.rate >= 0.7).map(c => c.label).join(", ");
        const lowCriteria = criteriaByRate.filter(c => c.rate < 0.3).map(c => c.label).join(", ");

        const summary =
          `Across ${validCount} evaluated message${validCount !== 1 ? "s" : ""}, this student demonstrated CARE criteria ${totalCriteriaHits} time${totalCriteriaHits !== 1 ? "s" : ""} in total. ` +
          (topCriteria ? `Most consistent areas: ${topCriteria}. ` : "") +
          (lowCriteria ? `Areas to develop: ${lowCriteria}. ` : "") +
          (forwardTarget ? `Focus for next session: ${forwardTarget}.` : "");

        // Get total interactions count (only empathy-evaluated messages)
        let totalInteractions;
        if (patient_id) {
          totalInteractions = await sqlConnection`
            SELECT COUNT(*) as count
            FROM "messages" m
            JOIN "sessions" s ON m.session_id = s.session_id
            JOIN "student_interactions" si ON s.student_interaction_id = si.student_interaction_id
            JOIN "enrolments" e ON si.enrolment_id = e.enrolment_id
            JOIN "patients" p ON si.patient_id = p.patient_id
            WHERE e.user_id = ${userId}
            AND e.simulation_group_id = ${simulation_group_id}
            AND p.patient_id = ${patient_id}
            AND m.student_sent = true
            AND m.empathy_evaluation IS NOT NULL
            AND m.empathy_evaluation != '{}'
            AND m.empathy_evaluation::text != 'null';
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
            AND m.empathy_evaluation != '{}'
            AND m.empathy_evaluation::text != 'null';
          `;
        }

        // Get patient name if patient_id is provided
        let patientName = null;
        if (patient_id) {
          const patientData = await sqlConnection`
            SELECT patient_name FROM "patients" WHERE patient_id = ${patient_id};
          `;
          if (patientData.length > 0) {
            patientName = patientData[0].patient_name;
          }
        }

        response.statusCode = 200;
        response.body = JSON.stringify({
          overall_score: totalCriteriaHits,
          total_messages_evaluated: validCount,
          total_criteria_hits: totalCriteriaHits,
          total_interactions: parseInt(totalInteractions[0].count),
          empathy_interactions: validCount,
          ...criteriaTotals,
          summary,
          patient_name: patientName,
        });
      } catch (err) {
        response.statusCode = 500;
        console.error(err);
        response.body = JSON.stringify({ error: "Internal server error" });
      }
    } else {
      response.statusCode = 400;
      response.body = JSON.stringify({
        error: "student_email and simulation_group_id are required",
      });
    }
    return response;
  },
};

module.exports = routes;
