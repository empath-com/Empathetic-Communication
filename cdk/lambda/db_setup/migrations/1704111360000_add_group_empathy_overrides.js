exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE "simulation_groups"
    ADD COLUMN IF NOT EXISTS empathy_prompt_override text,
    ADD COLUMN IF NOT EXISTS empathy_tool_override varchar(20);
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'simulation_groups_empathy_tool_override_check'
      ) THEN
        ALTER TABLE "simulation_groups"
        ADD CONSTRAINT simulation_groups_empathy_tool_override_check
        CHECK (
          empathy_tool_override IS NULL OR empathy_tool_override IN ('CARE', 'PRISM')
        );
      END IF;
    END$$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE "simulation_groups"
    DROP CONSTRAINT IF EXISTS simulation_groups_empathy_tool_override_check;
  `);

  pgm.sql(`
    ALTER TABLE "simulation_groups"
    DROP COLUMN IF EXISTS empathy_prompt_override,
    DROP COLUMN IF EXISTS empathy_tool_override;
  `);
};
