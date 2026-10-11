// Login.jsx: Staff sign-in page with quiet-luxury styling
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../utils/constants.js";
import { MESSAGES } from "../utils/messages.js";
import { homePathFor } from "../utils/routePaths.js";
import Button from "../Components/Common/Button.jsx";
import ErrorMessage from "../Components/Common/ErrorMessage.jsx";

export const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const user = await login(email.trim(), password);
      navigate(homePathFor(user.role), { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setError(MESSAGES.auth.invalid);
      } else if (status === 400) {
        setError(MESSAGES.auth.required);
      } else {
        setError(MESSAGES.auth.unavailable);
      }
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="form-card">
        <h1 className="form-card-title">{APP_NAME}</h1>
        <p className="form-card-subtitle">{MESSAGES.auth.title}</p>

        <form onSubmit={handleSubmit} noValidate>
          <ErrorMessage>{error}</ErrorMessage>

          <div className="field">
            <label className="field-label" htmlFor="login-email">
              {MESSAGES.auth.email}
            </label>
            <input
              id="login-email"
              className="field-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              {MESSAGES.auth.password}
            </label>
            <input
              id="login-password"
              className="field-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={submitting}
          >
            {submitting ? MESSAGES.auth.submitting : MESSAGES.auth.submit}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;
