const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const postgres = require("postgres");
const { createLogger } = require("../lib/shared/logger");

// Create a Secrets Manager client
const secretsManager = new SecretsManagerClient();
const logger = createLogger({ service: "admin-db", component: "db-init", role: "admin" });

async function initializeConnection(SM_DB_CREDENTIALS, RDS_PROXY_ENDPOINT) {
    try {
        // Retrieve the secret from AWS Secrets Manager
        const getSecretValueCommand = new GetSecretValueCommand({ SecretId: SM_DB_CREDENTIALS });
        const secretResponse = await secretsManager.send(getSecretValueCommand);

        const credentials = JSON.parse(secretResponse.SecretString);

        const connectionConfig = {
            host: RDS_PROXY_ENDPOINT,
            // host: credentials.host,
            port: credentials.port,
            username: credentials.username,
            password: credentials.password,
            database: credentials.dbname,
            ssl: false,
        };

        // Create the PostgreSQL connection
        // Global variable to hold the database connection
        global.sqlConnectionTableCreator = postgres(connectionConfig);

        logger.info("Database connection initialized", { event: "db_connection_initialized" });
    } catch (error) {
        logger.error("Database connection initialization failed", {
            event: "db_connection_error",
        }, error);
        throw new Error("Failed to initialize database connection");
    }
}

module.exports = { initializeConnection };


