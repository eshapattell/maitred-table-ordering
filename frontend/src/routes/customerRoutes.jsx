// customerRoutes.jsx: Public dining customer route configurations
import React from "react";
import { ROUTE_PATHS } from "../utils/routePaths.js";
import ScanLanding from "../pages/ScanLanding.jsx";
import GuestTable from "../pages/GuestTable.jsx";

export const customerRoutes = [
  {
    path: ROUTE_PATHS.GUEST_TABLE,
    element: <ScanLanding />,
  },
  {
    path: ROUTE_PATHS.GUEST_AREA,
    element: <GuestTable />,
  },
];

export default customerRoutes;
