// Global UPI payment settings (one QR code + UPI ID, admin-managed) shown at checkout when a
// customer picks UPI as their payment method. See server/routes/orders.js for the UTR
// submission/verification flow this feeds into.
const express = require("express");
const multer = require("multer");
const { db } = require("../db");
const { requireAdmin } = require("../auth");
const { storeMedia, deleteMedia } = require("../lib/media");
const asyncHandler = require("../lib/asyncHandler");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("QR code must be an image file"));
    cb(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.single("qrCode")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  });
}

router.get("/", asyncHandler(async (req, res) => {
  const settings = await db.get("SELECT upi_id, qr_code_url FROM payment_settings WHERE id = 1");
  res.json(settings || { upi_id: null, qr_code_url: null });
}));

router.put("/", requireAdmin, handleUpload, asyncHandler(async (req, res) => {
  const existing = await db.get("SELECT * FROM payment_settings WHERE id = 1");
  const upiId = req.body.upiId !== undefined ? req.body.upiId.trim() : (existing ? existing.upi_id : null);

  let qrCodeUrl = existing ? existing.qr_code_url : null;
  let qrCodePublicId = existing ? existing.qr_code_public_id : null;

  if (req.file) {
    if (existing && existing.qr_code_public_id) {
      await deleteMedia({ public_id: existing.qr_code_public_id, type: "image", url: existing.qr_code_url }, "payment-settings");
    }
    const uploaded = await storeMedia("payment-settings", req.file);
    qrCodeUrl = uploaded.url;
    qrCodePublicId = uploaded.publicId;
  }

  if (existing) {
    await db.run(
      "UPDATE payment_settings SET upi_id = ?, qr_code_url = ?, qr_code_public_id = ? WHERE id = 1",
      [upiId, qrCodeUrl, qrCodePublicId]
    );
  } else {
    await db.run(
      "INSERT INTO payment_settings (id, upi_id, qr_code_url, qr_code_public_id) VALUES (1, ?, ?, ?)",
      [upiId, qrCodeUrl, qrCodePublicId]
    );
  }

  res.json(await db.get("SELECT upi_id, qr_code_url FROM payment_settings WHERE id = 1"));
}));

module.exports = router;
