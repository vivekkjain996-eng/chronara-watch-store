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
        <button class="btn btn-dark btn-block add-to-cart-btn" data-id="${p.id}">Add to Cart</button>
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
function initProductDetailPage() {
  const root = document.getElementById("product-detail-root");
  if (!root) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const product = getProductById(id);

  if (!product) {
    root.innerHTML = `<div class="empty-state"><h3>Watch not found</h3><p>The item you're looking for doesn't exist.</p><br><a class="btn btn-dark" href="shop.html">Back to Shop</a></div>`;
    return;
  }

  document.title = product.name + " - Chronara";
  root.innerHTML = `
    <div class="detail-image"><img src="${product.image}" alt="${product.name}"></div>
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
        <button class="btn btn-dark" id="detail-add-btn">Add to Cart</button>
        <a class="btn btn-outline" style="color:#0d1b2a;border-color:#0d1b2a;" href="cart.html">View Cart</a>
      </div>
    </div>`;

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
          <td>${formatPrice(p.price)}</td>
          <td>
            <div class="qty-control">
              <button type="button" class="cart-qty-minus" data-id="${p.id}">-</button>
              <input type="number" min="1" value="${item.qty}" class="cart-qty-input" data-id="${p.id}">
              <button type="button" class="cart-qty-plus" data-id="${p.id}">+</button>
            </div>
          </td>
          <td>${formatPrice(p.price * item.qty)}</td>
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

  const totalEl = document.getElementById("checkout-total");
  if (totalEl) totalEl.textContent = formatPrice(cartTotal());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const cart = getCart();
    if (!cart.length) return;

    const items = cart.map(item => {
      const p = getProductById(item.id);
      return p ? { id: p.id, name: p.name, image: p.image, price: p.price, qty: item.qty } : null;
    }).filter(Boolean);

    const order = {
      id: generateOrderId(),
      date: new Date().toISOString(),
      items: items,
      total: cartTotal(),
      customerName: document.getElementById("checkout-name").value,
      email: document.getElementById("checkout-email").value,
      city: document.getElementById("checkout-city").value,
      pin: document.getElementById("checkout-pin").value,
      address: document.getElementById("checkout-address").value,
      payment: document.getElementById("checkout-payment").value,
      status: "Processing"
    };

    saveOrder(order);
    saveCart([]); // clear cart - demo order "placed"
    sessionStorage.setItem("chronara_last_order", order.id);
    window.location.href = "order-confirmation.html";
  });
}

/* ---------- Order history (customer-facing) ---------- */
function initOrdersPage() {
  const root = document.getElementById("orders-root");
  if (!root) return;

  const orders = getOrders();
  if (!orders.length) {
    root.innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>Your past orders will show up here once you place one.</p><br><a class="btn btn-dark" href="shop.html">Start Shopping</a></div>`;
    return;
  }

  root.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-card-head">
        <div>
          <div class="order-id">Order #${order.id}</div>
          <div class="order-date">${formatOrderDate(order.date)}</div>
        </div>
        <span class="order-status">${order.status || "Processing"}</span>
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
        <span>Deliver to: ${order.city || ""} ${order.pin || ""}</span>
        <span class="order-total">Total: ${formatPrice(order.total)}</span>
      </div>
    </div>`).join("");
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

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  wireAddToCartButtons(document);
  initShopPage();
  initProductDetailPage();
  initCartPage();
  initCheckoutPage();
  initOrdersPage();
});

/* ---------- Live refresh when the catalog changes in another tab ---------- */
// The browser's "storage" event fires on every OTHER open tab/window of the SAME
// origin when localStorage changes here - e.g. an admin.html tab editing a price
// updates a shop.html tab automatically, with no manual refresh needed. It does NOT
// fire in the tab that made the change (that tab already re-renders itself directly).
// Each affected view is re-rendered in place rather than reloading the page, and only
// the pieces that already exist on the current page are touched.
window.addEventListener("storage", (e) => {
  if (e.key !== null && e.key !== CATALOG_KEY) return; // ignore unrelated keys (cart, orders, admin auth)

  refreshProducts();

  const featuredGrid = document.getElementById("featured-grid");
  if (featuredGrid) renderProducts("featured-grid", PRODUCTS.slice(0, 4));

  shopApplyFilters(); // no-ops on pages without a #product-grid

  if (document.getElementById("product-detail-root")) initProductDetailPage();
  if (document.getElementById("cart-root")) initCartPage();
});
