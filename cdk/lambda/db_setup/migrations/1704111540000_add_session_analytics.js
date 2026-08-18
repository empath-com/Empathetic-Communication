exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS started_at timestamptz,
      ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
      ADD COLUMN IF NOT EXISTS active_duration_seconds integer NOT NULL DEFAULT 0
        CHECK (active_duration_seconds >= 0),
      ADD COLUMN IF NOT EXISTS completed_at timestamptz,
      ADD COLUMN IF NOT EXISTS completion_status varchar NOT NULL DEFAULT 'in_progress'
        CHECK (completion_status IN ('in_progress', 'completed', 'abandoned')),
      ADD COLUMN IF NOT EXISTS completion_reason varchar;

    UPDATE sessions
    SET started_at = COALESCE(started_at, last_accessed)
    WHERE started_at IS NULL AND last_accessed IS NOT NULL;

    CREATE TABLE IF NOT EXISTS conversation_analytics_jobs (
      session_id uuid PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
      status varchar NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversation_analytics_snapshots (
      session_id uuid PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
      rubric_version varchar NOT NULL,
      evaluated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      dialogue_turn_count integer NOT NULL DEFAULT 0 CHECK (dialogue_turn_count >= 0),
      message_span_seconds integer CHECK (message_span_seconds >= 0),
      active_duration_seconds integer NOT NULL DEFAULT 0 CHECK (active_duration_seconds >= 0),
      communication_score numeric(5, 2) CHECK (communication_score >= 0 AND communication_score <= 100),
      objective_achieved boolean,
      analysis_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS conversation_metric_counts (
      session_id uuid REFERENCES sessions(session_id) ON DELETE CASCADE,
      metric_key varchar NOT NULL CHECK (metric_key IN (
        'empathy_statements',
        'open_ended_questions',
        'affirmations',
        'missed_empathy_opportunities',
        'interruptions',
        'patient_centered_language',
        'jargon_usage'
      )),
      metric_count integer NOT NULL CHECK (metric_count >= 0),
      PRIMARY KEY (session_id, metric_key)
    );

    CREATE TABLE IF NOT EXISTS conversation_recommendation_topics (
      session_id uuid REFERENCES sessions(session_id) ON DELETE CASCADE,
      topic_key varchar NOT NULL,
      PRIMARY KEY (session_id, topic_key)
    );

    CREATE INDEX IF NOT EXISTS sessions_analytics_status_idx
      ON sessions (completion_status, completed_at);
    CREATE INDEX IF NOT EXISTS sessions_analytics_interaction_idx
      ON sessions (student_interaction_id, started_at);
    CREATE INDEX IF NOT EXISTS conversation_analytics_jobs_status_idx
      ON conversation_analytics_jobs (status, created_at);
    CREATE INDEX IF NOT EXISTS conversation_metric_counts_key_idx
      ON conversation_metric_counts (metric_key);
    CREATE INDEX IF NOT EXISTS conversation_recommendation_topics_key_idx
      ON conversation_recommendation_topics (topic_key);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS conversation_recommendation_topics;
    DROP TABLE IF EXISTS conversation_metric_counts;
    DROP TABLE IF EXISTS conversation_analytics_snapshots;
    DROP TABLE IF EXISTS conversation_analytics_jobs;

    ALTER TABLE sessions
      DROP COLUMN IF EXISTS completion_reason,
      DROP COLUMN IF EXISTS completion_status,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS active_duration_seconds,
      DROP COLUMN IF EXISTS last_activity_at,
      DROP COLUMN IF EXISTS started_at;
  `);
};