const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

exports.getPatientContext = async (event) => {
  const { simulation_group_id, patient_id } = event.queryStringParameters;

  if (!simulation_group_id || !patient_id) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify({ error: "Missing required parameters" })
    };
  }

  try {
    const client = getPool();

    // Get system prompt
    const systemPromptQuery = `
      SELECT system_prompt 
      FROM "simulation_groups" 
      WHERE simulation_group_id = $1
    `;
    const systemPromptResult = await client.query(systemPromptQuery, [simulation_group_id]);

    // Get patient details
    const patientQuery = `
      SELECT patient_name, patient_age, patient_prompt, llm_completion
      FROM "patients" 
      WHERE patient_id = $1
    `;
    const patientResult = await client.query(patientQuery, [patient_id]);

    if (systemPromptResult.rows.length === 0 || patientResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*", 
          "Access-Control-Allow-Methods": "*",
        },
        body: JSON.stringify({ error: "Patient or simulation group not found" })
      };
    }

    const context = {
      system_prompt: systemPromptResult.rows[0].system_prompt,
      patient_name: patientResult.rows[0].patient_name,
      patient_age: patientResult.rows[0].patient_age,
      patient_prompt: patientResult.rows[0].patient_prompt,
      llm_completion: patientResult.rows[0].llm_completion
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify(context)
    };

  } catch (error) {
    console.error('Error fetching patient context:', error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};