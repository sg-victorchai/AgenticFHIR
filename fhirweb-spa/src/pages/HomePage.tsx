import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getPatientContext,
  isSMARTContext,
} from '../services/fhir/smartClient';
import { useFHIR } from '../contexts/FHIRContext';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { client, isLoading: clientLoading } = useFHIR();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const loadPatientContext = async () => {
      // Only auto-redirect if we're in a SMART context and client is ready
      if (!isSMARTContext() || !client) {
        return;
      }

      setIsRedirecting(true);
      try {
        const { patientId } = await getPatientContext();
        navigate(`/patient/${patientId}`);
      } catch (error) {
        console.error('Error loading patient context:', error);
        setIsRedirecting(false);
      }
    };

    loadPatientContext();
  }, [navigate, client]);

  if (clientLoading || isRedirecting) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="ml-4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-3xl font-bold mb-6">FHIR Web Application</h1>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Welcome to the FHIR Web Application
        </h2>
        <p className="mb-4">
          This application demonstrates integration with FHIR APIs to access and
          manage healthcare data.
        </p>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <p className="text-blue-700">
            Use the navigation to explore patient data and related resources.
          </p>
        </div>

        <div className="mt-6">
          <Link
            to="/patients"
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition duration-300"
          >
            Search Patients
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Encounters</h3>
          <p className="text-gray-600 mb-3">View visits for patients</p>
          <span className="text-gray-400">Select a patient first →</span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Observations</h3>
          <p className="text-gray-600 mb-3">
            Access clinical observations and measurements
          </p>
          <span className="text-gray-400">Select a patient first →</span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Medication Requests</h3>
          <p className="text-gray-600 mb-3">View prescribed medications</p>
          <span className="text-gray-400">Select a patient first →</span>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Care Plans</h3>
          <p className="text-gray-600 mb-3">
            View care plans associated with patients
          </p>
          <span className="text-gray-400">Select a patient first →</span>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
