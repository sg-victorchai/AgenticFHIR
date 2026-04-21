import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';

const Header: React.FC = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector(
    (state: RootState) => state.auth,
  );

  const handleLogout = () => {
    dispatch(logout());
  };

  return (
    <header className="bg-blue-600 shadow-md">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link to="/" className="text-white text-xl font-bold">
              FHIR Web App
            </Link>
          </div>

          <nav className="flex">
            <ul className="flex space-x-4 text-white">
              <li>
                <Link to="/" className="hover:text-blue-200 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/patients"
                  className="hover:text-blue-200 transition-colors"
                >
                  Patients
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
                  <li className="ml-2 font-semibold">{user?.name || 'User'}</li>
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
        </div>
      </div>
    </header>
  );
};

export default Header;
