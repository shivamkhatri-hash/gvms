import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { hasLabAccess } from '../../utils/rbac';
import { AccessRestricted } from './AccessRestricted';

interface LabRouteGuardProps {
  labKey: string;
  labName: string;
  children: React.ReactNode;
}

export const LabRouteGuard: React.FC<LabRouteGuardProps> = ({
  labKey,
  labName,
  children,
}) => {
  const { user } = useAuth();

  if (!hasLabAccess(user, labKey)) {
    return <AccessRestricted labName={labName} />;
  }

  return <>{children}</>;
};
