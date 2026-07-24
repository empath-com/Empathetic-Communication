import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function maybe(name, fallback = "") {
  return process.env[name] || fallback;
}

function loadUsers() {
  const usersFile = process.env.STRESS_USERS_FILE;
  if (usersFile) {
    const raw = fs.readFileSync(path.resolve(usersFile), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("STRESS_USERS_FILE must contain a non-empty JSON array");
    }
    return parsed;
  }

  const count = Number.parseInt(maybe("STRESS_USER_COUNT", "0"), 10);
  if (count > 0) {
    const prefix = required("STRESS_USER_PREFIX");
    const password = required("STRESS_USER_PASSWORD");
    const domain = maybe("STRESS_USER_DOMAIN", "example.com");

    return Array.from({ length: count }, (_, i) => {
      const idx = i + 1;
      const username = `${prefix}${idx}`;
      return {
        username,
        password,
        email: `${username}@${domain}`,
      };
    });
  }

  throw new Error(
    "Provide STRESS_USERS_FILE or STRESS_USER_COUNT with STRESS_USER_PREFIX and STRESS_USER_PASSWORD"
  );
}

function buildSecretHash(username, clientId, clientSecret) {
  const message = `${username}${clientId}`;
  return crypto.createHmac("sha256", clientSecret).update(message).digest("base64");
}

function fetchToken({ username, password }, config) {
  if (!username || !password) {
    throw new Error("Each user must include username and password");
  }

  const authParams = [`USERNAME=${username}`, `PASSWORD=${password}`];
  if (config.clientSecret) {
    const secretHash = buildSecretHash(username, config.clientId, config.clientSecret);
    authParams.push(`SECRET_HASH=${secretHash}`);
  }

  const args = [
    "cognito-idp",
    "initiate-auth",
    "--auth-flow",
    config.authFlow,
    "--client-id",
    config.clientId,
    "--auth-parameters",
    authParams.join(","),
    "--region",
    config.region,
    "--output",
    "json",
  ];

  if (config.profile) {
    args.push("--profile", config.profile);
  }

  const output = execFileSync("aws", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const parsed = JSON.parse(output);
  const token = parsed?.AuthenticationResult?.IdToken;
  if (!token) {
    throw new Error(`No IdToken returned for ${username}`);
  }

  return token;
}

const config = {
  profile: maybe("STRESS_AWS_PROFILE"),
  region: required("STRESS_AWS_REGION"),
  clientId: required("STRESS_COGNITO_CLIENT_ID"),
  clientSecret: maybe("STRESS_COGNITO_CLIENT_SECRET"),
  authFlow: maybe("STRESS_AUTH_FLOW", "USER_PASSWORD_AUTH"),
  outputFile: path.resolve(maybe("STRESS_TOKENS_OUTPUT", "./scripts/stress/tokens.generated.json")),
};

const users = loadUsers();
console.log(`Bootstrapping tokens for ${users.length} users...`);

const tokens = [];
for (const [index, user] of users.entries()) {
  try {
    const token = fetchToken(user, config);
    tokens.push({
      username: user.username,
      email: user.email || user.username,
      token,
    });
    console.log(`[${index + 1}/${users.length}] token fetched for ${user.username}`);
  } catch (error) {
    console.error(`[${index + 1}/${users.length}] failed for ${user.username}: ${error.message}`);
    throw error;
  }
}

fs.writeFileSync(config.outputFile, JSON.stringify(tokens, null, 2), "utf8");
console.log(`Saved ${tokens.length} tokens to ${config.outputFile}`);
