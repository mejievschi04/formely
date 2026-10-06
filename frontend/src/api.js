import axios from "axios";
import { logger } from "./utils/logger";

// Get API URL from environment variable, fallback to proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

/** Optional: set by ToastProvider so 5xx/network errors show a toast */
let apiErrorNotifier = null;
export function setApiErrorNotifier(fn) {
  apiErrorNotifier = typeof fn === "function" ? fn : null;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // dacă folosești cookie-uri / sesiuni
  // Headerul X-XSRF-TOKEN e pus explicit mai jos. withXSRFToken citește primul cookie
  // și poate retrimite un token vechi după refresh.
  withXSRFToken: false,
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || "10000"), // 10 secunde timeout default
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/** Ultimul XSRF-TOKEN din document (dacă există duplicate, cel mai recent e de obicei ultimul). */
export function readXsrfToken() {
  if (typeof document === "undefined") return null;
  const matches = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("XSRF-TOKEN="));
  if (!matches.length) return null;
  const raw = matches[matches.length - 1].slice("XSRF-TOKEN=".length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

let csrfRefresh = null;
/** Tokenul plain din sesiune (răspunsul /csrf-cookie). Nu depinde de citirea cookie-ului criptat. */
let csrfToken = null;

function rememberCsrfToken(token) {
  if (typeof token === "string" && token !== "") {
    csrfToken = token;
  }
}

function syncCsrfFromResponse(response) {
  if (!response) return;
  const headers = response.headers;
  const fromHeader = typeof headers?.get === "function"
    ? headers.get("x-csrf-token")
    : headers?.["x-csrf-token"];
  rememberCsrfToken(fromHeader);
  const url = response.config?.url || "";
  if (String(url).includes("csrf-cookie")) {
    rememberCsrfToken(response.data?.token);
  }
}

/** Un singur GET /csrf-cookie în zbor, ca requesturile paralele să nu desincronizeze sesiunea. */
export function refreshApiCsrfCookie() {
  if (!csrfRefresh) {
    csrfRefresh = api.get("/csrf-cookie").then((response) => {
      rememberCsrfToken(response?.data?.token);
      return response;
    }).finally(() => {
      csrfRefresh = null;
    });
  }
  return csrfRefresh;
}

/** Înainte de POST stateful (login, logout, …): ia tokenul plain dacă încă nu e în memorie. */
export async function ensureApiCsrfCookie() {
  if (csrfToken) return;
  await refreshApiCsrfCookie();
}

function applyXsrfHeader(config) {
  const plain = csrfToken;
  const cookieToken = readXsrfToken();
  if (!config || (!plain && !cookieToken)) return;
  config.headers = config.headers || {};
  const set = (name, value) => {
    if (!value) return;
    if (typeof config.headers.set === "function") {
      config.headers.set(name, value);
    } else {
      config.headers[name] = value;
    }
  };
  // X-CSRF-TOKEN e tokenul plain din sesiune. X-XSRF-TOKEN rămâne valoarea din cookie (criptată).
  set("X-CSRF-TOKEN", plain);
  set("X-XSRF-TOKEN", cookieToken);
}

function isUnsafeMethod(method) {
  const normalized = (method || "get").toLowerCase();
  return normalized !== "get" && normalized !== "head" && normalized !== "options";
}

// Interceptor pentru request-uri
api.interceptors.request.use(
  async (config) => {
    // If data is FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    const url = config.url || "";
    if (isUnsafeMethod(config.method) && !String(url).includes("csrf-cookie")) {
      if (!csrfToken) {
        try {
          await refreshApiCsrfCookie();
        } catch {
          /* retry-ul de la 419 reîncearcă refresh-ul */
        }
      }
      applyXsrfHeader(config);
    }
    // Don't log /auth/me requests (they're called frequently and 401 is normal when not authenticated)
    if (config.url !== '/auth/me' && import.meta.env.VITE_ENABLE_API_LOGGING === 'true') {
      logger.api.log('API Request:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    logger.api.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Interceptor pentru răspunsuri
api.interceptors.response.use(
  (response) => {
    syncCsrfFromResponse(response);
    // Don't log /auth/me responses (they're called frequently)
    if (response.config?.url !== '/auth/me' && import.meta.env.VITE_ENABLE_API_LOGGING === 'true') {
      logger.api.log('API Response:', response.status, response.config.url);
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    const url = config?.url || '';
    if (
      error.response?.status === 419 &&
      config &&
      !config._csrfRetry &&
      !String(url).includes('csrf-cookie')
    ) {
      config._csrfRetry = true;
      try {
        syncCsrfFromResponse(error.response);
        rememberCsrfToken(error.response?.data?.csrf_token);
        if (!csrfToken) {
          await refreshApiCsrfCookie();
        }
        applyXsrfHeader(config);
        return api.request(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    // Formely: academia a fost suspendată sau trialul a expirat — înapoi la login cu mesajul serverului.
    if (error.response?.status === 403 && error.response?.data?.company_suspended) {
      try {
        sessionStorage.setItem('formely_login_notice', error.response.data.message || 'Organizația nu este activă.');
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      return Promise.reject(error);
    }

    const isAuthMe401 = error.response?.status === 401 && error.config?.url === '/auth/me';
    const status = error.response?.status;
    const is5xx = status >= 500 && status < 600;
    const isNetwork = error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';

    if (!isAuthMe401) {
      const detail = error.response?.data?.message
        || (error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message);
      if (status >= 500 || isNetwork) {
        logger.api.error('API', status || error.code, url, detail);
      } else if (status && status !== 401) {
        logger.warn('API', status, url, detail);
      }
    }

    // Show toast for 5xx or network errors so user gets feedback
    if (apiErrorNotifier && (is5xx || isNetwork)) {
      let message = 'Eroare la comunicarea cu serverul.';
      if (error.code === 'ECONNABORTED') {
        message = 'Serverul nu răspunde la timp. Încearcă din nou.';
      } else if (error.code === 'ERR_NETWORK') {
        message = 'Eroare de rețea. Verifică conexiunea sau dacă serverul rulează.';
      } else if (is5xx && (error.response?.data?.message || error.response?.data?.error)) {
        message = error.response.data.message || error.response.data.error;
      } else if (is5xx) {
        message = `Eroare server (${status}). Încearcă mai târziu.`;
      }
      try {
        apiErrorNotifier(message, 'error', 6000);
      } catch (e) {
        logger.api.error('apiErrorNotifier failed', e);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
