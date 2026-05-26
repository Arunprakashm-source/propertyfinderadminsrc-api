const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const getOtpExpireMinutes = () => {
  const minutes = Number(process.env.OTP_EXPIRE_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
};

const getSaltRounds = () => {
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS);
  return Number.isInteger(rounds) && rounds > 0 ? rounds : 10;
};

const generateOTP = () => {
  const otp = crypto.randomInt(0, 1_000_000);
  return otp.toString().padStart(6, '0');
};

const hashOTP = async (otp) => {
  const normalized = String(otp || '');
  return bcrypt.hash(normalized, getSaltRounds());
};

const verifyOTP = async (otp, hashedOTP) => {
  if (!otp || !hashedOTP) {
    return false;
  }
  const normalized = String(otp);
  return bcrypt.compare(normalized, hashedOTP);
};

const getOTPExpiry = () => {
  const minutes = getOtpExpireMinutes();
  return new Date(Date.now() + minutes * 60 * 1000);
};

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiry,
};

