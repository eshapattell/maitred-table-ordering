// ownerRoutes.jsx: Route configurations for restaurant owner screens
import React from "react";
import { ROUTE_PATHS } from "../utils/routePaths.js";
import ProtectedRoute from "./ProtectedRoute.jsx";
import MenuManager from "../pages/MenuManager.jsx";
import TableManager from "../pages/TableManager.jsx";

export const ownerRoutes = [
  {
    path: ROUTE_PATHS.OWNER_MENU,
    element: (
      <ProtectedRoute roles={["owner"]}>
        <MenuManager />
      </ProtectedRoute>
    ),
  },
  {
    path: ROUTE_PATHS.OWNER_TABLES,
    element: (
      <ProtectedRoute roles={["owner"]}>
        <TableManager />
      </ProtectedRoute>
    ),
  },
];

export default ownerRoutes;
