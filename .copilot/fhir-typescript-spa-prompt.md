# TypeScript Single Page Application (SPA) Project Setup for FHIR

## Project Overview

This document outlines the requirements and structure for creating a modern TypeScript-based Single Page Application that integrates with HL7 FHIR APIs for healthcare data exchange.

## Technology Stack

- **Framework**: React
- **Language**: TypeScript
- **Build Tool**: Vite
- **Package Manager**: npm or yarn
- **State Management**: Redux (with Redux Toolkit and RTK Query)
- **Styling**: Tailwind CSS
- **Testing**: Vitest and React Testing Library
- **FHIR API Client**: fhir-kit-client (Node.js FHIR client library with TypeScript support)

## Project Requirements

### Core Features

1. **Routing System**: Implement client-side routing with React Router
2. **Component Architecture**: Create reusable and composable React components
3. **TypeScript Integration**: Use proper typing throughout the application
4. **FHIR API Integration**: Use fhir-kit-client library to connect with HL7 FHIR servers, with RTK Query for caching and state management
5. **Responsive Design**: Ensure the application works on different screen sizes using Tailwind CSS
6. **State Management**: Use Redux Toolkit for centralized state management
7. **Authentication**: Implement SMART on FHIR authentication flow for secure access to healthcare data

### Folder Structure

```
/src
  /assets          # Static assets like images, fonts, etc.
  /components      # Reusable UI components
    /common        # Shared components used across features
    /feature-name  # Feature-specific components
  /hooks           # Custom React hooks
    /fhir          # Custom hooks for FHIR data access
  /pages           # Page components, corresponding to routes
  /services
    /fhir          # FHIR client setup and service utilities
  /store           # Redux store configuration
    /slices        # Redux Toolkit slices
    /api           # RTK Query API definitions for FHIR resources
  /styles          # Tailwind configuration and global styles
  /types
    /fhir          # TypeScript definitions for FHIR resources
  /utils           # Utility functions and helpers
  App.tsx          # Main application component
  main.tsx         # Entry point
  routes.tsx       # Route definitions
```

### Development Setup

1. Initialize a new project with TypeScript support
2. Configure ESLint and Prettier for code quality
3. Set up a dev server with hot module replacement
4. Configure build process for production
5. Implement testing infrastructure

## Getting Started

To create this TypeScript SPA using React and Vite with FHIR integration:

```bash
# Create a new React + TypeScript project with Vite
npm create vite@latest fhirweb-spa -- --template react-ts

# Navigate to project directory
cd fhirweb-spa

# Install dependencies
npm install

# Install React Router
npm install react-router-dom

# Install Redux Toolkit (includes Redux core)
npm install @reduxjs/toolkit react-redux

# Install Tailwind CSS and its dependencies
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install Vitest and Testing Library for React
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

# Install FHIR client library and FHIR type definitions
npm install fhir-kit-client
npm install --save @types/fhir

# Start the development server
npm run dev
```

After installing Tailwind CSS, you'll need to configure it by updating the tailwind.config.js file:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

And add the Tailwind directives to your CSS file (src/styles/index.css):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

After installing Vitest, you'll need to configure it by adding a vitest.config.ts file to the project root:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

And create a setup file for your tests at src/test/setup.ts:

```ts
import '@testing-library/jest-dom';
```

You should also add test scripts to your package.json:

```json
"scripts": {
  // ...existing scripts...
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

This will set up a React TypeScript project with:

- Vite as the build tool with fast hot module replacement (HMR)
- Redux Toolkit and RTK Query for state management and API integration
- Tailwind CSS for styling
- React Router for navigation
- TypeScript configuration
- ESLint integration

## FHIR API Integration

### Setting up the FHIR Client

Create a FHIR client service in `/src/services/fhir/client.ts`:

```typescript
import Client from 'fhir-kit-client';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { Patient, Bundle, CarePlan, Resource } from 'fhir/r5';

// FHIR server configuration from environment variables
const FHIR_BASE_URL =
  import.meta.env.VITE_FHIR_BASE_URL || 'http://localhost:8080/fhir';
const API_KEY =
  import.meta.env.VITE_API_KEY || 'your_api_key_here';

// Initialize the FHIR client with API key authentication
export const createFHIRClient = () => {
  return new Client({
    baseUrl: FHIR_BASE_URL,
    customHeaders: {
      'x-api-key': API_KEY,
    },
  });
};

// Get SMART auth metadata
export const getSMARTAuthMetadata = async () => {
  const client = createFHIRClient();
  try {
    const metadata = await client.smartAuthMetadata();
    return metadata;
  } catch (error) {
    console.error('Error getting SMART auth metadata:', error);
    throw error;
  }
};

// RTK Query API for FHIR resources
export const fhirApi = createApi({
  reducerPath: 'fhirApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/', // Will be overridden in queryFn
  }),
  endpoints: (builder) => ({
    getPatient: builder.query<Patient, string>({
      queryFn: async (patientId: string) => {
        try {
          const client = createFHIRClient();
          const patient = await client.read<Patient>({
            resourceType: 'Patient',
            id: patientId,
          });
          return { data: patient };
        } catch (error) {
          return {
            error: { message: 'Failed to fetch patient data', details: error },
          };
        }
      },
    }),
    searchPatients: builder.query<Bundle, Record<string, string>>({
      queryFn: async (searchParams: Record<string, string>) => {
        try {
          const client = createFHIRClient();
          const results = await client.search<Patient>({
            resourceType: 'Patient',
            searchParams,
          });
          return { data: results };
        } catch (error) {
          return {
            error: { message: 'Failed to search patients', details: error },
          };
        }
      },
    }),
    getMedications: builder.query<Bundle, string>({
      queryFn: async (patientId: string) => {
        try {
          const client = createFHIRClient();
          const results = await client.search<CarePlan>({
            resourceType: 'CarePlan',
            searchParams: {
              patient: patientId,
            },
          });
          return { data: results };
        } catch (error) {
          return {
            error: { message: 'Failed to fetch medications', details: error },
          };
        }
      },
    }),
    getNextPage: builder.query<Bundle, Bundle>({
      queryFn: async (bundle: Bundle) => {
        try {
          const client = createFHIRClient();
          const results = await client.nextPage(bundle);
          return { data: results };
        } catch (error) {
          return {
            error: { message: 'Failed to fetch next page', details: error },
          };
        }
      },
    }),
    getPreviousPage: builder.query<Bundle, Bundle>({
      queryFn: async (bundle: Bundle) => {
        try {
          const client = createFHIRClient();
          const results = await client.prevPage(bundle);
          return { data: results };
        } catch (error) {
          return {
            error: { message: 'Failed to fetch previous page', details: error },
          };
        }
      },
    }),
    createResource: builder.mutation<
      Resource,
      { resourceType: string; resource: Resource }
    >({
      queryFn: async ({ resourceType, resource }) => {
        try {
          const client = createFHIRClient();
          const result = await client.create({
            resourceType,
            body: resource,
          });
          return { data: result };
        } catch (error) {
          return {
            error: {
              message: `Failed to create ${resourceType}`,
              details: error,
            },
          };
        }
      },
    }),
    updateResource: builder.mutation<
      Resource,
      { resourceType: string; id: string; resource: Resource }
    >({
      queryFn: async ({ resourceType, id, resource }) => {
        try {
          const client = createFHIRClient();
          const result = await client.update({
            resourceType,
            id,
            body: resource,
          });
          return { data: result };
        } catch (error) {
          return {
            error: {
              message: `Failed to update ${resourceType}`,
              details: error,
            },
          };
        }
      },
    }),
    // Add more endpoints for different FHIR resources as needed
  }),
});

export const {
  useGetPatientQuery,
  useSearchPatientsQuery,
  useGetMedicationsQuery,
  useGetNextPageQuery,
  useGetPreviousPageQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
} = fhirApi;
```

### FHIR Authentication Setup

Create a launch component in `/src/pages/LaunchPage.tsx`:

```typescript
import React, { useEffect } from 'react';
import { getSMARTAuthMetadata } from '../services/fhir/client';

const LaunchPage: React.FC = () => {
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const metadata = await getSMARTAuthMetadata();
        console.log('SMART Auth Metadata:', metadata);
        // Handle SMART authentication based on metadata URLs
        // This would be implementation-specific based on your FHIR server
      } catch (error) {
        console.error('Error fetching SMART Auth Metadata:', error);
      }
    };

    fetchMetadata();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-blue-50">
      <div className="p-8 bg-white rounded shadow-md">
        <h1 className="text-2xl font-bold text-blue-800">Launching FHIR App</h1>
        <p className="mt-4">Connecting to FHIR server and authenticating...</p>
      </div>
    </div>
  );
};

export default LaunchPage;
```

### Using FHIR Data in Components

Example of a Patient component in `/src/components/patient/PatientSummary.tsx`:

```typescript
import React from 'react';
import { useGetPatientQuery } from '../../services/fhir/client';
import { Patient } from 'fhir/r5';

interface PatientSummaryProps {
  patientId: string;
}

const PatientSummary: React.FC<PatientSummaryProps> = ({ patientId }) => {
  const { data: patient, isLoading, error } = useGetPatientQuery(patientId);

  if (isLoading) {
    return <div className="p-4">Loading patient information...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">Error loading patient information</div>
    );
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold">
        {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <span className="font-semibold">DOB:</span> {patient.birthDate}
        </div>
        <div>
          <span className="font-semibold">Gender:</span> {patient.gender}
        </div>
        {patient.telecom && (
          <div>
            <span className="font-semibold">Contact:</span>{' '}
            {patient.telecom.map((t) => t.value).join(', ')}
          </div>
        )}
        {patient.address && (
          <div className="col-span-2">
            <span className="font-semibold">Address:</span>{' '}
            {patient.address[0]?.line?.join(', ')}, {patient.address[0]?.city},{' '}
            {patient.address[0]?.state} {patient.address[0]?.postalCode}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientSummary;
```

### FHIR Resource Types

Instead of creating custom TypeScript definitions for FHIR resources, use the comprehensive type definitions provided by the `@types/fhir` package:

```typescript
// Import FHIR resource types in your components and services
import {
  Patient,
  Practitioner,
  Observation,
  CarePlan,
  Bundle,
  Resource,
} from 'fhir/r5';

// You can use these types directly with your API responses
const patient: Patient = {
  resourceType: 'Patient',
  id: '123',
  name: [
    {
      family: 'Smith',
      given: ['John'],
    },
  ],
  gender: 'male',
  birthDate: '1970-01-01',
};

// FHIR types include all standard properties with proper typing
const observation: Observation = {
  resourceType: 'Observation',
  id: '456',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '8867-4',
        display: 'Heart rate',
      },
    ],
  },
  subject: {
    reference: 'Patient/123',
  },
  valueQuantity: {
    value: 80,
    unit: 'beats/minute',
    system: 'http://unitsofmeasure.org',
    code: '/min',
  },
};
```

This approach provides several benefits:

1. Complete, accurate type definitions for all FHIR resources
2. Regular updates when FHIR specifications change
3. Proper autocomplete in your IDE
4. Type safety for all FHIR interactions
5. Support for multiple FHIR versions (R4, STU3, etc.)

Note: The `@types/fhir` package includes types for various FHIR versions. Import from the appropriate version namespace (e.g., `fhir/r5` for FHIR R5) that matches your FHIR server.

### Setting up Routes for FHIR Workflow

Update your routes in `/src/routes.tsx` to include FHIR-specific paths:

```typescript
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LaunchPage from './pages/LaunchPage';
import HomePage from './pages/HomePage';
import PatientPage from './pages/PatientPage';
import CarePlanPage from './pages/CarePlanPage';
import ObservationPage from './pages/ObservationPage';
import MedicationRequestPage from './pages/MedicationRequestPage';
import NotFound from './pages/NotFound';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/patient/:id" element={<PatientPage />}>
        {/* CarePlan becomes a nested route under patient */}
        <Route path="careplan" element={<CarePlanPage />} />
        {/* Observation as a nested route under patient */}
        <Route path="observation" element={<ObservationPage />} />
        {/* MedicationRequest as a nested route under patient */}
        <Route path="medication" element={<MedicationRequestPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
```

## Additional Considerations

- Implement environment configuration for development/staging/production
- Set up CI/CD pipeline
- Add documentation for components (Storybook optional)
- Consider accessibility requirements
- Plan for internationalization if needed

## Evaluation Criteria

- **Code Quality**: Clean, maintainable code with consistent patterns
- **TypeScript Usage**: Proper types and interfaces, minimal use of 'any'
- **Performance**: Optimizations for loading and runtime performance
- **Testing**: Comprehensive test coverage
- **Documentation**: Clear documentation for components and architecture

## References

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [React Documentation](https://reactjs.org/docs/getting-started.html)
- [Redux Toolkit Documentation](https://redux-toolkit.js.org/)
- [RTK Query Documentation](https://redux-toolkit.js.org/rtk-query/overview)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [fhir-kit-client Documentation](https://github.com/Vermonster/fhir-kit-client)
- [HL7 FHIR Documentation](https://www.hl7.org/fhir/)
- [SMART on FHIR](https://docs.smarthealthit.org/)
