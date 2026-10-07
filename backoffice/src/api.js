import axios from 'axios';
import { setTrialDays } from './lib';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'X-Formely-Client': 'backoffice',
  },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Sesiune expirată / cont blocat: AuthProvider trimite operatorul la login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || '');
    if (error.response?.status === 401 && !url.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('bo:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export async function csrf() {
  await api.get('/csrf-cookie');
}

export const platform = {
  login: async (email, password) => {
    await csrf();
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },
  me: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },
  logout: async () => {
    await csrf();
    await api.post('/auth/logout');
  },
  overview: async () => (await api.get('/platform/overview')).data,
  plans: async () => {
    const { data } = await api.get('/platform/plans');
    setTrialDays(data?.trial_days);
    return data;
  },
  companies: async (params) => (await api.get('/platform/companies', { params })).data,
  company: async (id) => (await api.get(`/platform/companies/${id}`)).data,
  createCompany: async (payload) => (await api.post('/platform/companies', payload)).data,
  updateCompany: async (id, payload) => (await api.put(`/platform/companies/${id}`, payload)).data,
  deleteCompany: async (id, confirmSlug) => (
    await api.delete(`/platform/companies/${id}`, { data: { confirm_slug: confirmSlug } })
  ).data,
  inviteOwner: async (id, payload) => (await api.post(`/platform/companies/${id}/invite-owner`, payload)).data,
  leads: async (params) => (await api.get('/platform/leads', { params })).data,
  siteStats: async (days) => (await api.get('/platform/site-stats', { params: { days } })).data,
  updateLead: async (id, payload) => (await api.put(`/platform/leads/${id}`, payload)).data,
  convertLead: async (id, payload = {}) => (
    await api.post(`/platform/leads/${id}/convert`, payload)
  ).data,
  activityLogs: async (params) => (await api.get('/platform/activity-logs', { params })).data,
};

export default api;
