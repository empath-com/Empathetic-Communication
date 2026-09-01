exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS "patient_prompt_history" (
      "history_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
      "patient_id" uuid NOT NULL REFERENCES "patients"("patient_id") ON DELETE CASCADE,
      "prompt_content" text NOT NULL,
      "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS patient_prompt_history_patient_created_at_idx
      ON "patient_prompt_history" ("patient_id", "created_at" DESC);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("patient_prompt_history", { ifExists: true, cascade: true });
};