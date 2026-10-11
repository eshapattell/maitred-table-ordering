// ScanLanding.jsx: Placeholder page for guest table scan landing
import React from "react";
import { APP_NAME } from "../utils/constants.js";
import { MESSAGES } from "../utils/messages.js";

export const ScanLanding = () => (
  <div className="page-content">
    <h1 className="page-title">{APP_NAME}</h1>
    <p className="page-lead">{MESSAGES.common.comingSoon}</p>
  </div>
);

export default ScanLanding;
