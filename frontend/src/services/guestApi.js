// guestApi.js: Configured Axios HTTP client instance for guest session requests
import axios from 'axios';
import { STORAGE_KEYS, EVENTS } from '../utils/constants.js';
import { endedCodeOf } from '../utils/guestSession.js';

const guestApi = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

guestApi.interceptors.request.use(
  (config) => {
    const token = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(STORAGE_KEYS.GUEST_TOKEN)
      : null;
    if (token) {
      config.headers = config.headers || {};
      if (typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

guestApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = endedCodeOf(error);
    if (code) {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEYS.GUEST_TOKEN);
      }
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(EVENTS.GUEST_ENDED, { detail: { code } }));
      }
    }
    return Promise.reject(error);
  }
);

export default guestApi;
