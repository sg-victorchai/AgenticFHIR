import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { oidcSettings, signIn } from '../services/auth/oidc';

// Returns true if the authority URL is likely using a self-signed certificate
// (IP-based hostnames or dynamic DNS services like sslip.io, nip.io, xip.io)
function isSelfSignedAuthority(authority: string): boolean {
  try {
    const { hostname } = new URL(authority);
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
    return /\.(sslip\.io|nip\.io|xip\.io)$/.test(hostname);
  } catch {
    return false;
  }
}

const CertWarningModal: React.FC<{
  authorityUrl: string;
  onProceed: () => void;
  onCancel: () => void;
}> = ({ authorityUrl, onProceed, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Security Certificate Warning</h2>
          <p className="text-sm text-gray-600 mt-1">
            The sign-in service uses a self-signed certificate. Mobile browsers may block this without letting you proceed.
          </p>
        </div>
      </div>

      <ol className="text-sm text-gray-700 space-y-3 mb-5 list-none">
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
          <span>
            Tap <strong>Open Identity Provider</strong> below. When your browser shows a security warning, tap <strong>Advanced → Proceed</strong> (or <strong>Accept</strong>).
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
          <span>Return to this tab and tap <strong>Proceed to Sign In</strong>.</span>
        </li>
      </ol>

      <a
        href={authorityUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-2 px-4 rounded-lg transition duration-200 mb-3 text-sm"
      >
        Open Identity Provider
      </a>
      <button
        type="button"
        onClick={onProceed}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200 mb-3 text-sm"
      >
        Proceed to Sign In
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-full text-gray-500 hover:text-gray-700 text-sm py-1"
      >
        Cancel
      </button>
    </div>
  </div>
);

const LoginPage: React.FC = () => {
  const authError = useSelector((state: RootState) => state.auth.error);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCertWarning, setShowCertWarning] = useState(false);

  const selfSigned = isSelfSignedAuthority(oidcSettings.authority);

  const doSignIn = async () => {
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

  const handleLoginClick = () => {
    if (selfSigned) {
      setShowCertWarning(true);
    } else {
      void doSignIn();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      {showCertWarning && (
        <CertWarningModal
          authorityUrl={oidcSettings.authority}
          onProceed={() => {
            setShowCertWarning(false);
            void doSignIn();
          }}
          onCancel={() => setShowCertWarning(false)}
        />
      )}

      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Semantic Agents Platform
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
            onClick={handleLoginClick}
            disabled={isRedirecting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
          >
            {isRedirecting
              ? 'Redirecting to sign in…'
              : 'Sign in to your Identity Provider'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
