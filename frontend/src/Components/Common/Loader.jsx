// Loader.jsx: Understated loading indicator with status role
import React from "react";
import { MESSAGES } from "../../utils/messages.js";

export const Loader = () => (
  <div role="status" className="loader">
    <span>{MESSAGES.common.loading}</span>
  </div>
);

export default Loader;
