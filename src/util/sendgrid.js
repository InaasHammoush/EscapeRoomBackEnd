import sgMail from '@sendgrid/mail';
import { securityConfig } from '../config/security.js';
import log from '../util/log.js';

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Email service using SendGrid
 */
const emailService = {
  /**
   * Sends an email with specified content
   * @param {string} email - Recipient email address
   * @param {string} subject - Email subject line
   * @param {string} content - HTML content of the email
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Information about the sent email
   */
  async sendEmail(email, subject, content, options = {}) {
    try {
      log.debug(`Preparing to send email to ${email}`, { subject });

      // Validate inputs
      if (!email || !subject || !content) {
        throw new Error("Missing required email parameters");
      }

      const msg = {
        to: email,
        from: {
          email: process.env.FROM_EMAIL || 'noreply@escaperoom.com',
          name: 'EscapeRoom'
        },
        subject,
        html: content,
        ...options,
      };

      const result = await sgMail.send(msg);

      log.info(`Email sent successfully`, {
        messageId: result[0]?.headers?.['x-message-id'],
        recipient: email,
        subject,
      });

      return result;
    } catch (error) {
      log.error(`Error sending email to ${email}`, {
        error: error.message,
        errorCode: error.code,
        errorResponse: error.response?.body,
        stack: error.stack,
        subject,
        hasSendGridKey: !!process.env.SENDGRID_API_KEY,
      });

      throw error;
    }
  },

  /**
   * Sends a verification email to a user
   * @param {string} email - Recipient email address
   * @param {string} verificationToken - Verification token
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
      );
    } catch (error) {
      log.error(`Failed to send verification email to ${email}`, {
        error: error.message,
        errorCode: error.code,
        errorResponse: error.response?.body,
        stack: error.stack,
      });
      throw error;
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
      throw error;
    }
  },

  async sendPasswordChangedEmail(email) {
    try {
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
    } catch (error) {
      log.error(`Failed to send password changed email to ${email}`, {
        error: error.message,
      });
      throw error;
    }
  },

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
      throw error;
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
      throw error;
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
      throw error;
    }
  }
};

export default emailService;