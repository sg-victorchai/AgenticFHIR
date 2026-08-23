import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import FHIR from 'fhirclient';
import { setRole } from '../store/slices/uiSlice';
import { useFHIR } from '../contexts/FHIRContext';
import { RootState } from '../store';
import { useSearchPatientsQuery } from '../services/fhir/client';
import { Bundle, Patient as FHIRPatient } from 'fhir/r5';

const SMART_PATIENT_ID_KEY = 'smartPatientId';

const RoleSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading: clientLoading, reinitializeClient } = useFHIR();
  const currentRole = useSelector((state: RootState) => state.ui.role);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showPatientSelector, setShowPatientSelector] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  const patientSearchParams: Record<string, string> = {
    _count: '20',
    _offset: '0',
    ...(patientSearchTerm.trim()
      ? { 'name:contains': patientSearchTerm.trim() }
      : {}),
  };

  const { data: patientBundle, isLoading: patientListLoading } =
    useSearchPatientsQuery(patientSearchParams, {
      skip: !showPatientSelector,
    });

  const patientOptions = (
    (patientBundle as Bundle<FHIRPatient> | undefined)?.entry ?? []
  )
    .filter((entry) => entry.resource?.resourceType === 'Patient')
    .map((entry) => {
      const patient = entry.resource as FHIRPatient;
      const nameObj = patient.name?.[0];
      const name =
        nameObj?.text ||
        [nameObj?.prefix?.join(' '), nameObj?.given?.join(' '), nameObj?.family]
          .filter(Boolean)
          .join(' ') ||
        'Unknown Name';

      return {
        id: patient.id || '',
        name,
        identifier: patient.identifier?.[0]?.value || 'N/A',
      };
    })
    .filter((p) => p.id);

  const roleLabelMap = {
    psa: 'Patient Service Assistant',
    clinician: 'Clinician',
    patient: 'Patient',
    CARE_COORDINATOR: 'Care Coordinator',
  } as const;

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
          if (patientId)
            sessionStorage.setItem(SMART_PATIENT_ID_KEY, patientId);
          // SMART launches are always clinician context → skip role selection
          dispatch(setRole('clinician'));
          navigate(`/patient/${patientId}/records`);
        } catch (error) {
          console.error('Error handling OAuth callback:', error);
          setIsRedirecting(false);
        }
      }
    };
    handleOAuthCallback();
  }, [navigate, reinitializeClient]);

  const handleSelectRole = async (
    selected: 'psa' | 'clinician' | 'patient' | 'CARE_COORDINATOR',
  ) => {
    if (selected === 'psa') {
      dispatch(setRole('psa'));
      setShowPatientSelector(false);
      navigate('/patients');
      return;
    }

    if (selected === 'clinician') {
      dispatch(setRole('clinician'));
      setShowPatientSelector(false);
      navigate('/queue');
      return;
    }

    if (selected === 'patient') {
      setShowPatientSelector(true);
      return;
    }

    if (selected === 'CARE_COORDINATOR') {
      dispatch(setRole('CARE_COORDINATOR'));
      setShowPatientSelector(false);
      navigate('/care-coordinator');
      return;
    }
  };

  const handleSelectPatient = (patientId: string) => {
    sessionStorage.setItem(SMART_PATIENT_ID_KEY, patientId);
    dispatch(setRole('patient'));
    navigate(`/patient/${patientId}/records`);
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
        <p className="text-gray-500 text-lg">
          Please select your role to continue
        </p>
        {currentRole && (
          <p className="text-sm text-blue-600 mt-2">
            Currently signed in as:{' '}
            <span className="font-semibold capitalize">
              {roleLabelMap[currentRole]}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl">
        {/* Patient Service Assistant */}
        <button
          onClick={() => handleSelectRole('psa')}
          className="group flex flex-col items-center p-8 bg-white border-2 border-blue-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <div className="w-16 h-16 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center mb-4 transition-colors">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Patient Service Assistant
          </h2>
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
            <svg
              className="w-8 h-8 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Clinician</h2>
          <p className="text-sm text-gray-500 text-center">
            View patient queue, conduct clinical consultations, and document
            findings
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:text-emerald-800">
            Continue →
          </span>
        </button>

        {/* Patient */}
        <button
          onClick={() => handleSelectRole('patient')}
          className="group flex flex-col items-center p-8 bg-white border-2 border-violet-200 rounded-2xl shadow-sm hover:shadow-md hover:border-violet-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <div className="w-16 h-16 bg-violet-100 group-hover:bg-violet-200 rounded-full flex items-center justify-center mb-4 transition-colors">
            <svg
              className="w-8 h-8 text-violet-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Patient</h2>
          <p className="text-sm text-gray-500 text-center">
            View your queue status and follow your consultation progress
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 group-hover:text-violet-800">
            Continue →
          </span>
        </button>

        {/* Care Coordinator */}
        <button
          onClick={() => handleSelectRole('CARE_COORDINATOR')}
          className="group flex flex-col items-center p-8 bg-white border-2 border-amber-200 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <div className="w-16 h-16 bg-amber-100 group-hover:bg-amber-200 rounded-full flex items-center justify-center mb-4 transition-colors">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Care Coordinator
          </h2>
          <p className="text-sm text-gray-500 text-center">
            Run care-gap agents, track mission status, and review generated
            care plans
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:text-amber-800">
            Continue →
          </span>
        </button>
      </div>

      {showPatientSelector && (
        <div className="w-full max-w-4xl mt-8 bg-white border border-violet-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Select Patient Account
            </h3>
            <button
              onClick={() => setShowPatientSelector(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <input
            type="text"
            placeholder="Search patient name..."
            value={patientSearchTerm}
            onChange={(e) => setPatientSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />

          {patientListLoading && (
            <p className="text-sm text-gray-500">Loading patient list...</p>
          )}

          {!patientListLoading && patientOptions.length === 0 && (
            <p className="text-sm text-gray-500">No patients found.</p>
          )}

          {!patientListLoading && patientOptions.length > 0 && (
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {patientOptions.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient.id)}
                  className="w-full px-4 py-3 text-left hover:bg-violet-50 transition-colors"
                >
                  <p className="font-medium text-gray-800">{patient.name}</p>
                  <p className="text-xs text-gray-500">
                    ID: {patient.identifier} • Resource ID: {patient.id}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoleSelectionPage;
