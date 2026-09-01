// Phone + OTP login for customers, required at checkout (see server/routes/orders.js).
// OTP delivery is simulated - see server/lib/otp.js for why.
const express = require("express");
const { generateOtp, verifyOtp } = require("../lib/otp");
const { issueCustomerToken } = require("../auth");

const router = express.Router();

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

router.post("/otp/request", (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (phone.length !== 10) {
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
  }
  const otp = generateOtp(phone);
  res.json({ otp, message: "Demo mode - no real SMS sent. Use the code above." });
});

router.post("/otp/verify", (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const ok = verifyOtp(phone, req.body.otp);
  if (!ok) return res.status(400).json({ error: "Incorrect or expired OTP" });
  res.json({ token: issueCustomerToken(phone), phone });
});

module.exports = router;
