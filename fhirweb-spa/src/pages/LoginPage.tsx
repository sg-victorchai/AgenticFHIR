import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { signIn } from '../services/auth/oidc';

const LoginPage: React.FC = () => {
  const authError = useSelector((state: RootState) => state.auth.error);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setIsRedirecting(true);
    try {
      await signIn();
    } catch (signInError) {
      console.error('Unable to start OIDC sign-in:', signInError);
      setIsRedirecting(false);
      setError('Unable to connect to the sign-in service. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Agents Platform
          </h1>
          <p className="text-gray-600">You ask and agents work for you</p>
        </div>

        {(error || authError === 'Sign-in failed. Please try again.') && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error || authError}
          </div>
        )}
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isRedirecting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
          >
            {isRedirecting
              ? 'Redirecting to sign in…'
              : 'Sign in with fhir4java IdP'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
