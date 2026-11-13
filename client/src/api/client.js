// Thin fetch wrapper around the /api endpoints. In dev the Vite proxy
// forwards /api to the Express server, so the base URL is just "/api".
// The client contains no KHQR logic, merchant data or amount calculations:
// it only renders what the server sends back.

async function request(path, options) {
  const response = await fetch(path, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON response, fall through to the generic error below
  }

  if (!response.ok) {
    const message = body?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

export function getProducts() {
  return request("/api/products");
}

export function getProduct(id) {
  return request(`/api/products/${id}`);
}

export function createKhqr(productId, { signal } = {}) {
  return request("/api/payments/khqr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
    signal,
  });
}

export function getPaymentStatus(tranId, { signal } = {}) {
  return request(`/api/payments/${tranId}/status`, { signal });
}
