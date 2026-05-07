import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import FHIR from 'fhirclient';
import { setRole } from '../store/slices/uiSlice';
import { useFHIR } from '../contexts/FHIRContext';
import { RootState } from '../store';

const RoleSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading: clientLoading, reinitializeClient } = useFHIR();
  const currentRole = useSelector((state: RootState) => state.ui.role);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Handle SMART on FHIR OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('state')) {
        setIsRedirecting(true);
        try {
          const smartClient = await FHIR.oauth2.ready();
          await reinitializeClient();
          const patientId = smartClient.patient.id;
          navigate(`/patient/${patientId}`);
        } catch (error) {
          console.error('Error handling OAuth callback:', error);
          setIsRedirecting(false);
        }
      }
    };
    handleOAuthCallback();
  }, [navigate, reinitializeClient]);

  const handleSelectRole = (selected: 'psa' | 'clinician') => {
    dispatch(setRole(selected));
    navigate(selected === 'psa' ? '/patients' : '/queue');
  };

  if (clientLoading || isRedirecting) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <p className="ml-4 text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome</h1>
        <p className="text-gray-500 text-lg">Please select your role to continue</p>
        {currentRole && (
          <p className="text-sm text-blue-600 mt-2">
            Currently signed in as:{' '}
            <span className="font-semibold capitalize">
              {currentRole === 'psa' ? 'Patient Service Assistant' : 'Clinician'}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Patient Service Assistant */}
        <button
          onClick={() => handleSelectRole('psa')}
          className="group flex flex-col items-center p-8 bg-white border-2 border-blue-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <div className="w-16 h-16 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center mb-4 transition-colors">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Patient Service Assistant</h2>
          <p className="text-sm text-gray-500 text-center">
            Search patients, register new patients, and schedule visits
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:text-blue-800">
            Continue →
          </span>
        </button>

        {/* Clinician */}
        <button
          onClick={() => handleSelectRole('clinician')}
          className="group flex flex-col items-center p-8 bg-white border-2 border-emerald-200 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <div className="w-16 h-16 bg-emerald-100 group-hover:bg-emerald-200 rounded-full flex items-center justify-center mb-4 transition-colors">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Clinician</h2>
          <p className="text-sm text-gray-500 text-center">
            View patient queue, conduct clinical consultations, and document findings
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:text-emerald-800">
            Continue →
          </span>
        </button>
      </div>
    </div>
  );
};

export default RoleSelectionPage;
