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
  withXSRFToken: true, // trimite X-XSRF-TOKEN din cookie (Laravel Sanctum SPA + CSRF)
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || "10000"), // 10 secunde timeout default
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/** Înainte de POST stateful (login, logout, …): setează cookie-ul XSRF (ruta e în api.php + middleware web). */
export async function ensureApiCsrfCookie() {
  await api.get("/csrf-cookie");
}

function clearXsrfHeaderFromConfig(config) {
  if (!config?.headers) return;
  const h = config.headers;
  if (typeof h.delete === "function") {
    h.delete("X-XSRF-TOKEN");
    h.delete("x-xsrf-token");
  } else {
    delete h["X-XSRF-TOKEN"];
    delete h["x-xsrf-token"];
    if (h.common) {
      delete h.common["X-XSRF-TOKEN"];
      delete h.common["x-xsrf-token"];
    }
  }
}

// Interceptor pentru request-uri
api.interceptors.request.use(
  (config) => {
    // If data is FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    // Don't log /auth/me requests (they're called frequently and 401 is normal when not authenticated)
    if (config.url !== '/auth/me') {
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
    // Don't log /auth/me responses (they're called frequently)
    if (response.config?.url !== '/auth/me') {
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
      url !== '/csrf-cookie'
    ) {
      config._csrfRetry = true;
      try {
        await api.get('/csrf-cookie');
        // Fără asta, retry poate păstra X-XSRF-TOKEN vechi; cookie-ul e deja actualizat
        clearXsrfHeaderFromConfig(config);
        return api.request(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    const isAuthMe401 = error.response?.status === 401 && error.config?.url === '/auth/me';
    const status = error.response?.status;
    const is5xx = status >= 500 && status < 600;
    const isNetwork = error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';

    if (!isAuthMe401) {
      logger.api.error('API Response Error:', error);
      if (error.code === 'ECONNABORTED') {
        logger.api.error('Request timeout - serverul nu răspunde');
      } else if (error.code === 'ERR_NETWORK') {
        logger.api.error('Network error - verifică dacă backend-ul rulează');
      } else if (error.response) {
        logger.api.error('Server error:', error.response.status, error.response.data);
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
