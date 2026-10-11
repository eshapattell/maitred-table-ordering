// KitchenDashboard.jsx: Placeholder page for kitchen display
import React from "react";
import { MESSAGES } from "../utils/messages.js";

export const KitchenDashboard = () => (
  <div className="page-content">
    <h1 className="page-title">{MESSAGES.nav.kitchen}</h1>
    <p className="page-lead">{MESSAGES.common.comingSoon}</p>
  </div>
);

export default KitchenDashboard;
