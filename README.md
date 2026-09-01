# Chronara — Watch Store Demo

A free, static demo e-commerce website for a fictional watch brand, "Chronara" — inspired by the general
look and feel of luxury watch retailers, but built entirely from original code and illustrations (no copied
branding, photos, or text from any real company).

## What's included

- Homepage, shop page with category/price filters, product detail pages, cart, checkout (demo only), and
  order confirmation.
- 8 sample watches with original SVG illustrations.
- A working shopping cart using `localStorage` (per-browser, persists between visits).
- A real backend: the product catalog and customer orders live in a local SQLite database, shared across
  every browser/device that hits the server — so an admin edit or a customer order is visible everywhere,
  not just in the browser that made it.
- An admin panel (real server-side login: bcrypt-hashed password + JWT session) to add/edit/delete watches
  and view every customer's orders with full details.
- Fully responsive layout.

## Tech stack

Frontend: plain HTML, CSS, and JavaScript. No frameworks, no build step.
Backend: Node.js + Express + SQLite (`better-sqlite3`). No external services, no paid tiers.

## Running it locally

```
npm install
npm start
```

Then visit http://localhost:8899

The database file is created automatically on first run at `data/chronara.db`, seeded with the 8 demo
watches. The admin password defaults to `admin123` for local dev — see `.env.example` to set a real one.

## Cost

$0. No hosting, no paid APIs, no payment gateway. The checkout flow is a visual demo only — it does not
process any real payment.

## Deploying for free

This is a real Node.js server (not a static site), so it needs a host that runs a persistent Node
process — GitHub Pages/Netlify/Vercel's free tiers won't work as-is (they're static/serverless).
[Render](https://render.com)'s free web service tier does, at $0, no credit card required:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. On [render.com](https://render.com), sign up free, then **New +** → **Blueprint**, and point it at
   this GitHub repo — it will auto-detect `render.yaml` (build: `npm install`, start: `npm start`).
   Or without the Blueprint: **New +** → **Web Service**, same build/start commands, **Free** plan.
3. Deploy. Render gives you a free `https://<your-service>.onrender.com` URL.

**Known limitation of the free tier:** Render's free plan has no persistent disk — the SQLite database
(`data/chronara.db`) and any uploaded product photos/videos (`uploads/`) reset back to the 8 seed
watches on every redeploy or after the service spins down from inactivity and restarts. Fine for
sharing a working demo link; if you need your data (admin-added products, real orders) to survive
redeploys, look at Fly.io's free persistent volume, or move the database/uploads to an external
free service (e.g. Turso for the DB, Cloudinary for images) so they live outside the app server.
