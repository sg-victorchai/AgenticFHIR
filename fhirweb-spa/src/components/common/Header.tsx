import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { clearRole } from '../../store/slices/uiSlice';

const Header: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSelector(
    (state: RootState) => state.auth,
  );
  const role = useSelector((state: RootState) => state.ui.role);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearRole());
    navigate('/login');
  };

  const getRoleLabel = () => {
    if (!role) return '';
    return role === 'psa'
      ? 'PSA'
      : role === 'clinician'
        ? 'Clinician'
        : role === 'CARE_COORDINATOR'
          ? 'Care Coordinator'
          : 'Patient';
  };

  return (
    <header className="bg-blue-600 shadow-md">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center gap-3">
          {/* Left: Logo + Current User */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-white text-lg md:text-xl font-bold whitespace-nowrap"
            >
              HealthConnect
            </Link>
            {isAuthenticated && (
              <span className="text-white text-xs md:text-sm font-medium truncate">
                {user?.name || 'User'}
                {role && (
                  <span className="text-blue-200"> [{getRoleLabel()}]</span>
                )}
              </span>
            )}
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex">
            <ul className="flex space-x-4 text-white items-center">
              <li>
                <Link to="/" className="hover:text-blue-200 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/events"
                  className="hover:text-blue-200 transition-colors"
                >
                  Events
                </Link>
              </li>
              <li>
                <Link
                  to="/webhooks"
                  className="hover:text-blue-200 transition-colors"
                >
                  Webhooks
                </Link>
              </li>
              {isAuthenticated ? (
                <>
                  <li>
                    <Link
                      to="/dashboard"
                      className="hover:text-blue-200 transition-colors"
                    >
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <button
                      onClick={handleLogout}
                      className="hover:text-blue-200 transition-colors"
                    >
                      Logout
                    </button>
                  </li>
                </>
              ) : (
                <li>
                  <Link
                    to="/login"
                    className="hover:text-blue-200 transition-colors"
                  >
                    Login
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          {/* Mobile: Menu Dropdown */}
          <div className="md:hidden flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-white hover:text-blue-200 p-2 rounded transition-colors"
                title="Menu"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-blue-700 rounded-lg shadow-lg z-50">
                  <nav className="flex flex-col">
                    <Link
                      to="/"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-white hover:bg-blue-800 transition-colors rounded-t-lg"
                    >
                      Home
                    </Link>
                    <Link
                      to="/events"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-white hover:bg-blue-800 transition-colors"
                    >
                      Events
                    </Link>
                    <Link
                      to="/webhooks"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-white hover:bg-blue-800 transition-colors"
                    >
                      Webhooks
                    </Link>
                    {isAuthenticated && (
                      <>
                        <Link
                          to="/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="px-4 py-2 text-white hover:bg-blue-800 transition-colors border-t border-blue-600"
                        >
                          Dashboard
                        </Link>
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            handleLogout();
                          }}
                          className="px-4 py-2 text-white hover:bg-blue-800 transition-colors text-left rounded-b-lg"
                        >
                          Logout
                        </button>
                      </>
                    )}
                  </nav>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
