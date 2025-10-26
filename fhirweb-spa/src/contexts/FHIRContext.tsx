import React, { createContext, useContext, useEffect, useState } from 'react';
import Client from 'fhir-kit-client';
import { createFHIRClient } from '../services/fhir/client';
import { isSMARTContext } from '../services/fhir/smartClient';

interface FHIRContextType {
  client: Client | null;
  isLoading: boolean;
  error: Error | null;
  reinitializeClient: () => Promise<void>;
}

const FHIRContext = createContext<FHIRContextType>({
  client: null,
  isLoading: true,
  error: null,
  reinitializeClient: async () => {},
});

export const useFHIR = () => useContext(FHIRContext);

export const FHIRProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const initClient = async () => {
    try {
      setIsLoading(true);
      const fhirClient = await createFHIRClient();
      console.log('FHIR Client initialized with baseUrl:', fhirClient.baseUrl);
      setClient(fhirClient);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to initialize FHIR client:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initClient();
  }, []);

  return (
    <FHIRContext.Provider
      value={{ client, isLoading, error, reinitializeClient: initClient }}
    >
      {children}
    </FHIRContext.Provider>
  );
};
