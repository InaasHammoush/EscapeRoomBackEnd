import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

/**
 * Winston logger configuration module
 *
 * This module configures the application's logging system with multiple output formats,
 * environment-specific log levels, and file rotation for log management.
 *
 * @module logger
 */

/**
 * Define log levels with their priority values
 * Lower numbers represent higher priority levels
 *
 * - error: Critical errors that require immediate attention
 * - warn: Warnings about potential issues or edge cases
 * - info: General application information and notable events
 * - http: HTTP request/response logging
 * - debug: Detailed debugging information
 *
 * @type {Object.<string, number>}
 */
const levels = {
  error: 0, // Critical errors requiring immediate attention
  warn: 1, // Warnings about potential issues
  info: 2, // General application events
  http: 3, // HTTP request/response logging
  debug: 4, // Detailed debugging information
};

/**
 * Determines the appropriate log level based on the environment
 * Uses 'debug' level in development for maximum detail
 * Uses 'http' level in production to reduce verbosity
 *
 * @returns {string} The appropriate log level for the current environment
 */
const level = () => {
  const env = process.env.NODE_ENV || "development";
  return env === "development" ? "debug" : "http";
};

/**
 * Define colors for each log level for visual distinction in console output
 * These colors apply only to console logging and make it easier to identify
 * different types of log messages.
 *
 * @type {Object.<string, string>}
 */
const colors = {
  error: "red", // Critical errors in red for high visibility
  warn: "yellow", // Warnings in yellow as caution indicators
  info: "green", // Normal information in green for positive indication
  http: "magenta", // HTTP logs in magenta to distinguish network activity
  debug: "white", // Debug information in white for readability
};

/**
 * Configure Winston to use the defined colors
 * This links the log levels to their corresponding colors
 */
winston.addColors(colors);

/**
 * Format configuration for console output
 * Includes timestamps, colors, and a custom print format
 *
 * @type {winston.Logform.Format}
 */
const consoleFormat = winston.format.combine(
  // Add ISO timestamp to each log
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),

  // Apply colors to the entire log message
  winston.format.colorize({ all: true }),

  // Custom format for the log message
  winston.format.printf((info) => {
    // Build the basic log message with timestamp and level
    let message = `${info.timestamp} ${info.level}: ${info.message}`;

    // Add component information if available
    if (info.component) {
      message += ` [${info.component}]`;
    }

    // Add request ID for request tracking if available
    if (info.requestId) {
      message += ` (req: ${info.requestId})`;
    }

    // Add user ID for user activity tracking if available
    if (info.userId) {
      message += ` (user: ${info.userId})`;
    }

    return message;
  }),
);

/**
 * Format configuration for file output
 * Uses JSON format for easier parsing and analysis
 *
 * @type {winston.Logform.Format}
 */
const fileFormat = winston.format.combine(
  // Add ISO timestamp to each log entry
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),

  // Convert log to JSON format
  winston.format.json(),
);

/**
 * Configure the transport mechanisms for log output
 * Includes console and file-based outputs with rotation
 *
 * @type {winston.transport[]}
 */
const transports = [
  /**
   * Console transport for immediate feedback during development
   * Shows colored logs with timestamps in the terminal
   */
  new winston.transports.Console({
    format: consoleFormat,
  }),

 
    /**
     * Daily rotate file transport for all log levels
     * Creates new log files daily and compresses old logs
     */
    new winston.transports.DailyRotateFile({
      filename: path.join("logs", "application-%DATE%.log"), // Include date in filename
      datePattern: "YYYY-MM-DD", // Date format for rotation
      zippedArchive: true, // Compress old logs
      maxSize: "20m", // Maximum file size before rotation
      maxFiles: "14d", // Keep logs for 14 days
      format: fileFormat, // Use JSON format for logs
    }),

    /**
     * Daily rotate file transport for error logs only
     * Separates errors into their own files for easier troubleshooting
     */
    new winston.transports.DailyRotateFile({
      filename: path.join("logs", "error-%DATE%.log"), // Include date in filename
      datePattern: "YYYY-MM-DD", // Date format for rotation
      level: "error", // Only log errors
      zippedArchive: true, // Compress old logs
      maxSize: "20m", // Maximum file size before rotation
      maxFiles: "30d", // Keep error logs longer (30 days)
      format: fileFormat, // Use JSON format for logs
    }),
  ] 
/**
 * Create the Winston logger instance with the configured settings
 *
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
  level: level(), // Set level based on environment
  levels, // Use custom log levels
  transports, // Use configured transports
  exitOnError: false, // Don't exit on handled exceptions
  silent: process.env.NODE_ENV === "test", // Silence logs during tests

  /**
   * Default metadata for all logs
   * Provides context for every log entry
   */
  defaultMeta: {
    service: process.env.APP_NAME || "lumis-games", // Service name
    environment: process.env.NODE_ENV || "development", // Environment
  },
});

export default logger;
