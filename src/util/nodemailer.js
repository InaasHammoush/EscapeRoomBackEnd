/**
 * @fileoverview Email service using Nodemailer
 * Handles sending emails through Gmail SMTP service with proper error handling,
 * logging, and templating capabilities.
 */
import nodemailer from "nodemailer";
import { securityConfig } from "../config/security.js";
import log from "./log.js";

// TODO: Change to production email

/**
 * Create email transport configuration based on environment
 * @type {nodemailer.Transporter}
 */
const transporter = nodemailer.createTransport({
    service: "Gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
    // Adds additional security and connection details
    tls: {
        rejectUnauthorized: true, // Rejects unauthorized TLS/SSL certs
        minVersion: "TLSv1.2", // Minimum TLS version for security
    },
    // For usage tracking and troubleshooting
    pool: true, // Use pooled connections for better performance
    maxConnections: 5, // Limit number of simultaneous connections
    rateDelta: 20000, // Time between rate limit windows
    rateLimit: 3, // Max messages per rateDelta
});

// Verify connection configuration on startup
transporter.verify((error) => {
  if (error) {
    log.error("Email transport verification failed", {
      error: error.message,
      errorCode: error.code,
      errorResponse: error.response,
      service: "Gmail",
      hasGmailUser: !!process.env.GMAIL_USER,
      hasGmailPassword: !!process.env.GMAIL_PASSWORD,
      gmailUserValue: process.env.GMAIL_USER?.substring(0, 10) + '***',
    });
  } else {
    log.info("Email service ready to send messages", {
      gmailUser: process.env.GMAIL_USER,
    });
  }
});

/**
 * Email service for sending various types of emails
 */
/**
 * Email service utility providing methods to send various types of emails
 * using nodemailer.
 * @namespace emailService
 *
 * @property {Function} sendEmail - Core function to send emails with customizable content
 * @property {Function} sendVerificationEmail - Sends account verification emails
 * @property {Function} sendPasswordResetEmail - Sends password reset emails
 * @property {Function} sendPasswordChangedEmail - Notifies users about password changes
 * @property {Function} sendWelcomeEmail - Sends welcome emails to new users
 *
 * @example
 * // Send a simple email
 * await emailService.sendEmail('user@example.com', 'Hello', '<p>Welcome!</p>');
 *
 * // Send a verification email
 * await emailService.sendVerificationEmail('user@example.com', 'token123');
 */
const emailService = {
	/**
	 * Sends an email with specified content
	 * @param {string} email - Recipient email address
	 * @param {string} subject - Email subject line
	 * @param {string} content - HTML content of the email
	 * @param {Object} [options] - Additional options (cc, bcc, attachments)
	 * @returns {Promise<Object>} Information about the sent email
	 * @throws {AppError} If email sending fails
	 */
	async sendEmail(email, subject, content, options = {}) {
		try {
			log.debug(`Preparing to send email to ${email}`, { subject });

			// Validate inputs
			if (!email || !subject || !content) {
				throw new Error("Missing required email parameters");
			}

			const mailOptions = {
				from: `"EscapeRoom" <${process.env.GMAIL_USER}>`,
				to: email,
				subject,
				html: content,
				...options, // Include cc, bcc, attachments if provided
			};

			const info = await transporter.sendMail(mailOptions);

			log.info(`Email sent successfully`, {
				messageId: info.messageId,
				recipient: email,
				subject,
			});

			return info;
		} catch (error) {
			log.error(`Error sending email to ${email}`, {
				error: error.message,
				errorCode: error.code,
				errorResponse: error.response,
				stack: error.stack,
				subject,
				hasGmailUser: !!process.env.GMAIL_USER,
				hasGmailPassword: !!process.env.GMAIL_PASSWORD,
			});

			throw error; // Re-throw to handle in calling function
		}
	},

	/**
	 * Sends a verification email to a user
	 * @param {Object} user - User object with email and verifyToken
	 * @returns {Promise<Object>} Email send information
	 */
	async sendVerificationEmail(email, verificationToken) {
		try {
			log.debug(`Sending verification email to ${email}`);

			const verificationLink = `${securityConfig.frontendUrl}/verify-email/${verificationToken}`;

			const content = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to our EscapeRoom Game!</h2>
          <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
          <p>
            <a href="${verificationLink}" 
               style="padding: 10px 15px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">
              Verify Email
            </a>
          </p>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <p>Best regards,<br>EscapeRoom Team</p>
        </div>
      `;

			return await this.sendEmail(
				email,
				"Verify Your EscapeRoom Account",
				content,
				errorCode: error.code,
				errorResponse: error.response,
				stack: error.stack,
			);
		} catch (error) {
			log.error(`Failed to send verification email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	},

    async sendWelcomeEmail(email) {
		try {
			log.debug(`Sending welcome email to ${email}`);

			const content = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		  <h2>Welcome to EscapeRoom!</h2>
		  <p>Thank you for registering and verifying your email address. We're excited to have you on board.</p>
		  <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
		  <p>Best regards,<br>The EscapeRoom Team</p>
		</div>
	  `;

			return await this.sendEmail(email, "Welcome to EscapeRoom", content);
		} catch (error) {
			log.error(`Failed to send welcome email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	},

	/**
	 * sends a password changed notification email to a user
	 * @param {String} email - Recipient email address
	 * @returns {Promise<Object>} Email send information
	 * @throws {Error} If email sending fails
	 * @throws {Error} If required parameters are missing
	 */
	async sendPasswordChangedEmail(email) {
		try{
			log.debug(`Sending password changed notification email to ${email}`);

			const content = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		  <h2>Password Changed Successfully</h2>
		  <p>This is a confirmation that the password for your account has just been changed.</p>
		  <p>If you did not make this change, please contact our support team immediately.</p>
		  <p>Best regards,<br>The EscapeRoom Team</p>
		</div>
	  `;

	  		return await this.sendEmail(email, "Your EscapeRoom Password Has Been Changed", content);
		}
		catch (error) {
			log.error(`Failed to send password changed email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	},

	/**
	 * Sends a password reset email to a user
	 * @param {String} email - Recipient email address
	 * @param {String} resetToken - Password reset token
	 * @returns {Promise<Object>} Email send information
	 * @throws {Error} If email sending fails
	 * @throws {Error} If required parameters are missing
	 */
	async sendResetPasswordEmail(email, resetToken) {
		try {
			log.debug(`Sending password reset email to ${email}`);

			const resetLink = `${securityConfig.frontendUrl}/reset-password/${resetToken}`;

			const content = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset Your Password</h2>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <p>
            <a href="${resetLink}" 
               style="padding: 10px 15px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">
              Reset Password
            </a>
          </p>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${resetLink}</p>
          <p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          <p>Best regards,<br>The EscapeRoom Team</p>
        </div>
      `;
			return await this.sendEmail(
				email,
				"EscapeRoom Password Reset Request",
				content,
			);

		} catch (error) {
			log.error(`Failed to send password reset email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	},

	async sendAccountDeletionEmail(email) {
		try {
			log.debug(`Sending account deletion email to ${email}`);
			const content = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		  <h2>Account Deletion Confirmation</h2>
		  <p>Your account has been successfully deleted from EscapeRoom.</p>
		  <p>We're sorry to see you go. If you change your mind, you have 30 days to recover your account. after that you're always welcome to register again.</p>
		  <p>To recover your account please click <a href="${securityConfig.frontendUrl}/recover-account">here</a>.</p>
		  <p>Thank you for being a part of our community.</p> 
		  <p>If you have any questions or concerns, please contact our support team.</p>
		  <p>Best regards,<br>The EscapeRoom Team</p>
		</div>
	  `;

			return await this.sendEmail(email, "Account Deletion Confirmation", content);
		} catch (error) {
			log.error(`Failed to send account deletion email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	},

	async sendAccountRecoveryEmail(email) {
		try {
			log.debug(`Sending account recovery email to ${email}`);
			const content = `
		<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		  <h2>Account Recovery Successful</h2>
		  <p>Your EscapeRoom account has been successfully recovered.</p>
		  <p>You can now log in using your previous credentials.</p>
		  <p>If you have any questions or need assistance, please contact our support team.</p>
		  <p>Best regards,<br>The EscapeRoom Team</p>
		</div>
	  `;

	  		return await this.sendEmail(email, "Account Deletion Confirmation", content);
		} catch (error) {
			log.error(`Failed to send account deletion email to ${email}`, {
				error: error.message,
			});
			throw error; // Re-throw to handle in controller
		}
	}

};

export default emailService;
