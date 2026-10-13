import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { APP_NAME } from "../../utils/constants.js";
import { MESSAGES } from "../../utils/messages.js";
import { ROUTE_PATHS } from "../../utils/routePaths.js";
import Button from "./Button.jsx";

export const Navbar = () => {
  const { status, user, logout } = useAuth();
  const location = useLocation();
  const isCustomerRoute =
    location.pathname.startsWith("/table") ||
    location.pathname.startsWith("/r/");
  const isAuthenticated =
    !isCustomerRoute && status === "authenticated" && Boolean(user);

  return (
    <header className="navbar-header">
      <nav aria-label="Main" className="navbar">
        {isCustomerRoute ? (
          <span className="navbar-brand">{APP_NAME}</span>
        ) : (
          <Link to={ROUTE_PATHS.HOME} className="navbar-brand">
            {APP_NAME}
          </Link>
        )}

        {isAuthenticated && (
          <div className="navbar-content">
            <div className="navbar-links">
              {user.role === "owner" && (
                <>
                  <NavLink
                    to={ROUTE_PATHS.OWNER_MENU}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link--active" : ""}`
                    }
                  >
                    {MESSAGES.nav.menu}
                  </NavLink>
                  <NavLink
                    to={ROUTE_PATHS.OWNER_TABLES}
                    className={({ isActive }) =>
                      `navbar-link ${isActive ? "navbar-link--active" : ""}`
                    }
                  >
                    {MESSAGES.nav.tables}
                  </NavLink>
                </>
              )}
              {user.role === "kitchen" && (
                <NavLink
                  to={ROUTE_PATHS.KITCHEN}
                  className={({ isActive }) =>
                    `navbar-link ${isActive ? "navbar-link--active" : ""}`
                  }
                >
                  {MESSAGES.nav.kitchen}
                </NavLink>
              )}
            </div>

            <div className="navbar-user">
              <span className="navbar-username">{user.name}</span>
              <span className="navbar-userrole">({user.role})</span>
            </div>

            <Button
              variant="ghost"
              onClick={logout}
              className="navbar-signout"
            >
              {MESSAGES.auth.signOut}
            </Button>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Navbar;
