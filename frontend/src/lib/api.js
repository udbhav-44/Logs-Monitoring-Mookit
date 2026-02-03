import axios from 'axios';

const fallbackHost = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5002`
  : 'http://localhost:5002';

const API_BASE = import.meta.env.VITE_API_BASE_URL || fallbackHost;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

export const fetchOverview = (params = {}) =>
  api.get('/api/analytics/overview', { params }).then(res => ({ data: res.data, status: res.status }));
export const searchLogs = (params) => api.get('/api/analytics/search', { params }).then(res => res.data);
export const fetchUserActivity = (uid, params = {}) =>
  api.get('/api/analytics/activity', { params: { uid, ...params } }).then(res => res.data);
export const fetchUids = (params = {}) => api.get('/api/analytics/uids', { params }).then(res => res.data);
export const fetchSuspicious = (params = {}) => api.get('/api/analytics/suspicious', { params }).then(res => res.data);
export const fetchApplications = (params = {}) =>
  api.get('/api/analytics/applications', { params }).then(res => ({ data: res.data, status: res.status }));

export default api;
