# Chronara — Watch Store Demo

A free, static demo e-commerce website for a fictional watch brand, "Chronara" — inspired by the general
look and feel of luxury watch retailers, but built entirely from original code and illustrations (no copied
branding, photos, or text from any real company).

## What's included

- Homepage, shop page with category/price filters, product detail pages, cart, checkout (demo only), and
  order confirmation.
- 8 sample watches with original SVG illustrations.
- A working shopping cart using `localStorage` (persists between visits, no backend needed).
- Fully responsive layout.

## Tech stack

Plain HTML, CSS, and JavaScript. No frameworks, no build step, no npm install required.

## Running it locally

Just open `index.html` directly in a browser, **or** run the included tiny local server (needed only if
your browser blocks `fetch`/relative paths from `file://` URLs):

```
node serve.js
```

Then visit http://localhost:8899

## Cost

$0. No hosting, no paid APIs, no payment gateway. The checkout flow is a visual demo only — it does not
process any real payment or store any real order.

## Deploying for free

This site can be hosted for free on GitHub Pages, Netlify, or Vercel's free tiers — see the project chat
history for exact steps.
