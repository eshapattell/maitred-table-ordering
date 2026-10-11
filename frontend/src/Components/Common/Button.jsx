// Button.jsx: Interactive button component with primary and ghost variants
import React from "react";

export const Button = ({
  variant = "primary",
  loading = false,
  disabled = false,
  type = "button",
  onClick,
  children,
  className = "",
  ...props
}) => {
  const isDisabled = disabled || loading;
  const variantClass = variant === "ghost" ? "btn--ghost" : "btn--primary";
  const combinedClassName = `btn ${variantClass} ${className}`.trim();

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
      onClick={isDisabled ? undefined : onClick}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
