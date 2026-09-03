// Customer phone+OTP login/account (see server/routes/auth.js). OTP delivery is simulated for
// this demo - no real SMS provider - the code is returned directly by the API and shown on
// screen instead of being texted. Logging in is a persistent account session (localStorage,
// 30 days server-side - see server/auth.js), not scoped to one tab/visit.
const CUSTOMER_PHONE_KEY = "chronara_customer_phone";

async function requestOtp(phone) {
  return apiPost("/api/auth/otp/request", { phone });
}

async function verifyOtpCode(phone, otp) {
  const result = await apiPost("/api/auth/otp/verify", { phone, otp });
  localStorage.setItem(CUSTOMER_TOKEN_KEY, result.token);
  localStorage.setItem(CUSTOMER_PHONE_KEY, result.phone);
  return result;
}

function logout() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_PHONE_KEY);
}

function isPhoneVerified() {
  return !!getCustomerToken();
}

function getVerifiedPhone() {
  return localStorage.getItem(CUSTOMER_PHONE_KEY);
}

// Points the header's Account icon at login.html (logged out) or orders.html (logged in) -
// called once from js/app.js's DOMContentLoaded handler on every customer page.
function initAccountLink() {
  const link = document.getElementById("header-account-link");
  if (!link) return;
  const label = link.querySelector(".label");

  if (isPhoneVerified()) {
    link.href = "orders.html";
    if (label) label.textContent = "Account";
  } else {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    link.href = "login.html?redirect=" + encodeURIComponent(currentPage);
    if (label) label.textContent = "Log In";
  }
}
