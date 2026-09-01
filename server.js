// Chronara server: serves the static frontend and the /api backend (Express + SQLite).
// Zero external services, zero paid tiers - run with `npm start`.
require("dotenv").config();
const path = require("path");
const express = require("express");

const productsRouter = require("./server/routes/products");
const ordersRouter = require("./server/routes/orders");
const adminAuthRouter = require("./server/routes/admin");
const promosRouter = require("./server/routes/promos");
const customerAuthRouter = require("./server/routes/auth");

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(port, () => console.log("Serving on http://localhost:" + port));
