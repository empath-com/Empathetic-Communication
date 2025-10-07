# Database Modification Guide

This guide explains how to add new tables, columns, or modify the database schema using our **node-pg-migrate** system.

## Overview

The project uses **node-pg-migrate** with JavaScript migration files for database schema management. All migrations are automatically executed during CDK deployment via a Lambda function.

## Migration System Architecture

### Components:
- **Migration Files**: JavaScript files in `cdk/lambda/db_setup/migrations/`
- **Migration Runner**: Lambda function (`cdk/lambda/db_setup/index.js`)
- **Tracking**: Applied migrations tracked in `pgmigrations` table
- **Execution**: Automatic during CDK deployment

### Current Migration Files:
```
1704110400000_create_extensions_and_users.js
1704110460000_create_simulation_groups.js
1704110520000_create_patients.js
1704110580000_create_enrolments.js
1704110640000_create_patient_data.js
1704110700000_create_student_interactions.js
1704110760000_create_sessions.js
1704110820000_create_messages.js
1704110880000_create_user_engagement_log.js
1704110940000_create_feedback.js
1704111000000_create_system_prompt_history.js
1704111060000_add_vector_extension.js
1704111120000_add_voice_toggles.js
1704111180000_create_empathy_prompt_history.js
```

## Adding a New Migration

### Step 1: Create Migration File

Create a new JavaScript file in `cdk/lambda/db_setup/migrations/` using timestamp naming:

```
1704111240000_create_analytics_table.js
```

**Naming Convention**: `{timestamp}_{descriptive_name}.js`
- Use Unix timestamp (milliseconds) for ordering
- Descriptive name explaining the change
- Always use `.js` extension (not `.sql`)

### Step 2: Write Migration Code

```javascript
exports.up = (pgm) => {
  // Create the analytics table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS "analytics" (
      "analytics_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
      "user_id" uuid,
      "page_viewed" varchar,
      "time_spent" integer,
      "recorded_at" timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add foreign key constraint
  pgm.sql(`
    ALTER TABLE "analytics" 
    ADD CONSTRAINT "fk_analytics_user" 
    FOREIGN KEY ("user_id") 
    REFERENCES "users" ("user_id") 
    ON DELETE CASCADE ON UPDATE CASCADE
  `);
};

exports.down = (pgm) => {
  // Rollback migration (optional but recommended)
  pgm.dropTable("analytics", { ifExists: true, cascade: true });
};
```

### Step 3: Deploy

Migrations run automatically during CDK deployment:

```bash
cdk deploy --all --profile <your-profile>
```

## Migration File Structure

### Required Exports:
- **`exports.up`**: Forward migration logic
- **`exports.down`**: Rollback logic (optional but recommended)

### Available Methods:
- **`pgm.sql()`**: Execute raw SQL
- **`pgm.createTable()`**: Create table with schema
- **`pgm.addColumn()`**: Add column to existing table
- **`pgm.dropTable()`**: Drop table
- **`pgm.addConstraint()`**: Add constraints

## Real Examples from Project

### Creating Extensions and Tables:
```javascript
// 1704110400000_create_extensions_and_users.js
exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "vector"');
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      user_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_email varchar UNIQUE,
      username varchar,
      first_name varchar,
      last_name varchar,
      time_account_created timestamptz NOT NULL DEFAULT now(),
      roles varchar[],
      last_sign_in timestamptz
    )
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("users", { ifExists: true, cascade: true });
  pgm.dropExtension("vector", { ifExists: true });
  pgm.dropExtension("uuid-ossp", { ifExists: true });
};
```

### Adding Columns to Existing Tables:
```javascript
// 1704111300000_add_user_preferences.js
exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='timezone'
      ) THEN
        ALTER TABLE "users" ADD COLUMN "timezone" varchar DEFAULT 'UTC';
      END IF;
      
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='preferences'
      ) THEN
        ALTER TABLE "users" ADD COLUMN "preferences" jsonb DEFAULT '{}';
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE "users" DROP COLUMN IF EXISTS "preferences"');
  pgm.sql('ALTER TABLE "users" DROP COLUMN IF EXISTS "timezone"');
};
```

### Creating Tables with Default Data:
```javascript
// 1704111180000_create_empathy_prompt_history.js
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS "empathy_prompt_history" (
      "history_id" uuid PRIMARY KEY DEFAULT (uuid_generate_v4()),
      "prompt_content" text NOT NULL,
      "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Insert default empathy prompt
  pgm.sql(`
    INSERT INTO "empathy_prompt_history" (prompt_content) VALUES (
      'Default empathy evaluation prompt content...'
    ) ON CONFLICT DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("empathy_prompt_history", { ifExists: true, cascade: true });
};
```

## How the System Works

### Migration Execution Flow:
1. **CDK Deployment**: Triggers db_setup Lambda function
2. **Migration Tracking**: Checks `pgmigrations` table for completed migrations
3. **New Migrations**: Executes only new migration files in timestamp order
4. **Tracking Update**: Records completed migrations in `pgmigrations` table
5. **Idempotent**: Safe to run multiple times

### Database Connection:
- Uses **RDS Proxy** for connection pooling
- Credentials managed via **AWS Secrets Manager**
- Supports both new and existing database deployments

### Migration Tracking:
```sql
-- pgmigrations table structure
CREATE TABLE pgmigrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  run_on TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Best Practices

### File Naming:
- **Timestamp-based**: Use Unix timestamp for chronological ordering
- **Descriptive**: Clear description of what the migration does
- **Consistent**: Follow existing naming pattern

### SQL Best Practices:
- **Idempotent**: Use `IF NOT EXISTS`, `IF EXISTS` clauses
- **Transactions**: Wrap complex changes in transactions
- **Constraints**: Name constraints explicitly for easier management
- **Indexes**: Add indexes for performance-critical queries

### Migration Content:
- **Single Purpose**: One logical change per migration
- **Rollback Support**: Always include `exports.down` function
- **Data Safety**: Consider data migration for schema changes
- **Testing**: Test migrations on development environment first

## Common Patterns

### Adding Indexes:
```javascript
exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_session_id 
    ON messages (session_id);
  `);
};
```

### Modifying Columns:
```javascript
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE "users" 
    ALTER COLUMN "user_email" TYPE varchar(255),
    ALTER COLUMN "user_email" SET NOT NULL;
  `);
};
```

### Adding Constraints:
```javascript
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE "messages" 
    ADD CONSTRAINT "chk_message_content_length" 
    CHECK (length(message_content) > 0);
  `);
};
```

## Troubleshooting

### Common Issues:
- **Timestamp Conflicts**: Ensure unique timestamps for migration files
- **SQL Syntax**: Test SQL in database console before migration
- **Dependencies**: Ensure referenced tables/columns exist
- **Permissions**: Verify database user has required privileges

### Debugging:
- Check CloudWatch logs for db_setup Lambda function
- Verify migration tracking in `pgmigrations` table
- Test migrations locally with same database structure

### Recovery:
- Migrations are tracked individually
- Failed migrations can be fixed and re-run
- Use `exports.down` for rollback if needed
