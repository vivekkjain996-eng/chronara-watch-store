// Shared UI logic: rendering product cards, filters, product detail, cart page.

function productCardHTML(p) {
  return `
    <div class="product-card">
      <a href="product.html?id=${p.id}">
        <div class="product-thumb"><img src="${p.image}" alt="${p.name}"></div>
      </a>
      <div class="product-info">
        <span class="product-category">${p.category}</span>
        <h3><a href="product.html?id=${p.id}">${p.name}</a></h3>
        <div class="strap">${p.strap} strap</div>
        <div class="product-price">${formatPrice(p.price)}</div>
        <div class="product-card-actions">
          <button class="btn btn-outline add-to-cart-btn" data-id="${p.id}" style="color:#0d1b2a;border-color:#0d1b2a;">Add to Cart</button>
          <button class="btn btn-dark buy-now-btn" data-id="${p.id}">Buy Now</button>
        </div>
      </div>
    </div>`;
}

function renderProducts(containerId, list) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = list.length
    ? list.map(productCardHTML).join("")
    : `<p style="grid-column:1/-1;text-align:center;color:#6b6b6b;padding:40px 0;">No watches match these filters.</p>`;
  wireAddToCartButtons(el);
  wireBuyNowButtons(el);
}

function wireAddToCartButtons(scope) {
  scope.querySelectorAll(".add-to-cart-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.id, 1);
      const original = btn.textContent;
      btn.textContent = "Added ✓";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
    });
  });
}

// Buy Now = add this one item to the cart, then skip straight to checkout (whatever else is
// already in the cart checks out alongside it, same as any other add-to-cart + checkout flow).
function wireBuyNowButtons(scope) {
  scope.querySelectorAll(".buy-now-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.id, 1);
      window.location.href = "checkout.html";
    });
  });
}

/* ---------- Shop page with filters ---------- */
// applyFilters is deliberately at module scope (not nested inside initShopPage) so
// refreshPageProductViews() can re-run it after PRODUCTS changes without re-binding
// the filter checkboxes' event listeners a second time.
function shopApplyFilters() {
  if (!document.getElementById("product-grid")) return;
  const checkedCats = Array.from(document.querySelectorAll(".filter-category:checked")).map(c => c.value);
  const maxPrice = document.getElementById("price-range")
    ? Number(document.getElementById("price-range").value)
    : Infinity;

  let list = PRODUCTS.filter(p => checkedCats.length === 0 || checkedCats.includes(p.category));
  list = list.filter(p => p.price <= maxPrice);

  renderProducts("product-grid", list);
  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${list.length} watch${list.length === 1 ? "" : "es"}`;
}

function initShopPage() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;

  document.querySelectorAll(".filter-category").forEach(cb => cb.addEventListener("change", shopApplyFilters));
  const priceRange = document.getElementById("price-range");
  if (priceRange) {
    priceRange.addEventListener("input", () => {
      document.getElementById("price-range-value").textContent = formatPrice(Number(priceRange.value));
      shopApplyFilters();
    });
  }

  // Pre-select category from URL, e.g. shop.html?category=women
  const urlCategory = new URLSearchParams(window.location.search).get("category");
  if (urlCategory) {
    const box = document.querySelector(`.filter-category[value="${urlCategory}"]`);
    if (box) box.checked = true;
  }

  shopApplyFilters();
}

/* ---------- Product detail page ---------- */
async function initProductDetailPage() {
  const root = document.getElementById("product-detail-root");
  if (!root) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const product = getProductById(id);

  if (!product) {
    root.innerHTML = `<div class="empty-state"><h3>Watch not found</h3><p>The item you're looking for doesn't exist.</p><br><a class="btn btn-dark" href="shop.html">Back to Shop</a></div>`;
    return;
  }

  // The list endpoint (already loaded into PRODUCTS) only has the cover image - fetch the
  // full record for the photo/video gallery. Seed products have no extra media, so they
  // fall back to the plain single-image layout below, unchanged from before.
  let media = [];
  try {
    const full = await fetchProductWithMedia(product.id);
    media = full.media || [];
  } catch (e) {
    media = [];
  }

  document.title = product.name + " - Chronara";
  const galleryHTML = media.length
    ? `
    <div class="detail-image" id="detail-gallery-main"><img id="detail-main-media" src="${product.image}" alt="${product.name}"></div>
    <div class="detail-gallery-thumbs">
      ${media.map((m, i) => m.type === "video"
        ? `<button type="button" class="detail-thumb detail-thumb-video" data-type="video" data-src="${m.url}" title="Video"><span class="play-icon">▶</span></button>`
        : `<button type="button" class="detail-thumb${i === 0 ? " active" : ""}" data-type="image" data-src="${m.url}" title="${m.label || ""}"><img src="${m.url}" alt="${m.label || ""}"></button>`
      ).join("")}
    </div>`
    : `<div class="detail-image"><img src="${product.image}" alt="${product.name}"></div>`;

  root.innerHTML = `
    <div class="detail-gallery">${galleryHTML}</div>
    <div class="detail-info">
      <span class="product-category">${product.category}</span>
      <h1>${product.name}</h1>
      <div class="detail-price">${formatPrice(product.price)}</div>
      <p class="detail-desc">${product.description}</p>
      <div class="detail-meta">
        <div><span>Strap</span><span>${product.strap}</span></div>
        <div><span>Water Resistance</span><span>50m</span></div>
        <div><span>Warranty</span><span>2 Years</span></div>
      </div>
      <div class="qty-row">
        <div class="qty-control">
          <button id="qty-minus" type="button">-</button>
          <input id="qty-input" type="number" value="1" min="1">
          <button id="qty-plus" type="button">+</button>
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-outline" id="detail-add-btn" style="color:#0d1b2a;border-color:#0d1b2a;">Add to Cart</button>
        <button class="btn btn-dark" id="detail-buy-now-btn">Buy Now</button>
        <a class="btn btn-outline" style="color:#0d1b2a;border-color:#0d1b2a;" href="cart.html">View Cart</a>
      </div>
    </div>`;

  root.querySelectorAll(".detail-thumb").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".detail-thumb").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const mainEl = document.getElementById("detail-gallery-main");
      if (btn.dataset.type === "video") {
        mainEl.innerHTML = `<video src="${btn.dataset.src}" controls autoplay></video>`;
      } else {
        mainEl.innerHTML = `<img src="${btn.dataset.src}" alt="${product.name}">`;
      }
    });
  });

  const qtyInput = document.getElementById("qty-input");
  document.getElementById("qty-minus").addEventListener("click", () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value) - 1);
  });
  document.getElementById("qty-plus").addEventListener("click", () => {
    qtyInput.value = Number(qtyInput.value) + 1;
  });
  document.getElementById("detail-add-btn").addEventListener("click", (e) => {
    addToCart(product.id, Number(qtyInput.value));
    e.target.textContent = "Added to Cart ✓";
    setTimeout(() => { e.target.textContent = "Add to Cart"; }, 1500);
  });
  document.getElementById("detail-buy-now-btn").addEventListener("click", () => {
    addToCart(product.id, Number(qtyInput.value));
    window.location.href = "checkout.html";
  });

  // Related products (same category, excluding current)
  const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  if (related.length) {
    renderProducts("related-grid", related);
  }
}

/* ---------- Cart page ---------- */
function initCartPage() {
  const root = document.getElementById("cart-root");
  if (!root) return;

  function render() {
    const cart = getCart();
    if (!cart.length) {
      root.innerHTML = `<div class="empty-state"><h3>Your cart is empty</h3><p>Looks like you haven't added any watches yet.</p><br><a class="btn btn-dark" href="shop.html">Continue Shopping</a></div>`;
      return;
    }

    const rows = cart.map(item => {
      const p = getProductById(item.id);
      if (!p) return "";
      return `
        <tr>
          <td>
            <div class="cart-item-info">
              <img src="${p.image}" alt="${p.name}">
              <div>
                <div class="name">${p.name}</div>
                <div class="strap">${p.strap}</div>
              </div>
            </div>
          </td>
          <td data-label="Price: ">${formatPrice(p.price)}</td>
          <td data-label="Quantity: ">
            <div class="qty-control">
              <button type="button" class="cart-qty-minus" data-id="${p.id}">-</button>
              <input type="number" min="1" value="${item.qty}" class="cart-qty-input" data-id="${p.id}">
              <button type="button" class="cart-qty-plus" data-id="${p.id}">+</button>
            </div>
          </td>
          <td data-label="Subtotal: ">${formatPrice(p.price * item.qty)}</td>
          <td><span class="remove-link" data-id="${p.id}">Remove</span></td>
        </tr>`;
    }).join("");

    const total = cartTotal();
    const shipping = total > 5000 || total === 0 ? 0 : 199;

    root.innerHTML = `
      <table class="cart-table">
        <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="cart-summary">
        <div class="row"><span>Subtotal</span><span>${formatPrice(total)}</span></div>
        <div class="row"><span>Shipping</span><span>${shipping === 0 ? "Free" : formatPrice(shipping)}</span></div>
        <div class="row total"><span>Total</span><span>${formatPrice(total + shipping)}</span></div>
        <a href="checkout.html" class="btn btn-dark btn-block" style="margin-top:18px;">Proceed to Checkout</a>
      </div>`;

    root.querySelectorAll(".remove-link").forEach(el => {
      el.addEventListener("click", () => { removeFromCart(el.dataset.id); render(); });
    });
    root.querySelectorAll(".cart-qty-minus").forEach(btn => {
      btn.addEventListener("click", () => {
        const cart = getCart();
        const item = cart.find(i => i.id === Number(btn.dataset.id));
        updateQty(btn.dataset.id, Math.max(1, (item ? item.qty : 1) - 1));
        render();
      });
    });
    root.querySelectorAll(".cart-qty-plus").forEach(btn => {
      btn.addEventListener("click", () => {
        const cart = getCart();
        const item = cart.find(i => i.id === Number(btn.dataset.id));
        updateQty(btn.dataset.id, (item ? item.qty : 0) + 1);
        render();
      });
    });
    root.querySelectorAll(".cart-qty-input").forEach(inp => {
      inp.addEventListener("change", () => { updateQty(inp.dataset.id, inp.value); render(); });
    });
  }

  render();
}

/* ---------- Checkout page (demo only, no real payment) ---------- */
function initCheckoutPage() {
  const form = document.getElementById("checkout-form");
  if (!form) return;

  const subtotal = cartTotal();
  // Free at/above ₹5,000, else a flat ₹199 - matches cart.html's existing display and the
  // server's authoritative calculation in server/routes/orders.js.
  const shipping = subtotal >= 5000 ? 0 : 199;
  const subtotalEl = document.getElementById("checkout-subtotal");
  const shippingEl = document.getElementById("checkout-shipping");
  const totalEl = document.getElementById("checkout-total");
  const discountRow = document.getElementById("checkout-discount-row");
  const discountEl = document.getElementById("checkout-discount");
  const promoSelect = document.getElementById("checkout-promo");
  const promoMessage = document.getElementById("checkout-promo-message");
  const restFieldset = document.getElementById("checkout-rest");
  const phoneInput = document.getElementById("checkout-phone");
  const otpInput = document.getElementById("checkout-otp");
  const otpRow = document.getElementById("checkout-otp-row");
  const sendOtpBtn = document.getElementById("checkout-send-otp-btn");
  const verifyOtpBtn = document.getElementById("checkout-verify-otp-btn");
  const phoneStatus = document.getElementById("checkout-phone-status");
  const paymentSelect = document.getElementById("checkout-payment");
  const upiSection = document.getElementById("checkout-upi-section");
  const upiAmountEl = document.getElementById("checkout-upi-amount");
  const upiQrImg = document.getElementById("checkout-upi-qr");
  const upiIdEl = document.getElementById("checkout-upi-id");
  const utrInput = document.getElementById("checkout-utr");

  let currentDiscount = 0;

  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (shippingEl) shippingEl.textContent = shipping === 0 ? "Free" : formatPrice(shipping);
  if (totalEl) totalEl.textContent = formatPrice(subtotal + shipping);

  function updateTotals(discount) {
    currentDiscount = discount;
    if (discountRow) discountRow.style.display = discount > 0 ? "flex" : "none";
    if (discountEl) discountEl.textContent = "-" + formatPrice(discount);
    const finalTotal = Math.max(0, subtotal - discount + shipping);
    if (totalEl) totalEl.textContent = formatPrice(finalTotal);
    if (upiAmountEl) upiAmountEl.textContent = formatPrice(finalTotal);
  }

  if (paymentSelect) {
    paymentSelect.addEventListener("change", () => {
      if (paymentSelect.value !== "UPI") {
        upiSection.style.display = "none";
        return;
      }
      upiSection.style.display = "block";
      upiAmountEl.textContent = formatPrice(Math.max(0, subtotal - currentDiscount + shipping));
      getPaymentSettings().then((settings) => {
        if (settings.qr_code_url) {
          upiQrImg.src = settings.qr_code_url;
          upiQrImg.style.display = "block";
        }
        upiIdEl.textContent = settings.upi_id ? `UPI ID: ${settings.upi_id}` : "";
      }).catch(() => {
        upiIdEl.textContent = "Couldn't load payment details - try refreshing.";
      });
    });
  }

  function showPromoMessage(text, ok) {
    if (!promoMessage) return;
    promoMessage.style.display = "block";
    promoMessage.style.color = ok ? "#2e7d32" : "#a6262b";
    promoMessage.textContent = text;
  }

  function showPhoneStatus(text, ok) {
    if (!phoneStatus) return;
    phoneStatus.style.color = ok ? "#2e7d32" : "#a6262b";
    phoneStatus.textContent = text;
  }

  function loadAvailablePromos() {
    if (!promoSelect) return;
    // Nice-to-have - if this fails, checkout still works with the "No promo code" default.
    getAvailablePromos(subtotal).then((promos) => {
      promos.forEach((promo) => {
        const option = document.createElement("option");
        option.value = promo.code;
        option.textContent = `${promo.code} — ${promo.description}`;
        promoSelect.appendChild(option);
      });
    }).catch(() => {});
  }

  function unlockCheckout(phone) {
    if (phoneInput) phoneInput.value = phone;
    if (restFieldset) restFieldset.disabled = false;
    // Once verified there's nothing left to do here - hide the phone/OTP inputs entirely
    // instead of leaving them sitting there looking like they still need action.
    const inputBlock = document.getElementById("checkout-phone-input-block");
    if (inputBlock) inputBlock.style.display = "none";
    showPhoneStatus(`✓ Logged in as ${phone}`, true);
    loadAvailablePromos();
  }

  if (isPhoneVerified()) {
    unlockCheckout(getVerifiedPhone());
  }

  if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", async () => {
      const phone = (phoneInput.value || "").replace(/\D/g, "");
      if (phone.length !== 10) {
        showPhoneStatus("Enter a valid 10-digit mobile number.", false);
        return;
      }
      sendOtpBtn.disabled = true;
      try {
        const { otp } = await requestOtp(phone);
        otpRow.style.display = "block";
        showPhoneStatus(`Demo mode — your OTP is ${otp} (no real SMS sent).`, true);
        sendOtpBtn.textContent = "Resend OTP";
      } catch (err) {
        showPhoneStatus(err.message, false);
      } finally {
        sendOtpBtn.disabled = false;
      }
    });
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async () => {
      const phone = (phoneInput.value || "").replace(/\D/g, "");
      verifyOtpBtn.disabled = true;
      try {
        const result = await verifyOtpCode(phone, otpInput.value);
        unlockCheckout(result.phone);
      } catch (err) {
        showPhoneStatus(err.message, false);
      } finally {
        verifyOtpBtn.disabled = false;
      }
    });
  }

  if (promoSelect) {
    promoSelect.addEventListener("change", async () => {
      const code = promoSelect.value;
      if (!code) {
        promoMessage.style.display = "none";
        updateTotals(0);
        return;
      }
      try {
        const result = await previewPromo(code, subtotal);
        if (result.valid) {
          showPromoMessage(`Promo applied: -${formatPrice(result.discount)}`, true);
          updateTotals(result.discount);
        } else {
          showPromoMessage(result.reason || "This code can't be applied.", false);
          updateTotals(0);
        }
      } catch (err) {
        showPromoMessage("Couldn't check promo code.", false);
        updateTotals(0);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cart = getCart();
    if (!cart.length) return;

    const items = cart.map(item => {
      const p = getProductById(item.id);
      return p ? { id: p.id, name: p.name, image: p.image, price: p.price, qty: item.qty } : null;
    }).filter(Boolean);

    if (paymentSelect.value === "UPI" && !(utrInput.value || "").trim()) {
      alert("Enter the UTR from your UPI app after paying.");
      return;
    }

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const order = await placeOrder({
        items: items,
        promoCode: (promoSelect && promoSelect.value) || undefined,
        customerName: document.getElementById("checkout-name").value,
        email: document.getElementById("checkout-email").value,
        city: document.getElementById("checkout-city").value,
        pin: document.getElementById("checkout-pin").value,
        address: document.getElementById("checkout-address").value,
        payment: paymentSelect.value,
        utr: paymentSelect.value === "UPI" ? utrInput.value.trim() : undefined
      });

      saveCart([]); // clear cart - demo order "placed"
      sessionStorage.setItem("chronara_last_order", order.id);
      window.location.href = "order-confirmation.html";
    } catch (err) {
      if (err.message === "Phone verification required") {
        // The stored login token exists but the server rejected it (most commonly: the
        // server restarted and, without a stable JWT_SECRET configured, issued a fresh one -
        // every previously-issued token silently stops working). Don't just alert a confusing
        // message - clear the dead token and put the verification UI back so they can recover
        // in one click instead of wondering why a page that said "Logged in" won't let them order.
        logout();
        const inputBlock = document.getElementById("checkout-phone-input-block");
        if (inputBlock) inputBlock.style.display = "block";
        if (restFieldset) restFieldset.disabled = true;
        showPhoneStatus("Your login session expired - please verify your phone again to place the order.", false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        alert("Couldn't place order: " + err.message);
      }
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Order history (customer-facing, real account history - see js/auth.js) ---------- */
async function initOrdersPage() {
  const root = document.getElementById("orders-root");
  if (!root) return;

  if (!isPhoneVerified()) {
    root.innerHTML = `<div class="empty-state"><h3>Log in to view your orders</h3><p>Your order history is tied to your account, so it follows you across devices.</p><br><a class="btn btn-dark" href="login.html?redirect=orders.html">Log In</a></div>`;
    return;
  }

  const accountBar = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;font-size:13.5px;color:#6b6b6b;">
      <span>Logged in as <strong style="color:var(--text);">${getVerifiedPhone()}</strong></span>
      <span class="remove-link" id="orders-logout-btn">Log Out</span>
    </div>`;

  const orders = await getOrders();
  if (!orders.length) {
    root.innerHTML = accountBar + `<div class="empty-state"><h3>No orders yet</h3><p>Your past orders will show up here once you place one.</p><br><a class="btn btn-dark" href="shop.html">Start Shopping</a></div>`;
    document.getElementById("orders-logout-btn").addEventListener("click", () => { logout(); initOrdersPage(); });
    return;
  }

  root.innerHTML = accountBar + orders.map(order => `
    <div class="order-card">
      <div class="order-card-head">
        <div>
          <div class="order-id">Order #${order.id}</div>
          <div class="order-date">${formatOrderDate(order.date)}</div>
        </div>
        <div style="text-align:right;">
          <span class="order-status">${order.status || "Processing"}</span>
          ${order.paymentStatus && order.paymentStatus !== "Not Required" ? `<div style="margin-top:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${order.paymentStatus === "Verified" ? "#2e7d32" : "#b8941f"};">Payment: ${order.paymentStatus}</div>` : ""}
        </div>
      </div>
      <div class="order-items">
        ${order.items.map(item => `
          <div class="order-item-row">
            <img src="${item.image}" alt="${item.name}">
            <div class="order-item-info">
              <div class="name">${item.name}</div>
              <div class="strap">Qty: ${item.qty}</div>
            </div>
            <div class="order-item-price">${formatPrice(item.price * item.qty)}</div>
          </div>`).join("")}
      </div>
      <div class="order-card-foot">
        <span>Deliver to: ${order.city || ""} ${order.pin || ""}${order.phone ? ` &middot; ${order.phone}` : ""}</span>
        <span class="order-total">
          ${order.discount > 0 ? `<span style="color:#2e7d32;font-weight:600;margin-right:8px;">${order.promoCode} applied (-${formatPrice(order.discount)})</span>` : ""}
          ${order.shipping > 0 ? `<span style="margin-right:8px;">Shipping: ${formatPrice(order.shipping)}</span>` : ""}
          Total: ${formatPrice(order.total)}
        </span>
      </div>
    </div>`).join("");

  document.getElementById("orders-logout-btn").addEventListener("click", () => { logout(); initOrdersPage(); });
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    nav.style.display = nav.style.display === "block" ? "none" : "block";
  });
}

/* ---------- Login page (phone + OTP account, see js/auth.js) ---------- */
function initLoginPage() {
  const sendBtn = document.getElementById("login-send-otp-btn");
  if (!sendBtn) return;

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect") || "index.html";

  if (isPhoneVerified()) {
    window.location.href = redirect;
    return;
  }

  const phoneInput = document.getElementById("login-phone");
  const otpInput = document.getElementById("login-otp");
  const otpRow = document.getElementById("login-otp-row");
  const verifyBtn = document.getElementById("login-verify-otp-btn");
  const status = document.getElementById("login-status");

  function showStatus(text, ok) {
    status.style.color = ok ? "#2e7d32" : "#a6262b";
    status.textContent = text;
  }

  sendBtn.addEventListener("click", async () => {
    const phone = (phoneInput.value || "").replace(/\D/g, "");
    if (phone.length !== 10) {
      showStatus("Enter a valid 10-digit mobile number.", false);
      return;
    }
    sendBtn.disabled = true;
    try {
      const { otp } = await requestOtp(phone);
      otpRow.style.display = "block";
      showStatus(`Demo mode — your OTP is ${otp} (no real SMS sent).`, true);
      sendBtn.textContent = "Resend OTP";
    } catch (err) {
      showStatus(err.message, false);
    } finally {
      sendBtn.disabled = false;
    }
  });

  verifyBtn.addEventListener("click", async () => {
    const phone = (phoneInput.value || "").replace(/\D/g, "");
    verifyBtn.disabled = true;
    try {
      await verifyOtpCode(phone, otpInput.value);
      window.location.href = redirect;
    } catch (err) {
      showStatus(err.message, false);
      verifyBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initMobileNav();
  initAccountLink();
  initLoginPage();
  await loadProducts(); // catalog now comes from the server - load it before rendering anything
  wireAddToCartButtons(document);
  if (document.getElementById("featured-grid")) renderProducts("featured-grid", PRODUCTS.slice(0, 4));
  initShopPage();
  initProductDetailPage();
  initCartPage();
  initCheckoutPage();
  initOrdersPage();
});
