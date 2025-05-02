import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LaunchPage from './pages/LaunchPage';
import HomePage from './pages/HomePage';
import PatientPage from './pages/PatientPage';
import PatientSearchPage from './pages/PatientSearchPage';
import CarePlanPage from './pages/CarePlanPage';
import ObservationPage from './pages/ObservationPage';
import MedicationRequestPage from './pages/MedicationRequestPage';
import EncounterPage from './pages/EncounterPage';
// CRUD components
import CarePlanCrudPage from './pages/crud/CarePlanCrudPage';
import ObservationCrudPage from './pages/crud/ObservationCrudPage';
import MedicationRequestCrudPage from './pages/crud/MedicationRequestCrudPage';
import EncounterCrudPage from './pages/crud/EncounterCrudPage';
import PatientCrudPage from './pages/crud/PatientCrudPage';
import NotFound from './pages/NotFound';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/patients" element={<PatientSearchPage />} />
      <Route path="/patient/new" element={<PatientCrudPage />} />
      <Route path="/patient/:id/details" element={<PatientCrudPage />} />
      <Route path="/patient/:id" element={<PatientPage />}>
        {/* CarePlan becomes a nested route under patient */}
        <Route path="careplan" element={<CarePlanPage />} />
        <Route path="careplan/new" element={<CarePlanCrudPage />} />
        {/* Observation as a nested route under patient */}
        <Route path="observation" element={<ObservationPage />} />
        <Route path="observation/new" element={<ObservationCrudPage />} />
        {/* MedicationRequest as a nested route under patient */}
        <Route path="medication" element={<MedicationRequestPage />} />
        <Route path="medication/new" element={<MedicationRequestCrudPage />} />
        {/* Encounter as a nested route under patient */}
        <Route path="encounter" element={<EncounterPage />} />
        <Route path="encounter/new" element={<EncounterCrudPage />} />

        {/* CRUD routes */}
        <Route path="careplan/crud" element={<CarePlanCrudPage />} />
        <Route
          path="careplan/crud/:resourceId"
          element={<CarePlanCrudPage />}
        />
        <Route path="observation/crud" element={<ObservationCrudPage />} />
        <Route
          path="observation/crud/:resourceId"
          element={<ObservationCrudPage />}
        />
        <Route path="medication/crud" element={<MedicationRequestCrudPage />} />
        <Route
          path="medication/crud/:resourceId"
          element={<MedicationRequestCrudPage />}
        />
        <Route path="encounter/crud" element={<EncounterCrudPage />} />
        <Route
          path="encounter/crud/:resourceId"
          element={<EncounterCrudPage />}
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
