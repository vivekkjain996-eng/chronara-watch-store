// Real server-side admin auth: bcrypt password check + signed JWT session token.
// Zero-config local dev: falls back to the same demo password as before ("admin123")
// and a random in-memory JWT secret if no .env is provided. Set ADMIN_PASSWORD_HASH /
// JWT_SECRET in .env to override.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const DEFAULT_ADMIN_PASSWORD = "admin123";
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL = "12h";

// Hash computed once at startup - either from ADMIN_PASSWORD_HASH (a bcrypt hash you
// generate and put in .env) or from the plaintext DEFAULT_ADMIN_PASSWORD for local dev.
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);

if (!process.env.JWT_SECRET || !process.env.ADMIN_PASSWORD_HASH) {
  console.log(
    "[auth] Running with local-dev defaults (admin password: 'admin123', in-memory JWT secret). " +
    "Set ADMIN_PASSWORD_HASH and JWT_SECRET in .env before deploying anywhere real."
  );
}

function checkAdminPassword(password) {
  return bcrypt.compareSync(String(password || ""), ADMIN_PASSWORD_HASH);
}

function issueAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing admin token" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

// Customer auth: issued after phone+OTP verification at checkout (see server/routes/auth.js
// and server/lib/otp.js). Short-lived - just long enough to finish placing an order.
const CUSTOMER_TOKEN_TTL = "45m";

function issueCustomerToken(phone) {
  return jwt.sign({ role: "customer", phone }, JWT_SECRET, { expiresIn: CUSTOMER_TOKEN_TTL });
}

function readCustomerToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.role === "customer" ? payload.phone : null;
  } catch (e) {
    return null;
  }
}

function requireCustomer(req, res, next) {
  const phone = readCustomerToken(req);
  if (!phone) return res.status(401).json({ error: "Phone verification required" });
  req.customerPhone = phone;
  next();
}

// Like requireCustomer, but doesn't reject the request if there's no (or an invalid) token -
// used by routes that behave a bit better with a known phone but also work without one.
function optionalCustomer(req, res, next) {
  req.customerPhone = readCustomerToken(req);
  next();
}

module.exports = { checkAdminPassword, issueAdminToken, requireAdmin, issueCustomerToken, requireCustomer, optionalCustomer };
