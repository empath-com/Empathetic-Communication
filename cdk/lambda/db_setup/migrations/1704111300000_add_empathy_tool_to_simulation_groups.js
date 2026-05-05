exports.up = async (sql) => {
  await sql`
    ALTER TABLE "simulation_groups"
    ADD COLUMN IF NOT EXISTS empathy_tool VARCHAR(20) NOT NULL DEFAULT 'CARE';
  `;
};

exports.down = async (sql) => {
  await sql`
    ALTER TABLE "simulation_groups"
    DROP COLUMN IF EXISTS empathy_tool;
  `;
};
