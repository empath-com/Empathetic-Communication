import os
import sys
import psycopg2
import logging

# Add the parent directory to the path so we can import the migrations module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_db_connection():
    """Get a connection to the database using environment variables"""
    try:
        connection = psycopg2.connect(
            host=os.environ.get('DB_HOST'),
            database=os.environ.get('DB_NAME'),
            user=os.environ.get('DB_USER'),
            password=os.environ.get('DB_PASSWORD'),
            port=os.environ.get('DB_PORT', 5432)
        )
        return connection
    except Exception as e:
        logger.error(f"Error connecting to database: {str(e)}")
        raise

def initialize_migration_tracking():
    """Initialize migration tracking for existing deployments.
    This marks the initial schema as already applied so it won't be reapplied.
    """
    connection = get_db_connection()
    cursor = connection.cursor()
    
    try:
        # Create the schema_migrations table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS "schema_migrations" (
                "id" SERIAL PRIMARY KEY,
                "migration_name" VARCHAR(255) UNIQUE NOT NULL,
                "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Check if the initial schema migration is already recorded
        cursor.execute("SELECT COUNT(*) FROM schema_migrations WHERE migration_name = %s", ("001_initial_schema",))
        count = cursor.fetchone()[0]
        
        if count == 0:
            # Mark the initial schema as already applied
            cursor.execute(
                "INSERT INTO schema_migrations (migration_name) VALUES (%s)",
                ("001_initial_schema",)
            )
            logger.info("Marked initial schema as already applied")
        else:
            logger.info("Initial schema already marked as applied")
            
        # Optionally mark other known migrations as applied
        # For example, if you know migration 002 is already applied:
        # cursor.execute(
        #     "INSERT INTO schema_migrations (migration_name) VALUES (%s) ON CONFLICT DO NOTHING",
        #     ("002_add_example_table",)
        # )
        
        connection.commit()
        logger.info("Migration tracking initialized successfully")
        
    except Exception as e:
        connection.rollback()
        logger.error(f"Error initializing migration tracking: {str(e)}")
        raise
    finally:
        cursor.close()
        connection.close()

if __name__ == "__main__":
    initialize_migration_tracking()
    print("Migration tracking initialized for existing deployment")