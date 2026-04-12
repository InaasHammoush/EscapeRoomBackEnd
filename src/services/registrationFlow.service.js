export async function createPendingUserAndSendVerificationEmail({
  createUser,
  deletePendingUser,
  sendVerificationEmail,
  email,
  verificationToken,
  verificationEmailFailureMessage = 'Verification email could not be sent. Please try again later.',
  logger = console,
}) {
  const user = await createUser();

  try {
    await sendVerificationEmail(email, verificationToken);
    return user;
  } catch (error) {
    if (user?.id != null) {
      try {
        const deleted = await deletePendingUser(user.id);
        if (!deleted) {
          logger.warn?.(
            `[auth.register] Pending user ${user.id} could not be removed after verification email failure`
          );
        }
      } catch (cleanupError) {
        logger.error?.(
          '[auth.register] Cleanup after failed verification email failed:',
          cleanupError
        );
      }
    }

    throw new Error(verificationEmailFailureMessage, { cause: error });
  }
}
