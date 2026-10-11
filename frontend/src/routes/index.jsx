// index.jsx: Main route switchboard using React Router useRoutes
import React from "react";
import { useRoutes, Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROUTE_PATHS, homePathFor } from "../utils/routePaths.js";
import { MESSAGES } from "../utils/messages.js";
import Loader from "../Components/Common/Loader.jsx";
import Login from "../pages/Login.jsx";
import ownerRoutes from "./ownerRoutes.jsx";
import kitchenRoutes from "./kitchenRoutes.jsx";
import customerRoutes from "./customerRoutes.jsx";

const HomeRedirect = () => {
  const { status, user } = useAuth();
  if (status === "loading") {
    return <Loader />;
  }
  if (status === "authenticated" && user) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
};

const LoginRoute = () => {
  const { status, user } = useAuth();
  if (status === "loading") {
    return <Loader />;
  }
  if (status === "authenticated" && user) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return <Login />;
};

const NotFound = () => (
  <div className="not-found">
    <p>{MESSAGES.common.notFound}</p>
    <Link to={ROUTE_PATHS.HOME}>{MESSAGES.common.backHome}</Link>
  </div>
);

export const AppRoutes = () => {
  const routes = useRoutes([
    {
      path: ROUTE_PATHS.HOME,
      element: <HomeRedirect />,
    },
    {
      path: ROUTE_PATHS.LOGIN,
      element: <LoginRoute />,
    },
    ...ownerRoutes,
    ...kitchenRoutes,
    ...customerRoutes,
    {
      path: "*",
      element: <NotFound />,
    },
  ]);

  return routes;
};

export default AppRoutes;
