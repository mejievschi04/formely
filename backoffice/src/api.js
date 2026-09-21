import axios from 'axios';

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
  plans: async () => (await api.get('/platform/plans')).data,
  companies: async (params) => (await api.get('/platform/companies', { params })).data,
  company: async (id) => (await api.get(`/platform/companies/${id}`)).data,
  createCompany: async (payload) => (await api.post('/platform/companies', payload)).data,
  updateCompany: async (id, payload) => (await api.put(`/platform/companies/${id}`, payload)).data,
  inviteOwner: async (id, payload) => (await api.post(`/platform/companies/${id}/invite-owner`, payload)).data,
  leads: async (params) => (await api.get('/platform/leads', { params })).data,
  updateLead: async (id, payload) => (await api.put(`/platform/leads/${id}`, payload)).data,
};

export default api;
