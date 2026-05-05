exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE "empathy_prompt_history"
    ADD COLUMN IF NOT EXISTS empathy_tool VARCHAR(20) NOT NULL DEFAULT 'CARE';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE "empathy_prompt_history"
    DROP COLUMN IF EXISTS empathy_tool;
  `);
};
