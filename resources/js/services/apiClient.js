import axios from 'axios';
import { getSetting } from '../db';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
    timeout: 15000,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    withCredentials: false,
});

apiClient.interceptors.request.use(async (config) => {
    const token = await getSetting('api_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default apiClient;
