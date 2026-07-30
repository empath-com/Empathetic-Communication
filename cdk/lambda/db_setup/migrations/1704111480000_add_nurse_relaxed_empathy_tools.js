/**
 * Extend empathy_tool_override constraint to allow NURSE and _RELAXED schema variants.
 */
module.exports = {
  up: async (sqlConnection) => {
    await sqlConnection`
      ALTER TABLE "simulation_groups"
        DROP CONSTRAINT IF EXISTS simulation_groups_empathy_tool_override_check,
        ADD CONSTRAINT simulation_groups_empathy_tool_override_check CHECK (
          empathy_tool_override IS NULL OR empathy_tool_override IN (
            'CARE', 'CARE_RELAXED', 'PRISM', 'PRISM_RELAXED', 'NURSE', 'NURSE_RELAXED'
          )
        );
    `;
  },
  down: async (sqlConnection) => {
    await sqlConnection`
      ALTER TABLE "simulation_groups"
        DROP CONSTRAINT IF EXISTS simulation_groups_empathy_tool_override_check,
        ADD CONSTRAINT simulation_groups_empathy_tool_override_check CHECK (
          empathy_tool_override IS NULL OR empathy_tool_override IN ('CARE', 'PRISM')
        );
    `;
  },
};
