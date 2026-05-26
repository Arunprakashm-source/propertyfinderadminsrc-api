const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

const {
  MAIL_HOST,
  MAIL_PORT,
  MAIL_SECURE,
  MAIL_USER,
  MAIL_PASS,
  MAIL_FROM,
  MAIL_FROM_NAME,
} = process.env;

const ensureMailConfig = () => {
  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS || !MAIL_FROM) {
    logger.error('Email configuration is missing', {
      MAIL_HOST: Boolean(MAIL_HOST),
      MAIL_PORT: Boolean(MAIL_PORT),
      MAIL_SECURE: Boolean(MAIL_SECURE),
      MAIL_USER: Boolean(MAIL_USER),
      MAIL_PASS: Boolean(MAIL_PASS),
      MAIL_FROM: Boolean(MAIL_FROM),
      MAIL_FROM_NAME: Boolean(MAIL_FROM_NAME),
    });
    throw new Error('Email configuration not set');
  }
};

const transporter = (() => {
  try {
    ensureMailConfig();
    return nodemailer.createTransport({
      host: MAIL_HOST,
      port: Number(MAIL_PORT),
      secure: MAIL_SECURE === 'true' || MAIL_SECURE === true,
      auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
      },
    });
  } catch (error) {
    logger.error('Failed to initialize mail transporter', { error: error.message });
    throw error;
  }
})();

const baseTemplate = (title, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f6f8fb; margin: 0; padding: 0; color: #1f2937; }
    .container { max-width: 640px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04); }
    .header { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 12px; }
    .paragraph { font-size: 15px; line-height: 1.6; margin: 0 0 14px; }
    .cta { display: inline-block; margin-top: 14px; padding: 12px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .muted { color: #6b7280; font-size: 13px; margin-top: 18px; }
    .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; background: #f9fafb; margin: 12px 0; }
  </style>
</head>
<body>
  <div style="padding: 24px;">
    <div class="container">
      ${bodyContent}
      <p class="muted">If you did not request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
`;

const sendEmail = async (to, subject, html) => {
  ensureMailConfig();
  const fromName = MAIL_FROM_NAME ? `${MAIL_FROM_NAME} <${MAIL_FROM}>` : MAIL_FROM;
  try {
    const info = await transporter.sendMail({
      from: fromName,
      to,
      subject,
      html,
    });
    logger.info('Email sent', { to, messageId: info.messageId, subject });
    return info;
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error: error.message });
    throw new Error('Email sending failed');
  }
};

const sendVerificationEmail = async (to, otp, name = 'there') => {
  const html = baseTemplate(
    'Verify your email',
    `
    <div class="header">Verify your email</div>
    <p class="paragraph">Hi ${name},</p>
    <p class="paragraph">Use the verification code below to confirm your email address. This code expires soon.</p>
    <div class="card" style="text-align:center;">
      <div style="font-size: 28px; letter-spacing: 4px; font-weight: 700; color: #111827;">${otp}</div>
    </div>
    <p class="paragraph">If you did not initiate this request, please disregard this email.</p>
    `
  );
  return sendEmail(to, 'Verify your email', html);
};

const sendWelcomeEmail = async (to, name = 'there', userType = 'member') => {
  const html = baseTemplate(
    'Welcome to Propertyfinder',
    `
    <div class="header">Welcome aboard, ${name}!</div>
    <p class="paragraph">We are excited to have you join as a valued ${userType}. Your account is set up and ready to go.</p>
    <p class="paragraph">Explore listings, manage your profile, and stay ahead with the latest updates tailored to you.</p>
    <a class="cta" href="#">Go to your dashboard</a>
    `
  );
  return sendEmail(to, 'Welcome to Propertyfinder', html);
};

const sendPasswordResetEmail = async (to, resetToken, name = 'there') => {
  const resetLink = resetToken.startsWith('http')
    ? resetToken
    : `https://propertyfinder/reset-password?token=${resetToken}`;

  const html = baseTemplate(
    'Reset your password',
    `
    <div class="header">Reset your password</div>
    <p class="paragraph">Hi ${name},</p>
    <p class="paragraph">We received a request to reset your password. Click the button below to proceed.</p>
    <a class="cta" href="${resetLink}">Reset Password</a>
    <p class="paragraph">If the button does not work, copy and paste this link into your browser:</p>
    <div class="card" style="word-break: break-all;">${resetLink}</div>
    `
  );
  return sendEmail(to, 'Reset your password', html);
};

const sendInvitationEmail = async (to, name, invitationLink, invitedBy, role = 'member') => {
  const safeLink = invitationLink || '#';
  const html = baseTemplate(
    'You are invited to join Propertyfinder',
    `
    <div class="header">Invitation to join</div>
    <p class="paragraph">Hi ${name || 'there'},</p>
    <p class="paragraph">${invitedBy || 'A colleague'} has invited you to join Propertyfinder as ${role}. Click the button below to accept and set up your account.</p>
    <a class="cta" href="${safeLink}">Accept Invitation</a>
    <p class="paragraph">If the button does not work, copy and paste this link into your browser:</p>
    <div class="card" style="word-break: break-all;">${safeLink}</div>
    `
  );
  return sendEmail(to, 'Invitation to join Propertyfinder', html);
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
};

