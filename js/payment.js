// UPI payment settings (QR code + UPI ID) - shown at checkout, managed by admin. Mirrors the
// js/promos.js pattern.

async function getPaymentSettings() {
  return apiGet("/api/payment-settings");
}

// formData: optional "upiId" text field, optional "qrCode" image file.
async function savePaymentSettings(formData) {
  return apiUpload("PUT", "/api/payment-settings", formData);
}
