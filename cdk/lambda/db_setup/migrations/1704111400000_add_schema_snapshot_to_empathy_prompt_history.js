exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE "empathy_prompt_history"
    ADD COLUMN IF NOT EXISTS schema_identifier VARCHAR(100),
    ADD COLUMN IF NOT EXISTS schema_variant VARCHAR(20),
    ADD COLUMN IF NOT EXISTS schema_version VARCHAR(20);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE "empathy_prompt_history"
    DROP COLUMN IF EXISTS schema_version,
    DROP COLUMN IF EXISTS schema_variant,
    DROP COLUMN IF EXISTS schema_identifier;
  `);
};