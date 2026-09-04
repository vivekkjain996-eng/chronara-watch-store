// Admin panel logic. Login now goes through a real server-side check (bcrypt-hashed
// password + signed JWT, see server/auth.js) instead of a hardcoded client-side string -
// admin API routes reject requests without a valid token. See ADMIN_TOKEN_KEY in js/api.js.
const MAX_IMAGE_DIM = 1000;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

let editingId = null;
let activeTab = "products";

// New photos/video picked but not yet uploaded (client-only until the form is submitted).
let pendingImages = []; // { blob, label, previewUrl }
let pendingVideo = null; // { file, previewUrl }

// Already-saved media for the product currently being edited (fetched from the server).
let existingImages = []; // { id, url, label }
let existingVideo = null; // { id, url }

function isAdminLoggedIn() {
  return !!getAdminToken();
}

function initAdminPage() {
  const root = document.getElementById("admin-root");
  if (!root) return;

  if (!isAdminLoggedIn()) {
    renderLogin(root);
  } else {
    renderDashboard(root);
  }
}

function renderLogin(root) {
  root.innerHTML = `
    <div class="form-card" style="max-width:400px;">
      <h2 style="margin-bottom:6px;">Admin Login</h2>
      <p style="color:#6b6b6b;font-size:13px;margin-bottom:20px;">Demo password: <code>admin123</code> (unless changed via .env)</p>
      <form id="admin-login-form">
        <div class="form-row">
          <label>Password</label>
          <input type="password" id="admin-password" required placeholder="Enter admin password">
        </div>
        <p id="admin-login-error" style="color:#a6262b;font-size:13px;margin-bottom:12px;display:none;">Incorrect password. Try again.</p>
        <button type="submit" class="btn btn-dark btn-block">Log In</button>
      </form>
    </div>`;

  document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = document.getElementById("admin-password").value;
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      const { token } = await apiPost("/api/admin/login", { password: entered });
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      activeTab = "products";
      renderDashboard(root);
    } catch (err) {
      document.getElementById("admin-login-error").style.display = "block";
      submitBtn.disabled = false;
    }
  });
}

const ADMIN_TABS = [
  { key: "products", label: "Manage Watches", render: () => renderProductsTab() },
  { key: "orders", label: "Orders", render: () => renderOrdersTab() },
  { key: "promos", label: "Promo Codes", render: () => renderPromosTab() },
  { key: "payment", label: "Payment Settings", render: () => renderPaymentSettingsTab() },
  { key: "reviews", label: "Reviews", render: () => renderReviewsTab() }
];

async function renderDashboard(root) {
  await loadProducts();
  root.innerHTML = `
    <div class="admin-topbar">
      <h2>Admin Dashboard</h2>
      <div>
        <button class="btn btn-outline" id="admin-reset-btn" style="color:#0d1b2a;border-color:#0d1b2a;">Reset to Demo Data</button>
        <button class="btn btn-dark" id="admin-logout-btn">Log Out</button>
      </div>
    </div>

    <div class="admin-tabs" style="display:flex;gap:10px;margin-bottom:20px;">
      ${ADMIN_TABS.map(t => `
        <button type="button" class="btn ${activeTab === t.key ? "btn-dark" : "btn-outline"}" data-tab="${t.key}" style="${activeTab !== t.key ? "color:#0d1b2a;border-color:#0d1b2a;" : ""}">${t.label}</button>
      `).join("")}
    </div>

    <div id="admin-tab-content"></div>`;

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    initAdminPage();
  });

  document.getElementById("admin-reset-btn").addEventListener("click", async () => {
    if (confirm("Reset the catalog back to the original 8 demo watches? Any watches you added or edited will be lost.")) {
      await resetCatalogToDemoData();
      if (activeTab === "products") renderProductsTab();
    }
  });

  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => { activeTab = btn.dataset.tab; renderDashboard(root); });
  });

  (ADMIN_TABS.find(t => t.key === activeTab) || ADMIN_TABS[0]).render();
}

/* ---------- Manage Watches tab ---------- */
function renderProductsTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `
    <div class="form-card" style="max-width:none;margin-bottom:24px;">
      <h3 style="margin-bottom:6px;">Bulk Upload Watches (CSV)</h3>
      <p style="font-size:12.5px;color:#6b6b6b;margin-bottom:14px;">Add many watches at once from a CSV file (columns: name, category, price, strap, description, images). For "images", paste one or more photo URLs separated by <code>|</code> - each is fetched automatically, so a watch can have multiple photos right away. Leave it blank to use a placeholder photo (add real photos afterward using Edit). <a href="#" id="admin-csv-template-link">Download CSV template</a></p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="admin-csv-input" accept=".csv,text/csv">
        <button type="button" class="btn btn-dark" id="admin-csv-upload-btn" style="padding:10px 20px;">Upload CSV</button>
      </div>
      <div id="admin-csv-result" style="margin-top:14px;font-size:13px;"></div>
    </div>

    <div class="admin-layout">
      <div class="admin-table-wrap">
        <table class="cart-table" id="admin-product-table">
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th></th></tr></thead>
          <tbody id="admin-product-tbody"></tbody>
        </table>
      </div>

      <div class="form-card" id="admin-form-card">
        <h3 id="admin-form-title" style="margin-bottom:18px;">Add New Watch</h3>
        <form id="admin-product-form">
          <input type="hidden" id="admin-edit-id">
          <div class="form-row">
            <label>Watch Name</label>
            <input type="text" id="admin-name" required placeholder="e.g. Chronara Aurora">
          </div>
          <div class="form-row form-row-2">
            <div>
              <label>Category</label>
              <select id="admin-category">
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="smart">Smart</option>
              </select>
            </div>
            <div>
              <label>Price (₹)</label>
              <input type="number" id="admin-price" required min="0" step="1" placeholder="9999">
            </div>
          </div>
          <div class="form-row">
            <label>Strap Material</label>
            <input type="text" id="admin-strap" required placeholder="e.g. Stainless Steel">
          </div>
          <div class="form-row">
            <label>Description</label>
            <textarea id="admin-description" rows="3" required placeholder="Short product description"></textarea>
          </div>
          <div class="form-row">
            <label>Photos</label>
            <input type="file" id="admin-images-input" accept="image/*" multiple>
            <p style="font-size:12px;color:#6b6b6b;margin-top:6px;">Add one or more photos (e.g. Front, Back, Strap) and label each below. At least one photo is required.</p>
            <div id="admin-photos-list" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>
          </div>
          <div class="form-row">
            <label>Video (optional)</label>
            <input type="file" id="admin-video-input" accept="video/*">
            <p style="font-size:12px;color:#6b6b6b;margin-top:6px;">Short clip, up to 25MB. Uploading a new one replaces the existing video.</p>
            <div id="admin-video-section" style="margin-top:10px;"></div>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="submit" class="btn btn-dark" id="admin-submit-btn" style="flex:1;">Add Watch</button>
            <button type="button" class="btn btn-outline" id="admin-cancel-edit-btn" style="display:none;color:#0d1b2a;border-color:#0d1b2a;">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  renderAdminTable();
  wireAdminForm();
  wireCsvUpload();
}

/* ---------- Bulk CSV upload ---------- */
function wireCsvUpload() {
  const templateLink = document.getElementById("admin-csv-template-link");
  templateLink.addEventListener("click", (e) => {
    e.preventDefault();
    const csv = "name,category,price,strap,description,images\n" +
      `"Chronara Example",men,9999,"Stainless Steel","A short description of the watch.","https://example.com/photo1.jpg|https://example.com/photo2.jpg"\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chronara-watches-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const csvInput = document.getElementById("admin-csv-input");
  const uploadBtn = document.getElementById("admin-csv-upload-btn");
  const resultEl = document.getElementById("admin-csv-result");

  uploadBtn.addEventListener("click", async () => {
    const file = csvInput.files[0];
    if (!file) {
      resultEl.innerHTML = `<p style="color:#a6262b;">Choose a CSV file first.</p>`;
      return;
    }
    uploadBtn.disabled = true;
    resultEl.innerHTML = `<p style="color:#6b6b6b;">Uploading…</p>`;
    try {
      const formData = new FormData();
      formData.append("csv", file);
      const result = await bulkUploadProducts(formData);
      let html = `<p style="color:#2e7d32;font-weight:600;">Created ${result.created} watch${result.created === 1 ? "" : "es"}.</p>`;
      if (result.errors.length) {
        html += `<p style="color:#a6262b;font-weight:600;margin-top:8px;">${result.errors.length} row(s) had errors:</p>
          <ul style="margin-left:18px;color:#a6262b;font-size:12.5px;">
            ${result.errors.map(e => `<li>Row ${e.row}: ${e.message}</li>`).join("")}
          </ul>`;
      }
      resultEl.innerHTML = html;
      renderAdminTable();
      csvInput.value = "";
    } catch (err) {
      resultEl.innerHTML = `<p style="color:#a6262b;">Upload failed: ${err.message}</p>`;
    } finally {
      uploadBtn.disabled = false;
    }
  });
}

function renderAdminTable() {
  const tbody = document.getElementById("admin-product-tbody");
  if (!tbody) return;
  tbody.innerHTML = PRODUCTS.map(p => `
    <tr>
      <td><img src="${p.image}" alt="${p.name}" style="width:44px;height:44px;object-fit:contain;"></td>
      <td data-label="Name: ">${p.name}</td>
      <td data-label="Category: " style="text-transform:capitalize;">${p.category}</td>
      <td data-label="Price: ">${formatPrice(p.price)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline admin-edit-btn" data-id="${p.id}" style="padding:6px 14px;font-size:11.5px;color:#0d1b2a;border-color:#0d1b2a;">Edit</button>
        <button class="btn btn-outline admin-delete-btn" data-id="${p.id}" style="padding:6px 14px;font-size:11.5px;color:#a6262b;border-color:#a6262b;">Delete</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll(".admin-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => startEdit(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".admin-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const p = getProductById(btn.dataset.id);
      if (p && confirm(`Delete "${p.name}"? This can't be undone.`)) {
        await deleteProduct(btn.dataset.id);
        renderAdminTable();
        if (editingId === Number(btn.dataset.id)) resetAdminForm();
      }
    });
  });
}

async function startEdit(id) {
  const p = getProductById(id);
  if (!p) return;
  editingId = id;
  clearPendingMedia();

  document.getElementById("admin-form-title").textContent = "Edit Watch";
  document.getElementById("admin-edit-id").value = id;
  document.getElementById("admin-name").value = p.name;
  document.getElementById("admin-category").value = p.category;
  document.getElementById("admin-price").value = p.price;
  document.getElementById("admin-strap").value = p.strap;
  document.getElementById("admin-description").value = p.description;
  document.getElementById("admin-submit-btn").textContent = "Update Watch";
  document.getElementById("admin-cancel-edit-btn").style.display = "inline-block";

  const full = await fetchProductWithMedia(id);
  existingImages = full.media.filter(m => m.type === "image");
  existingVideo = full.media.find(m => m.type === "video") || null;
  renderMediaLists();

  document.getElementById("admin-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearPendingMedia() {
  pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
  pendingImages = [];
  if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
  pendingVideo = null;
}

function resetAdminForm() {
  editingId = null;
  clearPendingMedia();
  existingImages = [];
  existingVideo = null;

  const form = document.getElementById("admin-product-form");
  if (form) form.reset();
  document.getElementById("admin-form-title").textContent = "Add New Watch";
  document.getElementById("admin-edit-id").value = "";
  document.getElementById("admin-submit-btn").textContent = "Add Watch";
  document.getElementById("admin-cancel-edit-btn").style.display = "none";
  renderMediaLists();
}

/* ---------- Photos/video pickers + pending-media list rendering ---------- */
function renderMediaLists() {
  const photosList = document.getElementById("admin-photos-list");
  if (photosList) {
    const existingRows = existingImages.map(img => `
      <div class="admin-media-row">
        <img src="${img.url}" alt="${img.label || ""}">
        <span class="admin-media-label">${img.label || "(no label)"}</span>
        <button type="button" class="btn btn-outline admin-remove-existing-image" data-id="${img.id}">Remove</button>
      </div>`).join("");
    const pendingRows = pendingImages.map((img, i) => `
      <div class="admin-media-row">
        <img src="${img.previewUrl}" alt="">
        <input type="text" class="admin-pending-label" data-index="${i}" placeholder="e.g. Front, Back, Strap" value="${img.label}">
        <button type="button" class="btn btn-outline admin-remove-pending-image" data-index="${i}">Remove</button>
      </div>`).join("");
    photosList.innerHTML = (existingRows + pendingRows) || `<p style="font-size:12.5px;color:#6b6b6b;">No photos yet.</p>`;

    photosList.querySelectorAll(".admin-remove-existing-image").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Remove this photo?")) return;
        try {
          await deleteProductMedia(editingId, btn.dataset.id);
          existingImages = existingImages.filter(img => img.id !== Number(btn.dataset.id));
          renderMediaLists();
          renderAdminTable();
        } catch (err) {
          alert(err.message);
        }
      });
    });
    photosList.querySelectorAll(".admin-remove-pending-image").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.index);
        URL.revokeObjectURL(pendingImages[i].previewUrl);
        pendingImages.splice(i, 1);
        renderMediaLists();
      });
    });
    photosList.querySelectorAll(".admin-pending-label").forEach(input => {
      input.addEventListener("input", () => {
        pendingImages[Number(input.dataset.index)].label = input.value;
      });
    });
  }

  const videoSection = document.getElementById("admin-video-section");
  if (videoSection) {
    if (pendingVideo) {
      videoSection.innerHTML = `
        <video src="${pendingVideo.previewUrl}" controls style="max-width:240px;display:block;margin-bottom:8px;"></video>
        <button type="button" class="btn btn-outline" id="admin-remove-pending-video">Remove</button>`;
      document.getElementById("admin-remove-pending-video").addEventListener("click", () => {
        URL.revokeObjectURL(pendingVideo.previewUrl);
        pendingVideo = null;
        renderMediaLists();
      });
    } else if (existingVideo) {
      videoSection.innerHTML = `
        <video src="${existingVideo.url}" controls style="max-width:240px;display:block;margin-bottom:8px;"></video>
        <button type="button" class="btn btn-outline" id="admin-remove-existing-video">Remove</button>`;
      document.getElementById("admin-remove-existing-video").addEventListener("click", async () => {
        if (!confirm("Remove the video?")) return;
        try {
          await deleteProductMedia(editingId, existingVideo.id);
          existingVideo = null;
          renderMediaLists();
        } catch (err) {
          alert(err.message);
        }
      });
    } else {
      videoSection.innerHTML = `<p style="font-size:12.5px;color:#6b6b6b;">No video uploaded.</p>`;
    }
  }
}

/* Resize an uploaded image via canvas so it stays a reasonable size, then hand back a
   compressed JPEG blob ready to attach to a FormData upload. */
function resizeImageToBlob(file, maxDim) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function buildPendingMediaFormData() {
  const formData = new FormData();
  pendingImages.forEach((img) => {
    formData.append("images", img.blob, "photo.jpg");
    formData.append("labels", img.label || "");
  });
  if (pendingVideo) formData.append("video", pendingVideo.file, pendingVideo.file.name || "video.mp4");
  return formData;
}

function wireAdminForm() {
  const form = document.getElementById("admin-product-form");
  if (!form) return;

  renderMediaLists();

  document.getElementById("admin-images-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    for (const file of files) {
      const blob = await resizeImageToBlob(file, MAX_IMAGE_DIM);
      pendingImages.push({ blob, label: "", previewUrl: URL.createObjectURL(blob) });
    }
    renderMediaLists();
  });

  document.getElementById("admin-video-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      alert("Video must be 25MB or smaller.");
      return;
    }
    if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
    pendingVideo = { file, previewUrl: URL.createObjectURL(file) };
    renderMediaLists();
  });

  document.getElementById("admin-cancel-edit-btn").addEventListener("click", resetAdminForm);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("admin-edit-id").value;

    if (!id && pendingImages.length === 0) {
      alert("Add at least one photo.");
      return;
    }

    const fields = {
      name: document.getElementById("admin-name").value.trim(),
      category: document.getElementById("admin-category").value,
      price: Number(document.getElementById("admin-price").value),
      strap: document.getElementById("admin-strap").value.trim(),
      description: document.getElementById("admin-description").value.trim()
    };

    const submitBtn = document.getElementById("admin-submit-btn");
    submitBtn.disabled = true;
    try {
      if (id) {
        await updateProduct(id, fields);
        if (pendingImages.length || pendingVideo) {
          await uploadProductMedia(id, buildPendingMediaFormData());
        }
      } else {
        const formData = buildPendingMediaFormData();
        Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
        await createProduct(formData);
      }
      resetAdminForm();
      renderAdminTable();
    } catch (err) {
      alert("Couldn't save watch: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Orders tab (every customer's orders, full details) ---------- */
async function renderOrdersTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `<p style="color:#6b6b6b;">Loading orders…</p>`;

  let orders;
  try {
    orders = await apiGet("/api/orders/admin");
  } catch (err) {
    content.innerHTML = `<p style="color:#a6262b;">Couldn't load orders: ${err.message}</p>`;
    return;
  }

  if (!orders.length) {
    content.innerHTML = `<div class="empty-state"><h3>No orders yet</h3><p>Orders placed by any customer, on any device, will show up here.</p></div>`;
    return;
  }

  const statuses = ["Processing", "Shipped", "Delivered", "Cancelled"];

  // Whichever order is chronologically first for a given phone is that customer's first ever
  // order here - tag it "New Customer", everything after "Returning". Same phone-based logic
  // already used for first-order promo eligibility (server/lib/promo.js), just surfaced here.
  const earliestByPhone = {};
  orders.forEach(o => {
    if (!o.phone) return;
    if (!earliestByPhone[o.phone] || o.date < earliestByPhone[o.phone].date) {
      earliestByPhone[o.phone] = o;
    }
  });

  content.innerHTML = orders.map(order => {
    const customerTag = !order.phone ? "" : (earliestByPhone[order.phone].id === order.id
      ? `<span style="background:#e8f5e9;color:#2e7d32;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 8px;border-radius:12px;margin-left:8px;">New Customer</span>`
      : `<span style="background:#eef2f7;color:#0d1b2a;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 8px;border-radius:12px;margin-left:8px;">Returning</span>`);
    return `
    <div class="order-card">
      <div class="order-card-head">
        <div>
          <div class="order-id">Order #${order.id}</div>
          <div class="order-date">${formatOrderDate(order.date)}</div>
        </div>
        <select class="admin-order-status" data-id="${order.id}" style="max-width:150px;">
          ${statuses.map(s => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div style="font-size:13.5px;color:#333;margin:8px 0;">
        <div><strong>${order.customerName || "Unknown"}</strong> &nbsp;|&nbsp; ${order.email || ""}${order.phone ? ` &nbsp;|&nbsp; ${order.phone}` : ""}${customerTag}</div>
        <div style="color:#6b6b6b;">${order.address || ""}${order.address ? "," : ""} ${order.city || ""} ${order.pin || ""}</div>
        <div style="color:#6b6b6b;">Payment: ${order.payment || "-"}</div>
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
      ${order.paymentStatus && order.paymentStatus !== "Not Required" ? `
      <div style="padding:10px 20px;background:${order.paymentStatus === "Verified" ? "#e8f5e9" : "#fdf6e3"};border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <span>UPI UTR: <strong>${order.utr || "-"}</strong> &nbsp;|&nbsp; Payment: <strong>${order.paymentStatus}</strong></span>
        ${order.paymentStatus === "Pending Verification" ? `<button type="button" class="btn btn-dark admin-verify-payment-btn" data-id="${order.id}" style="padding:6px 14px;font-size:11.5px;">Verify Payment</button>` : ""}
      </div>` : ""}
      <div class="order-card-foot">
        <span>${order.discount > 0 ? `Promo: ${order.promoCode} (-${formatPrice(order.discount)})` : ""}${order.shipping > 0 ? ` &nbsp;|&nbsp; Shipping: ${formatPrice(order.shipping)}` : ""}${order.codFee > 0 ? ` &nbsp;|&nbsp; Advance Paid (UPI): ${formatPrice(order.codFee)} &nbsp;|&nbsp; Due on Delivery: ${formatPrice(order.total - order.codFee)}` : ""}</span>
        <span class="order-total">Total: ${formatPrice(order.total)}</span>
      </div>
    </div>`;
  }).join("");

  content.querySelectorAll(".admin-order-status").forEach(select => {
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await apiPatch(`/api/orders/admin/${select.dataset.id}`, { status: select.value });
      } catch (err) {
        alert("Couldn't update order status: " + err.message);
      } finally {
        select.disabled = false;
      }
    });
  });

  content.querySelectorAll(".admin-verify-payment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiPatch(`/api/orders/admin/${btn.dataset.id}/verify-payment`, {});
        renderOrdersTab();
      } catch (err) {
        alert("Couldn't verify payment: " + err.message);
        btn.disabled = false;
      }
    });
  });
}

/* ---------- Reviews tab ---------- */
function adminStarsHTML(rating) {
  let html = "";
  for (let i = 1; i <= 5; i++) html += i <= rating ? "★" : `<span style="color:var(--border);">★</span>`;
  return `<span style="color:var(--gold);letter-spacing:1px;">${html}</span>`;
}

async function renderReviewsTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `<p style="color:#6b6b6b;">Loading reviews…</p>`;

  let reviews;
  try {
    reviews = await apiGet("/api/reviews/admin/all");
  } catch (err) {
    content.innerHTML = `<p style="color:#a6262b;">Couldn't load reviews: ${err.message}</p>`;
    return;
  }

  if (!reviews.length) {
    content.innerHTML = `<div class="empty-state"><h3>No reviews yet</h3><p>Reviews left by customers on their purchased watches will show up here.</p></div>`;
    return;
  }

  content.innerHTML = `
    <div class="admin-table-wrap">
      ${reviews.map(r => `
        <div class="review-card">
          <div class="review-card-head">
            <span class="review-card-name">${r.productName} &nbsp;&middot;&nbsp; ${r.customerName}</span>
            <span class="review-card-date">${new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          ${adminStarsHTML(r.rating)}
          ${r.comment ? `<p class="review-card-comment">${r.comment}</p>` : ""}
          <button type="button" class="btn admin-delete-review-btn" data-id="${r.id}" style="margin-top:10px;padding:5px 12px;font-size:11px;color:#a6262b;border-color:#a6262b;">Delete Review</button>
        </div>`).join("")}
    </div>`;

  content.querySelectorAll(".admin-delete-review-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this review? This can't be undone.")) return;
      btn.disabled = true;
      try {
        await apiDelete(`/api/reviews/admin/${btn.dataset.id}`);
        renderReviewsTab();
      } catch (err) {
        alert("Couldn't delete review: " + err.message);
        btn.disabled = false;
      }
    });
  });
}

/* ---------- Promo Codes tab ---------- */
async function renderPromosTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `
    <div class="admin-layout">
      <div class="admin-table-wrap">
        <table class="cart-table" id="admin-promo-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Conditions</th><th>Status</th><th></th></tr></thead>
          <tbody id="admin-promo-tbody"></tbody>
        </table>
      </div>

      <div class="form-card">
        <h3 style="margin-bottom:18px;">Add Promo Code</h3>
        <form id="admin-promo-form">
          <div class="form-row">
            <label>Code</label>
            <input type="text" id="promo-code" required placeholder="e.g. WELCOME10" style="text-transform:uppercase;">
          </div>
          <div class="form-row form-row-2">
            <div>
              <label>Discount Type</label>
              <select id="promo-type">
                <option value="percent">Percentage</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>
            <div>
              <label>Value</label>
              <input type="number" id="promo-value" required min="0" step="0.01" placeholder="10">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div>
              <label>Max Discount Cap (₹, optional)</label>
              <input type="number" id="promo-max-discount" min="0" step="1" placeholder="e.g. 2000">
            </div>
            <div>
              <label>Min Order Value (₹, optional)</label>
              <input type="number" id="promo-min-order" min="0" step="1" placeholder="e.g. 3000">
            </div>
          </div>
          <div class="form-row">
            <label style="display:flex;align-items:center;"><input type="checkbox" id="promo-first-order" style="width:auto;margin-right:8px;">First-time customers only</label>
          </div>
          <button type="submit" class="btn btn-dark btn-block">Add Promo Code</button>
        </form>
      </div>
    </div>`;

  renderPromoTable();

  document.getElementById("admin-promo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await createPromo({
        code: document.getElementById("promo-code").value.trim(),
        type: document.getElementById("promo-type").value,
        value: Number(document.getElementById("promo-value").value),
        maxDiscount: document.getElementById("promo-max-discount").value || null,
        minOrderValue: document.getElementById("promo-min-order").value || null,
        firstOrderOnly: document.getElementById("promo-first-order").checked
      });
      e.target.reset();
      renderPromoTable();
    } catch (err) {
      alert("Couldn't save promo code: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function renderPromoTable() {
  const tbody = document.getElementById("admin-promo-tbody");
  if (!tbody) return;

  let promos;
  try {
    promos = await getAllPromos();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#a6262b;">Couldn't load promo codes: ${err.message}</td></tr>`;
    return;
  }

  if (!promos.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#6b6b6b;">No promo codes yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = promos.map(p => {
    const conditions = [];
    if (p.min_order_value) conditions.push(`Min order ${formatPrice(p.min_order_value)}`);
    if (p.max_discount) conditions.push(`Capped at ${formatPrice(p.max_discount)}`);
    if (p.first_order_only) conditions.push("First order only");
    return `
    <tr>
      <td data-label="Code: "><code>${p.code}</code></td>
      <td data-label="Discount: ">${p.type === "percent" ? p.value + "%" : formatPrice(p.value)}</td>
      <td data-label="Conditions: " style="font-size:12.5px;color:#6b6b6b;">${conditions.join(", ") || "—"}</td>
      <td data-label="Status: ">
        <button class="btn btn-outline admin-promo-toggle" data-id="${p.id}" data-active="${p.active}" style="padding:5px 12px;font-size:11px;${p.active ? "color:#2e7d32;border-color:#2e7d32;" : "color:#6b6b6b;border-color:#6b6b6b;"}">${p.active ? "Active" : "Inactive"}</button>
      </td>
      <td><button class="btn btn-outline admin-promo-delete" data-id="${p.id}" style="padding:5px 12px;font-size:11px;color:#a6262b;border-color:#a6262b;">Delete</button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".admin-promo-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await updatePromo(btn.dataset.id, { active: btn.dataset.active !== "1" });
        renderPromoTable();
      } catch (err) {
        alert(err.message);
      }
    });
  });
  tbody.querySelectorAll(".admin-promo-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this promo code?")) return;
      try {
        await deletePromo(btn.dataset.id);
        renderPromoTable();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

/* ---------- Payment Settings tab (UPI QR + ID shown to customers at checkout) ---------- */
async function renderPaymentSettingsTab() {
  const content = document.getElementById("admin-tab-content");
  content.innerHTML = `<p style="color:#6b6b6b;">Loading…</p>`;

  let settings;
  try {
    settings = await getPaymentSettings();
  } catch (err) {
    content.innerHTML = `<p style="color:#a6262b;">Couldn't load payment settings: ${err.message}</p>`;
    return;
  }

  content.innerHTML = `
    <div class="form-card" style="max-width:480px;">
      <h3 style="margin-bottom:6px;">UPI Payment Settings</h3>
      <p style="font-size:12.5px;color:#6b6b6b;margin-bottom:18px;">Shown to customers at checkout when they choose UPI. Upload your UPI QR code and enter your UPI ID.</p>
      <form id="payment-settings-form">
        <div class="form-row">
          <label>UPI ID</label>
          <input type="text" id="payment-upi-id" placeholder="yourname@bank" value="${settings.upi_id || ""}">
        </div>
        <div class="form-row">
          <label>QR Code Image</label>
          <input type="file" id="payment-qr-input" accept="image/*">
          <img id="payment-qr-preview" src="${settings.qr_code_url || ""}" style="max-width:160px;margin-top:10px;border:1px solid var(--border);border-radius:4px;${settings.qr_code_url ? "" : "display:none;"}">
        </div>
        <button type="submit" class="btn btn-dark btn-block">Save Payment Settings</button>
      </form>
    </div>`;

  const qrInput = document.getElementById("payment-qr-input");
  const qrPreview = document.getElementById("payment-qr-preview");
  let pendingQrFile = null;

  qrInput.addEventListener("change", () => {
    const file = qrInput.files[0];
    if (!file) return;
    pendingQrFile = file;
    qrPreview.src = URL.createObjectURL(file);
    qrPreview.style.display = "block";
  });

  document.getElementById("payment-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      const formData = new FormData();
      formData.append("upiId", document.getElementById("payment-upi-id").value.trim());
      if (pendingQrFile) formData.append("qrCode", pendingQrFile);
      await savePaymentSettings(formData);
      renderPaymentSettingsTab();
    } catch (err) {
      alert("Couldn't save payment settings: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", initAdminPage);
