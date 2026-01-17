import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const fetchOverview = () => api.get('/api/analytics/overview').then(res => res.data);
export const searchLogs = (params) => api.get('/api/analytics/search', { params }).then(res => res.data);
export const fetchUserActivity = (uid, params = {}) =>
  api.get('/api/analytics/activity', { params: { uid, ...params } }).then(res => res.data);
export const fetchSuspicious = () => api.get('/api/analytics/suspicious').then(res => res.data);
export const fetchApplications = () => api.get('/api/analytics/applications').then(res => res.data);

export default api;
