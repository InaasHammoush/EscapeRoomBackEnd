import logger from "../config/logger.js";

// Wrapper for consistent formatting
/**
 * Logger utility module for application-wide logging.
 *
 * @module log
 * @exports {Object} Default export containing logging methods
 *
 * @property {Function} error - Logs error messages with optional metadata
 * @property {Function} warn - Logs warning messages with optional metadata
 * @property {Function} info - Logs info messages with optional metadata
 * @property {Function} http - Logs HTTP-related messages with optional metadata
 * @property {Function} debug - Logs debug messages with optional metadata
 *
 * @requires logger - An external logger instance (not defined in this file)
 *
 * @example
 * import log from '../util/log.js';
 *
 * // Log an error message
 * log.error('Failed to connect to database', { connectionId: 123 });
 *
 * // Log an informational message
 * log.info('User logged in', { userId: 456 });
 */
export default {
  error: (message, metadata = {}) => {
    logger.error(`${message}`, { metadata });
  },

  warn: (message, metadata = {}) => {
    logger.warn(`${message}`, { metadata });
  },

  info: (message, metadata = {}) => {
    logger.info(`${message}`, { metadata });
  },

  http: (message, metadata = {}) => {
    logger.http(`${message}`, { metadata });
  },

  debug: (message, metadata = {}) => {
    logger.debug(`${message}`, { metadata });
  },
};
