// ErrorMessage.jsx: Accessible error banner with alert role
import React from "react";

export const ErrorMessage = ({ children }) => {
  if (!children) return null;

  return (
    <div role="alert" className="alert">
      {children}
    </div>
  );
};

export default ErrorMessage;
