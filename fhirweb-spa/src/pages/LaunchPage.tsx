import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FHIR from 'fhirclient';

const LaunchPage: React.FC = () => {
  const navigate = useNavigate();
  const [launchError, setLaunchError] = useState<string | null>(null);

  useEffect(() => {
    // SMART on FHIR launch sequence would go here
    const handleLaunch = async () => {
      try {
        // SMART on FHIR authorization with EHR launch
        await FHIR.oauth2.authorize({
          clientId: import.meta.env.VITE_SMART_CLIENT_ID || 'your-client-id',
          scope: 'launch launch/patient patient/*.read openid fhirUser',
          redirectUri: window.location.origin + '/smartapp',
          iss:
            new URLSearchParams(window.location.search).get('iss') || undefined,
          launch:
            new URLSearchParams(window.location.search).get('launch') ||
            undefined,
        });
      } catch (error) {
        console.error('SMART launch error:', error);
        setLaunchError('Failed to initialize SMART on FHIR. Please try again.');
      }
    };

    handleLaunch();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Initializing FHIR Client</h1>

        {launchError ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{launchError}</p>
            <button
              className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Connecting to FHIR server...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default LaunchPage;
