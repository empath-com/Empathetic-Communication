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
            console.log(
              "empathy_evaluation column does not exist in messages table"
            );
            response.statusCode = 200;
            response.body = JSON.stringify({
              overall_score: 0,
              total_interactions: 0,
              empathy_interactions: 0,
              avg_rapport: 0,
              avg_listening: 0,
              avg_whole_person: 0,
              avg_affective_empathy: 0,
              avg_communication: 0,
              avg_shared_planning: 0,
              summary:
                "Empathy evaluation feature not yet available. Database schema needs to be updated.",
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
            overall_score: 0,
            total_interactions: 0,
            empathy_interactions: 0,
            avg_rapport: 0,
            avg_listening: 0,
            avg_whole_person: 0,
            avg_affective_empathy: 0,
            avg_communication: 0,
            avg_shared_planning: 0,
            summary: "No empathy evaluation data available for this student.",
          });
          return response;
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

        empathyData.forEach((row) => {
          const evaluation = row.empathy_evaluation;
          if (evaluation && typeof evaluation === "object" &&
              (evaluation.rapport > 0 || evaluation.listening > 0 || evaluation['whole_person'] > 0 ||
               evaluation.affective_empathy > 0 || evaluation.communication > 0 || evaluation.shared_planning > 0)) {
            const dimTotal = (evaluation.feedback?.total_score) ||
              ((evaluation.rapport || 0) + (evaluation.listening || 0) + (evaluation['whole_person'] || 0) +
               (evaluation.affective_empathy || 0) + (evaluation.communication || 0) + (evaluation.shared_planning || 0));
            totalCareScore += dimTotal;
            totalRapport += evaluation.rapport || 0;
            totalListening += evaluation.listening || 0;
            totalWholePerson += evaluation['whole_person'] || 0;
            totalAffective += evaluation.affective_empathy || 0;
            totalCommunication += evaluation.communication || 0;
            totalSharedPlanning += evaluation.shared_planning || 0;
            validCount++;
          }
        });

        const avgScore = validCount > 0 ? (totalCareScore / validCount).toFixed(1) : 0;
        const avgRapport = validCount > 0 ? (totalRapport / validCount).toFixed(1) : 0;
        const avgListening = validCount > 0 ? (totalListening / validCount).toFixed(1) : 0;
        const avgWholePerson = validCount > 0 ? (totalWholePerson / validCount).toFixed(1) : 0;
        const avgAffective = validCount > 0 ? (totalAffective / validCount).toFixed(1) : 0;
        const avgCommunication = validCount > 0 ? (totalCommunication / validCount).toFixed(1) : 0;
        const avgSharedPlanning = validCount > 0 ? (totalSharedPlanning / validCount).toFixed(1) : 0;

        // Identify strong and weak CARE areas (by % of max)
        const careAreas = [
          { name: "rapport", avg: parseFloat(avgRapport), max: 10 },
          { name: "listening", avg: parseFloat(avgListening), max: 5 },
          { name: "whole-person care", avg: parseFloat(avgWholePerson), max: 10 },
          { name: "affective empathy", avg: parseFloat(avgAffective), max: 5 },
          { name: "communication", avg: parseFloat(avgCommunication), max: 10 },
          { name: "shared planning", avg: parseFloat(avgSharedPlanning), max: 10 },
        ];

        const strengthAreas = careAreas.filter((d) => d.avg / d.max >= 0.7).map((d) => d.name).join(", ");
        const weaknessAreas = careAreas.filter((d) => d.avg / d.max < 0.5).map((d) => d.name).join(", ");

        const scoreLabel = parseFloat(avgScore) >= 40 ? "strong" :
          parseFloat(avgScore) >= 30 ? "developing" :
          parseFloat(avgScore) >= 20 ? "emerging" : "foundational";

        const summary =
          `This student's average CARE Measure score is ${avgScore}/50, reflecting ${scoreLabel} empathetic communication skills. ` +
          (strengthAreas ? `Strongest areas: ${strengthAreas}. ` : "") +
          (weaknessAreas ? `Areas for development: ${weaknessAreas}.` : "");

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
          overall_score: parseFloat(avgScore),
          total_interactions: parseInt(totalInteractions[0].count),
          empathy_interactions: validCount,
          avg_rapport: parseFloat(avgRapport),
          avg_listening: parseFloat(avgListening),
          avg_whole_person: parseFloat(avgWholePerson),
          avg_affective_empathy: parseFloat(avgAffective),
          avg_communication: parseFloat(avgCommunication),
          avg_shared_planning: parseFloat(avgSharedPlanning),
          summary: summary.replace(/,\s*$/, ".").replace(/,\s*\./g, "."),
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
