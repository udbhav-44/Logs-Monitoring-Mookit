import axios from 'axios';

const fallbackHost = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5002`
  : 'http://localhost:5002';

const API_BASE = import.meta.env.VITE_API_BASE_URL || fallbackHost;

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
