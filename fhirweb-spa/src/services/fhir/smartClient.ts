import FHIR from 'fhirclient';
import Client from 'fhir-kit-client';

// Check if we're in a SMART context
export const isSMARTContext = (): boolean => {
  // Check if we have SMART state in session storage
  const smartKey = sessionStorage.getItem('SMART_KEY');
  if (smartKey) {
    return true;
  }

  // Check if we have launch parameters
  const urlParams = new URLSearchParams(window.location.search);
  return (
    urlParams.has('iss') || urlParams.has('launch') || urlParams.has('code')
  );
};

// Get the SMART client instance
export const getSMARTClient = async () => {
  try {
    const client = await FHIR.oauth2.ready();
    return client;
  } catch (error) {
    console.error('Error initializing SMART client:', error);
    throw error;
  }
};

// Create a fhir-kit-client instance using SMART credentials
export const createAuthenticatedFHIRClient = async (): Promise<Client> => {
  const smartClient = await getSMARTClient();
  const accessToken = smartClient.state.tokenResponse?.access_token;

  return new Client({
    baseUrl: smartClient.state.serverUrl,
    customHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
};

// Get patient context from SMART launch
export const getPatientContext = async () => {
  const client = await getSMARTClient();
  const patientId = client.patient.id;
  const patient = await client.patient.read();
  return { patientId, patient };
};
