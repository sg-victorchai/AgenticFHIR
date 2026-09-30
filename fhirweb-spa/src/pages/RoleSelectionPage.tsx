import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import FHIR from 'fhirclient';
import { setRole } from '../store/slices/uiSlice';
import { useFHIR } from '../contexts/FHIRContext';
import { RootState } from '../store';

const SMART_PATIENT_ID_KEY = 'smartPatientId';

const roles = [
  {
    id: 'psa' as const,
    title: 'Patient Service Assistant',
    subtitle: 'Front Desk & Registration',
    description: 'Register new patients, search records, schedule visits, and manage patient intake workflows.',
    features: ['Patient registration', 'Appointment scheduling', 'Record lookup'],
    color: 'blue',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    id: 'clinician' as const,
    title: 'Clinician',
    subtitle: 'Clinical Consultation & Documentation',
    description: 'Access patient queue, conduct AI-assisted consultations, review records, and document clinical findings.',
    features: ['Patient queue', 'AI-assisted review', 'Clinical documentation'],
    color: 'emerald',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  {
    id: 'CARE_COORDINATOR' as const,
    title: 'Care Manager',
    subtitle: 'Population Health & Care Gaps',
    description: 'Run AI care-gap agents, track intervention missions, review generated care plans, and manage population health programs.',
    features: ['Care gap analysis', 'AI mission tracking', 'Care plan review'],
    color: 'amber',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    id: 'patient' as const,
    title: 'Patient Portal',
    subtitle: 'Your Personal Health Space',
    description: 'View your health records, upload and scan medical reports with AI extraction, and get personalised health insights.',
    features: ['Health records', 'AI document upload', 'Health insights'],
    color: 'violet',
    iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  },
];

const colorMap = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',   hover: 'hover:border-blue-500 hover:bg-blue-50',   icon: 'bg-blue-100 text-blue-600',    badge: 'bg-blue-100 text-blue-700',    btn: 'bg-blue-600 hover:bg-blue-700',    ring: 'focus:ring-blue-400'    },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', hover: 'hover:border-emerald-500 hover:bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700', ring: 'focus:ring-emerald-400' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',  hover: 'hover:border-amber-500 hover:bg-amber-50',  icon: 'bg-amber-100 text-amber-600',   badge: 'bg-amber-100 text-amber-700',   btn: 'bg-amber-500 hover:bg-amber-600',   ring: 'focus:ring-amber-400'   },
  violet:  { bg: 'bg-violet-50',  border: 'border-violet-200', hover: 'hover:border-violet-500 hover:bg-violet-50', icon: 'bg-violet-100 text-violet-600',  badge: 'bg-violet-100 text-violet-700',  btn: 'bg-violet-600 hover:bg-violet-700',  ring: 'focus:ring-violet-400'  },
};

const RoleSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isLoading: clientLoading, reinitializeClient } = useFHIR();
  const currentRole = useSelector((state: RootState) => state.ui.role);
  const [isRedirecting, setIsRedirecting] = useState(false);

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
          dispatch(setRole('patient'));
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
    dispatch(setRole(selected));
    if (selected === 'psa') navigate('/patients');
    else if (selected === 'clinician') navigate('/queue');
    else if (selected === 'patient') navigate('/patient-portal');
    else if (selected === 'CARE_COORDINATOR') navigate('/care-coordinator');
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
    <div className="min-h-[80vh] px-4 py-12 bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          AI-Powered Healthcare Platform
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
          Who are you today?
        </h1>
        <p className="text-gray-500 text-lg leading-relaxed">
          HealthConnect serves every stakeholder in your care ecosystem — from front desk to bedside, care management to patient self-service.
        </p>
        {currentRole && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm px-4 py-1.5 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            Last session: <span className="font-semibold text-gray-800 ml-1">{
              currentRole === 'psa' ? 'Patient Service Assistant'
              : currentRole === 'clinician' ? 'Clinician'
              : currentRole === 'CARE_COORDINATOR' ? 'Care Manager'
              : 'Patient Portal'
            }</span>
          </div>
        )}
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-6xl mx-auto">
        {roles.map((role) => {
          const c = colorMap[role.color];
          return (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role.id)}
              className={`group flex flex-col text-left p-6 bg-white border-2 ${c.border} rounded-2xl shadow-sm ${c.hover} transition-all duration-200 focus:outline-none focus:ring-2 ${c.ring}`}
            >
              {/* Icon */}
              <div className={`w-12 h-12 ${c.icon} rounded-xl flex items-center justify-center mb-4 transition-colors`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={role.iconPath} />
                </svg>
              </div>

              {/* Title */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{role.subtitle}</p>
              <h2 className="text-lg font-bold text-gray-900 mb-2">{role.title}</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-4 flex-1">{role.description}</p>

              {/* Feature badges */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {role.features.map((f) => (
                  <span key={f} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>{f}</span>
                ))}
              </div>

              {/* CTA */}
              <div className={`w-full text-center text-sm font-semibold text-white py-2 rounded-lg ${c.btn} transition-colors`}>
                Enter as {role.title.split(' ')[0]} →
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer tagline */}
      <p className="text-center text-xs text-gray-400 mt-10">
        Powered by FHIR R4 · AI-Assisted Clinical Workflows · Secure &amp; Compliant
      </p>
    </div>
  );
};

export default RoleSelectionPage;
