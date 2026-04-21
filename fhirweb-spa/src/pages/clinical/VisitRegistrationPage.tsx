import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useGetPatientQuery,
  useCreateResourceMutation,
} from '../../services/fhir/client';
import { Encounter } from 'fhir/r5';

const COMMON_COMPLAINTS = [
  'Shortness of breath',
  'Chest pain',
  'Fever',
  'Headache',
  'Abdominal pain',
  'Cough',
  'Dizziness',
  'Palpitations',
  'Swelling of legs',
  'Back pain',
  'Nausea / vomiting',
  'Other',
];

const localNow = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

const toFHIRDateTime = (localDT: string): string => {
  const d = new Date(localDT);
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const h = String(Math.abs(Math.floor(off / 60))).padStart(2, '0');
  const m = String(Math.abs(off % 60)).padStart(2, '0');
  return `${localDT}:00${sign}${h}:${m}`;
};

const VisitRegistrationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: patient, isLoading: patientLoading } = useGetPatientQuery(id!);
  const [createResource, { isLoading: isCreating }] =
    useCreateResourceMutation();

  const [formData, setFormData] = useState({
    chiefComplaint: '',
    customComplaint: '',
    visitDate: localNow(),
    visitType: 'AMB',
  });
  const [error, setError] = useState('');

  const patientName = patient
    ? patient.name?.[0]?.text ||
      [
        patient.name?.[0]?.prefix?.join(' '),
        patient.name?.[0]?.given?.join(' '),
        patient.name?.[0]?.family,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const effectiveComplaint =
    formData.chiefComplaint === 'Other'
      ? formData.customComplaint
      : formData.chiefComplaint;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!effectiveComplaint.trim()) {
      setError('Please enter a chief complaint.');
      return;
    }

    const encounter: Encounter = {
      resourceType: 'Encounter',
      status: 'in-progress',
      class: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: formData.visitType,
              display:
                formData.visitType === 'AMB' ? 'ambulatory' : 'emergency',
            },
          ],
        },
      ],
      type: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '185345009',
              display: 'Encounter for symptom',
            },
          ],
          text: 'Outpatient Visit',
        },
      ],
      subject: { reference: `Patient/${id}`, display: patientName },
      actualPeriod: { start: toFHIRDateTime(formData.visitDate) },
      reason: [
        {
          value: [{ concept: { text: effectiveComplaint.trim() } }],
        },
      ],
    };

    const result = await createResource({
      resourceType: 'Encounter',
      resource: encounter as any,
    });
    if ('data' in result && result.data?.id) {
      navigate(`/patient/${id}/encounter/${result.data.id}/consult`);
    } else {
      setError('Failed to register visit. Please try again.');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
        <Link to="/patients" className="hover:text-blue-600 transition-colors">
          Patients
        </Link>
        <span>/</span>
        <Link
          to={`/patient/${id}/details`}
          className="hover:text-blue-600 transition-colors"
        >
          {patientName || id}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Register Visit</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        Register Outpatient Visit
      </h1>

      {/* Patient Banner */}
      {patientLoading ? (
        <div className="animate-pulse bg-gray-100 h-20 rounded-lg mb-6" />
      ) : patient ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-4">
          <div className="bg-blue-600 rounded-full h-12 w-12 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {patientName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-lg">
              {patientName}
            </div>
            <div className="text-sm text-gray-500">
              DOB: {patient.birthDate || 'Unknown'} &middot;{' '}
              {patient.gender
                ? patient.gender.charAt(0).toUpperCase() +
                  patient.gender.slice(1)
                : 'Unknown'}{' '}
              &middot; ID: {patient.identifier?.[0]?.value || patient.id}
            </div>
          </div>
          <div className="ml-auto">
            <Link
              to={`/patient/${id}/details`}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              View Profile
            </Link>
          </div>
        </div>
      ) : null}

      {/* Registration Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Visit Details
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Visit Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visit Type
            </label>
            <div className="flex gap-4">
              {[
                { code: 'AMB', label: 'Outpatient / Ambulatory' },
                { code: 'EMER', label: 'Emergency' },
              ].map((vt) => (
                <label
                  key={vt.code}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="visitType"
                    value={vt.code}
                    checked={formData.visitType === vt.code}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, visitType: e.target.value }))
                    }
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{vt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Chief Complaint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chief Complaint <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={formData.chiefComplaint}
              onChange={(e) =>
                setFormData((f) => ({ ...f, chiefComplaint: e.target.value }))
              }
            >
              <option value="">— Select or type below —</option>
              {COMMON_COMPLAINTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {formData.chiefComplaint === 'Other' || !formData.chiefComplaint ? (
              <input
                type="text"
                placeholder="Describe chief complaint..."
                className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={
                  formData.chiefComplaint === 'Other'
                    ? formData.customComplaint
                    : ''
                }
                onChange={(e) => {
                  if (formData.chiefComplaint === 'Other') {
                    setFormData((f) => ({
                      ...f,
                      customComplaint: e.target.value,
                    }));
                  } else {
                    setFormData((f) => ({
                      ...f,
                      chiefComplaint: e.target.value,
                    }));
                  }
                }}
              />
            ) : null}
          </div>

          {/* Visit Date & Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Visit Date &amp; Time
            </label>
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={formData.visitDate}
              onChange={(e) =>
                setFormData((f) => ({ ...f, visitDate: e.target.value }))
              }
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 rounded-md p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isCreating}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md disabled:opacity-50 transition-colors"
            >
              {isCreating
                ? 'Registering...'
                : 'Register & Start Clinical Consult'}
            </button>
            <Link
              to={`/patient/${id}/details`}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-md transition-colors inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VisitRegistrationPage;
