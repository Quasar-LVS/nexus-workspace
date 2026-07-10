type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  userId?: string;
  service?: string;
  action?: string;
  durationMs?: number;
  [key: string]: any;
}

/**
 * Recursively inspects and redacts sensitive credentials/tokens/secrets from logs
 */
function scrub(val: any): any {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    return val.map(scrub);
  }

  if (typeof val === "object") {
    const scrubbed: any = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("key") ||
          lowerKey.includes("token") ||
          lowerKey.includes("password") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("anon") ||
          lowerKey.includes("auth") ||
          lowerKey.includes("jwt") ||
          lowerKey.includes("credential")
        ) {
          scrubbed[key] = "[REDACTED]";
        } else {
          scrubbed[key] = scrub(val[key]);
        }
      }
    }
    return scrubbed;
  }

  if (typeof val === "string") {
    // Redact string secrets matching token schemas
    if (
      val.startsWith("eyJhbGciOi") || // JWT header block
      val.startsWith("sk_test_") ||    // Clerk secret key
      val.startsWith("pk_test_") ||    // Clerk publishable key
      val.startsWith("whsec_")         // Clerk webhook secret
    ) {
      return "[REDACTED]";
    }
  }

  return val;
}

class NexusLogger {
  private isProduction = process.env.NODE_ENV === "production";

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const scrubbedContext = context ? scrub(context) : undefined;

    const logPayload = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(scrubbedContext && { context: scrubbedContext }),
    };

    if (this.isProduction) {
      // In production, stream structured JSON to centralized logs
      console.log(JSON.stringify(logPayload));
    } else {
      // In development, apply readable colors
      const colorMap = {
        info: "\x1b[32m",  // Green
        warn: "\x1b[33m",  // Yellow
        error: "\x1b[31m", // Red
        debug: "\x1b[36m", // Cyan
      };
      const reset = "\x1b[0m";
      const color = colorMap[level] || "";
      const ctxStr = scrubbedContext ? ` | Context: ${JSON.stringify(scrubbedContext)}` : "";
      
      console.log(`${color}[${logPayload.level}]${reset} [${timestamp}] ${message}${ctxStr}`);
    }
  }

  info(message: string, context?: LogContext) {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext) {
    const errContext = {
      ...(context || {}),
      ...(error && {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
      }),
    };
    this.log("error", message, errContext);
  }

  debug(message: string, context?: LogContext) {
    if (!this.isProduction || process.env.DEBUG === "true") {
      this.log("debug", message, context);
    }
  }
}

export const logger = new NexusLogger();
