import FHIR from 'fhirclient';
import Client from 'fhir-kit-client';

// Check if we're in a SMART context
export const isSMARTContext = (): boolean => {
  // Check URL parameters - if we have 'state' param, we're returning from OAuth
  const urlParams = new URLSearchParams(window.location.search);
  const hasStateParam = urlParams.has('state');

  console.log('Checking SMART context - has state param:', hasStateParam);
  console.log('Current URL:', window.location.href);

  if (hasStateParam) {
    return true;
  }

  // Also check if SMART state exists in sessionStorage
  // The fhirclient library stores state with a specific pattern
  try {
    const keys = Object.keys(sessionStorage);
    console.log('SessionStorage keys:', keys);

    for (const key of keys) {
      const value = sessionStorage.getItem(key);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          // Check if this looks like SMART state
          if (parsed && (parsed.serverUrl || parsed.tokenResponse)) {
            console.log('Found SMART state in sessionStorage:', key);
            return true;
          }
        } catch (parseError) {
          // Silently continue - not all sessionStorage items are JSON
          // This is expected behavior when checking all storage keys
        }
      }
    }
  } catch (error) {
    console.error('Error checking sessionStorage:', error);
  }

  return false;
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
  console.log('SmartOnFHIR: serverUrl', smartClient.state.serverUrl);
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
