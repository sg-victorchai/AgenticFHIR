import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Patient } from 'fhir/r5';
import { useSearchPatientsQuery } from '../../services/fhir/client';
import { setRole } from '../../store/slices/uiSlice';
import { getOperationOutcomeMessage } from '../../utils/fhirError';
import { getRecentPatients } from '../../utils/recentPatients';

const patientDisplayName = (patient: Patient) => {
  const name = patient.name?.[0];
  return (
    name?.text ||
    [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') ||
    'Unknown patient'
  );
};

export const AiConsultPatientPicker: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Digits suggest an MRN/identifier; otherwise search by name.
  const searchParams: Record<string, string> = /\d/.test(debouncedTerm)
    ? { identifier: debouncedTerm }
    : { 'name:contains': debouncedTerm };
  const { data, isFetching, error } = useSearchPatientsQuery(searchParams, {
    skip: !isOpen || debouncedTerm.length < 2,
  });
  const results = (data?.entry ?? [])
    .map((entry) => entry.resource as Patient)
    .filter((patient) => patient?.id);
  const recentPatients = isOpen ? getRecentPatients() : [];

  if (!isOpen) return null;

  const openConsult = (patientId: string) => {
    dispatch(setRole('clinician'));
    onClose();
    navigate(`/patient/${patientId}/records?consult=1`);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 sm:items-start sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consult-picker-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2
              id="ai-consult-picker-title"
              className="text-base font-semibold text-gray-900"
            >
              Start AI Consult
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Choose a patient. Their records open with the AI Consult panel
              ready.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-2xl text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="border-b border-gray-100 px-5 py-3">
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by patient name or MRN…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {debouncedTerm.length >= 2 ? (
            isFetching ? (
              <p className="px-3 py-4 text-sm text-gray-500">Searching…</p>
            ) : error ? (
              <p className="mx-3 my-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {getOperationOutcomeMessage(error) ||
                  'Unable to search patients.'}
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">
                No patients match “{debouncedTerm}”.
              </p>
            ) : (
              results.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => openConsult(patient.id!)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {patientDisplayName(patient)}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[
                        patient.identifier?.[0]?.value,
                        patient.gender,
                        patient.birthDate,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-indigo-600">
                    Consult →
                  </span>
                </button>
              ))
            )
          ) : recentPatients.length > 0 ? (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Recent patients
              </p>
              {recentPatients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => openConsult(patient.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-indigo-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {patient.name}
                    </span>
                    {patient.mrn && (
                      <span className="block text-xs text-gray-500">
                        {patient.mrn}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-indigo-600">
                    Consult →
                  </span>
                </button>
              ))}
            </>
          ) : (
            <p className="px-3 py-4 text-sm text-gray-500">
              Type at least 2 characters to search. Patients you open will
              appear here for quick access.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AiConsultPatientPicker;
