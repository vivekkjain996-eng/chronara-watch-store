// Chronara server: serves the static frontend and the /api backend (Express + SQLite).
// Zero external services, zero paid tiers - run with `npm start`.
require("dotenv").config();
const path = require("path");
const express = require("express");

const { init } = require("./server/db");
const productsRouter = require("./server/routes/products");
const ordersRouter = require("./server/routes/orders");
const adminAuthRouter = require("./server/routes/admin");
const promosRouter = require("./server/routes/promos");
const customerAuthRouter = require("./server/routes/auth");
const paymentRouter = require("./server/routes/payment");
const reviewsRouter = require("./server/routes/reviews");

const app = express();
const port = process.env.PORT || 8899;

app.use(express.json());

// The frontend (html/css/js/images/uploads) lives at the repo root alongside the backend
// source, so block the backend-only paths before falling through to static serving -
// otherwise server/*.js, package.json etc. would be downloadable over HTTP too.
const BLOCKED_STATIC_PREFIXES = ["/server/", "/node_modules/", "/data/"];
const BLOCKED_STATIC_FILES = ["/server.js", "/package.json", "/package-lock.json"];
app.use((req, res, next) => {
  if (BLOCKED_STATIC_FILES.includes(req.path) || BLOCKED_STATIC_PREFIXES.some((p) => req.path.startsWith(p))) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(__dirname));

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminAuthRouter);
app.use("/api/promos", promosRouter);
app.use("/api/auth", customerAuthRouter);
app.use("/api/payment-settings", paymentRouter);
app.use("/api/reviews", reviewsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  // Cloudinary SDK errors carry an http_code (e.g. 400 "Unsupported video format or file") -
  // surface that instead of a generic 500 so admin gets an actionable message.
  const status = Number.isInteger(err.http_code) ? err.http_code : 500;
  res.status(status).json({ error: err.message || "Server error" });
});

init()
  .then(() => {
    app.listen(port, () => console.log("Serving on http://localhost:" + port));
  })
  .catch((err) => {
    console.error("Failed to initialize the database:", err);
    process.exit(1);
  });
