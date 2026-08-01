import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { OffsetIndexMark } from "./OffsetIndexMark";

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (auth.state.status !== "authenticated") {
    return null;
  }

  const currentDestination = location.pathname.startsWith("/books/")
    ? "Book detail"
    : location.pathname.startsWith("/back-room")
      ? "The Back Room"
    : location.pathname === "/shelf"
      ? "My Shelf"
      : location.pathname === "/preferences"
        ? "Favourite genres"
        : location.pathname === "/account"
          ? "Account"
        : "Catalogue";
  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "nav-link nav-link--active" : "nav-link";

  async function handleSignOut() {
    setSignOutError(false);
    setIsSigningOut(true);

    try {
      await auth.signOut();
      navigate("/sign-in", { replace: true });
    } catch {
      setSignOutError(true);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="wordmark" to="/catalogue">
            <OffsetIndexMark className="wordmark__mark" size={28} />
            <span>Amazon 2.0</span>
          </Link>
          <span className="current-destination">{currentDestination}</span>
          <div className="desktop-header-actions">
            <nav aria-label="Primary navigation" className="primary-nav">
              <NavLink
                className={navClass}
                to="/catalogue"
              >
                Catalogue
              </NavLink>
              <NavLink className={navClass} to="/shelf">
                My Shelf
              </NavLink>
              <NavLink className={navClass} to="/preferences">
                Favourite genres
              </NavLink>
              {auth.state.user.role === "LIBRARIAN" ? (
                <NavLink className={navClass} to="/back-room">
                  Back Room
                </NavLink>
              ) : null}
              <NavLink className={navClass} to="/account">
                Account
              </NavLink>
            </nav>
            <div className="account-actions">
              <span className="account-name">
                <span className="account-name__person">{auth.state.user.displayName}</span>
                <span className="account-name__role">{auth.state.user.role.toLowerCase()}</span>
              </span>
              <button
                className="button button--quiet header-sign-out"
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
                type="button"
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
          <details className="mobile-menu">
            <summary>Menu</summary>
            <div className="mobile-menu__sheet">
              <p className="mobile-menu__user">{auth.state.user.displayName}</p>
              <nav aria-label="Mobile primary navigation">
                <NavLink className={navClass} to="/catalogue">
                  Catalogue
                </NavLink>
                <NavLink className={navClass} to="/shelf">
                  My Shelf
                </NavLink>
                <NavLink className={navClass} to="/preferences">
                  Favourite genres
                </NavLink>
                {auth.state.user.role === "LIBRARIAN" ? (
                  <NavLink className={navClass} to="/back-room">
                    Back Room
                  </NavLink>
                ) : null}
                <NavLink className={navClass} to="/account">
                  Account
                </NavLink>
              </nav>
              <button
                className="button button--quiet"
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
                type="button"
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </details>
        </div>
        {signOutError ? (
          <p className="header-error" role="alert">
            We couldn’t sign you out. Try again.
          </p>
        ) : null}
      </header>
      <Outlet />
    </div>
  );
}
