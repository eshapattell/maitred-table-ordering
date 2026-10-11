// ProtectedRoute.jsx: Route guard checking authentication status and role access
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROUTE_PATHS, homePathFor } from "../utils/routePaths.js";
import Loader from "../Components/Common/Loader.jsx";

export const ProtectedRoute = ({ roles, children }) => {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <Loader />;
  }

  if (status !== "authenticated" || !user) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return children;
};

export default ProtectedRoute;
