// AuthContext.jsx: Authentication state and lifecycle management
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS, EVENTS } from "../utils/constants.js";
import * as authService from "../services/authService.js";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let ignore = false;
    const token = sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

    if (!token) {
      setStatus("anonymous");
      setUser(null);
      return;
    }

    authService
      .fetchCurrentUser()
      .then((currentUser) => {
        if (!ignore) {
          setUser(currentUser);
          setStatus("authenticated");
        }
      })
      .catch((err) => {
        if (!ignore) {
          // Token is cleared only on 401, preserving it on transient network errors
          if (err?.response?.status === 401) {
            sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          }
          setUser(null);
          setStatus("anonymous");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const handleUnauthorised = () => {
      setUser(null);
      setStatus("anonymous");
    };

    window.addEventListener(EVENTS.UNAUTHORISED, handleUnauthorised);
    return () => {
      window.removeEventListener(EVENTS.UNAUTHORISED, handleUnauthorised);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const data = await authService.login(email, password);
      // Only the token is stored in sessionStorage, never the user object
      sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
      setUser(data.user);
      setStatus("authenticated");
      return data.user;
    } catch (err) {
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = {
    status,
    user,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
