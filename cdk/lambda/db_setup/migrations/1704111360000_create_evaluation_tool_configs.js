exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS "evaluation_tool_configs" (
      "config_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
      "tool_name" varchar(20) NOT NULL,
      "config_json" jsonb NOT NULL,
      "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_evaluation_tool_configs_tool_name
      ON "evaluation_tool_configs" ("tool_name");
  `);

  /* Grant permissions to app users */
  pgm.sql(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON "evaluation_tool_configs" TO readwrite;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "evaluation_tool_configs" TO tablecreator;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("evaluation_tool_configs", { ifExists: true, cascade: true });
};
