const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function normalizeLevel(value) {
  const level = String(value || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEVELS, level)) {
    return level;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function createLogger(baseContext = {}) {
  const activeLevel = normalizeLevel(process.env.LOG_LEVEL || process.env.NODE_LOG_LEVEL);
  const activeLevelValue = LEVELS[activeLevel];

  const emit = (level, message, fields = {}, error = null) => {
    if (LEVELS[level] > activeLevelValue) return;

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseContext,
      ...fields,
    };

    if (error) {
      payload.error = serializeError(error);
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  return {
    child(childContext = {}) {
      return createLogger({ ...baseContext, ...childContext });
    },
    debug(message, fields = {}) {
      emit("debug", message, fields);
    },
    info(message, fields = {}) {
      emit("info", message, fields);
    },
    warn(message, fields = {}) {
      emit("warn", message, fields);
    },
    error(message, fields = {}, error = null) {
      emit("error", message, fields, error);
    },
  };
}

module.exports = {
  createLogger,
  LEVELS,
};
