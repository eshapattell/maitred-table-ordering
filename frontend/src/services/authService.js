// authService.js: Authentication API endpoints
import api from "./api.js";

export const login = async (email, password) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data; // { token, user }
};

export const fetchCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data.user;
};
