/**
 * Authenticated API client.
 *
 * Wraps the repeated pattern of:
 *   1. Obtaining an id-token from Amplify.
 *   2. Building the full URL from VITE_API_ENDPOINT.
 *   3. Setting Authorization and Content-Type headers.
 *   4. Returning the parsed JSON body (or throwing on HTTP error).
 *
 * Usage:
 *   import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/apiClient";
 *
 *   const data = await apiGet("admin/instructors", { instructor_email: email });
 *   const result = await apiPost("admin/create_simulation_group", body, { group_name: name });
 */

import { fetchAuthSession } from "aws-amplify/auth";

const BASE_URL = import.meta.env.VITE_API_ENDPOINT;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getToken() {
  const session = await fetchAuthSession();
  return session.tokens.idToken;
}

function buildUrl(path, queryParams) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(`${base}${path}`);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.toString();
}

async function request(method, path, { queryParams, body } = {}) {
  const token = await getToken();
  const url = buildUrl(path, queryParams);

  const options = {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const error = new Error(errorText || `HTTP ${response.status}`);
    error.status = response.status;
    error.response = response;
    throw error;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticated GET.
 * @param {string} path             API path relative to VITE_API_ENDPOINT.
 * @param {object} [queryParams]    Key/value pairs appended as query string.
 */
export function apiGet(path, queryParams) {
  return request("GET", path, { queryParams });
}

/**
 * Authenticated POST.
 * @param {string} path             API path relative to VITE_API_ENDPOINT.
 * @param {object} [body]           Request body (JSON-serialised).
 * @param {object} [queryParams]    Key/value pairs appended as query string.
 */
export function apiPost(path, body, queryParams) {
  return request("POST", path, { body, queryParams });
}

/**
 * Authenticated PUT.
 * @param {string} path             API path relative to VITE_API_ENDPOINT.
 * @param {object} [body]           Request body (JSON-serialised).
 * @param {object} [queryParams]    Key/value pairs appended as query string.
 */
export function apiPut(path, body, queryParams) {
  return request("PUT", path, { body, queryParams });
}

/**
 * Authenticated DELETE.
 * @param {string} path             API path relative to VITE_API_ENDPOINT.
 * @param {object} [queryParams]    Key/value pairs appended as query string.
 */
export function apiDelete(path, queryParams) {
  return request("DELETE", path, { queryParams });
}

/**
 * Returns the current user's Amplify id-token string.
 * Useful for callers that need to pass it directly (e.g. Socket.IO auth).
 */
export async function getAuthToken() {
  return getToken();
}
