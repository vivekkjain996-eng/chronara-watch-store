// Simulated OTP store for the Chronara demo - no real SMS provider is wired in (that would
// require a paid third-party account). Codes are generated here and handed straight back
// in the API response so the flow can be tested end-to-end for free. In-memory is fine for
// a local demo; codes are short-lived and don't need to survive a server restart.
const OTP_TTL_MS = 5 * 60 * 1000;
const otps = new Map(); // phone -> { code, expiresAt }

function generateOtp(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otps.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });
  console.log(`[otp] ${phone}: ${code} (demo mode - not actually sent via SMS)`);
  return code;
}

function verifyOtp(phone, code) {
  const entry = otps.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otps.delete(phone);
    return false;
  }
  const match = entry.code === String(code || "");
  if (match) otps.delete(phone); // one-time use
  return match;
}

module.exports = { generateOtp, verifyOtp };
