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
              overall_level: "No Data",
              total_interactions: 0,
              empathy_interactions: 0,
              avg_perspective_taking: 0,
              avg_emotional_resonance: 0,
              avg_acknowledgment: 0,
              avg_language_communication: 0,
              avg_cognitive_empathy: 0,
              avg_affective_empathy: 0,
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
            overall_level: "No Data",
            total_interactions: 0,
            empathy_interactions: 0,
            avg_perspective_taking: 0,
            avg_emotional_resonance: 0,
            avg_acknowledgment: 0,
            avg_language_communication: 0,
            avg_cognitive_empathy: 0,
            avg_affective_empathy: 0,
            summary:
              "No empathy evaluation data available for this student.",
          });
          return response;
        }

        // Calculate averages
        let totalScore = 0,
          totalPT = 0,
          totalER = 0,
          totalAck = 0,
          totalLang = 0,
          totalCog = 0,
          totalAff = 0;
        let validCount = 0;

        empathyData.forEach((row) => {
          const evaluation = row.empathy_evaluation;
          if (evaluation && typeof evaluation === "object") {
            totalScore += evaluation.empathy_score || 0;
            totalPT += evaluation.perspective_taking || 0;
            totalER += evaluation.emotional_resonance || 0;
            totalAck += evaluation.acknowledgment || 0;
            totalLang += evaluation.language_communication || 0;
            totalCog += evaluation.cognitive_empathy || 0;
            totalAff += evaluation.affective_empathy || 0;
            validCount++;
          }
        });

        const avgScore =
          validCount > 0 ? (totalScore / validCount).toFixed(1) : 0;
        const avgPT =
          validCount > 0 ? (totalPT / validCount).toFixed(1) : 0;
        const avgER =
          validCount > 0 ? (totalER / validCount).toFixed(1) : 0;
        const avgAck =
          validCount > 0 ? (totalAck / validCount).toFixed(1) : 0;
        const avgLang =
          validCount > 0 ? (totalLang / validCount).toFixed(1) : 0;
        const avgCog =
          validCount > 0 ? (totalCog / validCount).toFixed(1) : 0;
        const avgAff =
          validCount > 0 ? (totalAff / validCount).toFixed(1) : 0;

        // Determine overall level
        const getLevel = (score) => {
          if (score >= 4.5) return "Extending";
          if (score >= 3.5) return "Proficient";
          if (score >= 2.5) return "Competent";
          if (score >= 1.5) return "Advanced Beginner";
          return "Novice";
        };

        // Generate summary
        const overallLevel = getLevel(parseFloat(avgScore));

        // Determine strongest areas
        const strengths = [
          avgPT >= 3.5 ? "perspective-taking" : "",
          avgER >= 3.5 ? "emotional resonance" : "",
          avgAck >= 3.5 ? "patient acknowledgment" : "",
          avgLang >= 3.5 ? "communication language" : "",
        ]
          .filter(Boolean)
          .join(", ");

        // Determine areas for development
        const weaknesses = [
          avgPT < 3.5 ? "perspective-taking" : "",
          avgER < 3.5 ? "emotional resonance" : "",
          avgAck < 3.5 ? "patient acknowledgment" : "",
          avgLang < 3.5 ? "communication clarity" : "",
        ]
          .filter(Boolean)
          .join(", ");

        // Determine empathy profile
        let empathySummary = "";
        if (avgCog === avgAff) {
          empathySummary =
            avgCog >= 3.5
              ? "a balanced and strong mix of cognitive (understanding) and affective (emotional connection) empathy"
              : "a balanced but limited expression of both cognitive and affective empathy";
        } else {
          empathySummary =
            avgCog > avgAff
              ? "stronger cognitive empathy (understanding)"
              : "stronger affective empathy (emotional connection)";
        }

        // Final summary string
        const summary =
          `This student demonstrates ${overallLevel.toLowerCase()} empathetic communication skills with an average score of ${avgScore}/5. ` +
          (strengths ? `Strongest areas include ${strengths}. ` : "") +
          (weaknesses ? `Areas for development: ${weaknesses}. ` : "") +
          `The student shows ${empathySummary} in their interactions.`;

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
          overall_level: overallLevel,
          total_interactions: parseInt(totalInteractions[0].count),
          empathy_interactions: validCount,
          avg_perspective_taking: parseFloat(avgPT),
          avg_emotional_resonance: parseFloat(avgER),
          avg_acknowledgment: parseFloat(avgAck),
          avg_language_communication: parseFloat(avgLang),
          avg_cognitive_empathy: parseFloat(avgCog),
          avg_affective_empathy: parseFloat(avgAff),
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
