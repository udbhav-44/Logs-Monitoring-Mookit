import axios from 'axios';

// Get base URL dynamically
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5002`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const fetchOverview = (params = {}) =>
  api.get('/api/analytics/overview', { params }).then(res => ({ data: res.data, status: res.status }));

export const searchLogs = (params) => api.get('/api/analytics/search', { params }).then(res => res.data);

export const fetchUserActivity = (uid, params = {}) =>
  api.get('/api/analytics/activity', { params: { uid, ...params } }).then(res => res.data);

export const fetchUids = (params = {}) => api.get('/api/analytics/uids', { params }).then(res => res.data);

export const fetchSuspicious = (params = {}) => api.get('/api/analytics/suspicious', { params }).then(res => res.data);

export const fetchApplications = (params = {}) =>
  api.get('/api/analytics/applications', { params }).then(res => ({ data: res.data, status: res.status }));

export const fetchFilters = () => api.get('/api/analytics/filters').then(res => res.data);

export default api;

export const deletePartition = (vmId, app, month) => {
  return api.delete('/api/data/partition', { data: { vmId, app, month } });
};
