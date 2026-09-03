// Admin email alerts (new UPI/UTR submissions) via Resend. Zero-config fallback matching every
// other integration in this project (admin auth, Turso, Cloudinary): without RESEND_API_KEY /
// ADMIN_EMAIL set, this just logs instead of sending - local dev keeps working with no setup.
//
// Free-tier constraint (no verified domain): Resend only reliably delivers, from the shared
// onboarding@resend.dev sender, to the email address the Resend account itself was created
// with - so ADMIN_EMAIL must be that address. Customer-facing email isn't attempted here; see
// the "My Orders" page for customer-side payment status instead.
const configured = !!(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL);

let resendClient = null;
if (configured) {
  const { Resend } = require("resend");
  resendClient = new Resend(process.env.RESEND_API_KEY);
  console.log("[mail] Admin email alerts enabled -> " + process.env.ADMIN_EMAIL);
} else {
  console.log("[mail] RESEND_API_KEY/ADMIN_EMAIL not set - admin alerts will just be logged, not emailed.");
}

async function sendAdminAlert(subject, html) {
  if (!configured) {
    console.log(`[mail] (not sent - no email configured) ${subject}\n${html}`);
    return;
  }
  try {
    await resendClient.emails.send({
      from: "Chronara <onboarding@resend.dev>",
      to: process.env.ADMIN_EMAIL,
      subject,
      html
    });
  } catch (e) {
    console.error("[mail] Failed to send admin alert:", e.message);
  }
}

module.exports = { sendAdminAlert };
