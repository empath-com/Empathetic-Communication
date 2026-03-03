exports.up = (pgm) => {
  pgm.sql(`
    -- Change default from '{}' to NULL so new messages start with no evaluation
    ALTER TABLE messages ALTER COLUMN empathy_evaluation SET DEFAULT NULL;

    -- Backfill: set existing empty-object rows to NULL so they aren't
    -- counted as evaluated messages in the empathy summary
    UPDATE messages SET empathy_evaluation = NULL WHERE empathy_evaluation = '{}';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE messages ALTER COLUMN empathy_evaluation SET DEFAULT '{}';
    UPDATE messages SET empathy_evaluation = '{}' WHERE empathy_evaluation IS NULL;
  `);
};
