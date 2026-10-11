// kitchenRoutes.jsx: Route configurations for kitchen display screens
import React from "react";
import { ROUTE_PATHS } from "../utils/routePaths.js";
import ProtectedRoute from "./ProtectedRoute.jsx";
import KitchenDashboard from "../pages/KitchenDashboard.jsx";

export const kitchenRoutes = [
  {
    path: ROUTE_PATHS.KITCHEN,
    element: (
      <ProtectedRoute roles={["kitchen", "owner"]}>
        <KitchenDashboard />
      </ProtectedRoute>
    ),
  },
];

export default kitchenRoutes;
