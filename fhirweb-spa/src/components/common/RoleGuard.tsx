import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { UserRole } from '../../store/slices/uiSlice';

interface RoleGuardProps {
  allowed: UserRole[];
  children: React.ReactNode;
}

const RoleGuard: React.FC<RoleGuardProps> = ({ allowed, children }) => {
  const role = useSelector((state: RootState) => state.ui.role);

  if (!role) {
    return <Navigate to="/" replace />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/queue" replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
