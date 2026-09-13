import React, { useEffect } from 'react';
import { oidcUserManager } from '../services/auth/oidc';

const SilentRenewPage: React.FC = () => {
  useEffect(() => {
    void oidcUserManager.signinSilentCallback().catch((error) => {
      console.error('OIDC silent renewal callback failed:', error);
    });
  }, []);

  return null;
};

export default SilentRenewPage;
