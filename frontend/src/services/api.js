import axios from "axios";
import { ENVIRONMENT } from "../environment.example.js";

const API_BASE_URL = ENVIRONMENT.API_BASE_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// === Auth API ===
export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  logout: () => api.post("/auth/logout"),
  checkAuth: () => api.get("/auth/check"),
  getProfile: () => api.get("/auth/me"),
};

// === Projects API ===
export const projectsAPI = {
  getAll: () => api.get("/projects"),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post("/projects", data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  uploadFile: (id, formData) =>
    api.post(`/projects/${id}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// === Annotations API ===
export const annotationsAPI = {
  getByProject: (projectId) => api.get(`/annotations/project/${projectId}`),
  getByFile: (fileId) => api.get(`/annotations/file/${fileId}`),
  create: (data) => api.post("/annotations", data),
  update: (id, data) => api.put(`/annotations/${id}`, data),
  delete: (id) => api.delete(`/annotations/${id}`),
};

// === Q&A API ===
export const qaAPI = {
  getByProject: (projectId) => api.get(`/qa/project/${projectId}`),
  create: (data) => api.post("/qa", data),
  answer: (id, data) => api.put(`/qa/${id}/answer`, data),
  delete: (id) => api.delete(`/qa/${id}`),
};

// === Discussions API ===
export const discussionsAPI = {
  getByProject: (projectId) => api.get(`/discussions/project/${projectId}`),
  create: (data) => api.post("/discussions", data),
  delete: (id) => api.delete(`/discussions/${id}`),
};

// === AI Design Assistant API ===
export const aiDesignAPI = {
  analyzeProject: (projectId) => api.post(`/ai-design/analyze/${projectId}`),
  generateColorPalette: (projectId, data) =>
    api.post(`/ai-design/color-palette/${projectId}`, data),
  getMaterialRecommendations: (projectId, data) =>
    api.post(`/ai-design/material-recommendations/${projectId}`, data),
  getCostEstimate: (projectId, data) =>
    api.post(`/ai-design/cost-estimate/${projectId}`, data),
  quickSuggestion: (question) =>
    api.post("/ai-design/quick-suggestion", { question }),
};

export default api;
