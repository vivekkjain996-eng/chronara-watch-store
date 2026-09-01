// Customer phone+OTP login, required at checkout (see server/routes/auth.js). OTP delivery
// is simulated for this demo - no real SMS provider - the code is returned directly by the
// API and shown on screen instead of being texted.
const CUSTOMER_PHONE_KEY = "chronara_customer_phone";

async function requestOtp(phone) {
  return apiPost("/api/auth/otp/request", { phone });
}

async function verifyOtpCode(phone, otp) {
  const result = await apiPost("/api/auth/otp/verify", { phone, otp });
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, result.token);
  sessionStorage.setItem(CUSTOMER_PHONE_KEY, result.phone);
  return result;
}

function isPhoneVerified() {
  return !!getCustomerToken();
}

function getVerifiedPhone() {
  return sessionStorage.getItem(CUSTOMER_PHONE_KEY);
}
