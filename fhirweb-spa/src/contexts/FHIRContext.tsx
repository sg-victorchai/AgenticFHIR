import React, { createContext, useContext, useEffect, useState } from 'react';
import Client from 'fhir-kit-client';
import { createFHIRClient } from '../services/fhir/client';

interface FHIRContextType {
  client: Client | null;
  isLoading: boolean;
  error: Error | null;
}

const FHIRContext = createContext<FHIRContextType>({
  client: null,
  isLoading: true,
  error: null,
});

export const useFHIR = () => useContext(FHIRContext);

export const FHIRProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initClient = async () => {
      try {
        const fhirClient = await createFHIRClient();
        setClient(fhirClient);
      } catch (err) {
        setError(err as Error);
        console.error('Failed to initialize FHIR client:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initClient();
  }, []);

  return (
    <FHIRContext.Provider value={{ client, isLoading, error }}>
      {children}
    </FHIRContext.Provider>
  );
};
