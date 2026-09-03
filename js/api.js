// Tiny fetch wrapper shared by products.js / orders.js / promos.js / admin.js / auth.js.
const ADMIN_TOKEN_KEY = "chronara_admin_token";
const CUSTOMER_TOKEN_KEY = "chronara_customer_token";

function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

// localStorage (not sessionStorage) - customer login is a persistent "stay logged in" account
// session (Flipkart/Goibibo-style), not scoped to one tab/visit.
function getCustomerToken() {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

// Admin pages and customer checkout never coexist in the same session in practice, and they
// use distinct storage keys, so trying admin first then customer is safe either way.
function getAuthToken() {
  return getAdminToken() || getCustomerToken();
}

async function apiRequest(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

const apiGet = (path) => apiRequest("GET", path);
const apiPost = (path, body) => apiRequest("POST", path, body);
const apiPut = (path, body) => apiRequest("PUT", path, body);
const apiPatch = (path, body) => apiRequest("PATCH", path, body);
const apiDelete = (path) => apiRequest("DELETE", path);

// Same as apiRequest, but for multipart/form-data (file uploads) - no JSON header/body,
// the browser sets the multipart boundary itself.
async function apiUpload(method, path, formData) {
  const headers = {};
  const token = getAuthToken();
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(path, { method, headers, body: formData });

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}
