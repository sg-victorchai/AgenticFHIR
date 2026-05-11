import React from 'react';
import { Routes, Route } from 'react-router-dom';
import RoleSelectionPage from './pages/RoleSelectionPage';
import PatientQueuePage from './pages/PatientQueuePage';
import PatientPage from './pages/PatientPage';
import PatientSearchPage from './pages/PatientSearchPage';
import CarePlanPage from './pages/CarePlanPage';
import ObservationPage from './pages/ObservationPage';
import MedicationRequestPage from './pages/MedicationRequestPage';
import EncounterPage from './pages/EncounterPage';
import { EventMonitorPage } from './pages/EventMonitorPage';
import { WebhookManagementPage } from './pages/WebhookManagementPage';
import VisitRegistrationPage from './pages/clinical/VisitRegistrationPage';
import PsaTriagePage from './pages/clinical/PsaTriagePage';
import ClinicalConsultPage from './pages/clinical/ClinicalConsultPage';
import ConsultNoteDetailPage from './pages/clinical/ConsultNoteDetailPage';
import PatientRecordsPage from './pages/PatientRecordsPage';
// CRUD components
import CarePlanCrudPage from './pages/crud/CarePlanCrudPage';
import ObservationCrudPage from './pages/crud/ObservationCrudPage';
import MedicationRequestCrudPage from './pages/crud/MedicationRequestCrudPage';
import EncounterCrudPage from './pages/crud/EncounterCrudPage';
import PatientCrudPage from './pages/crud/PatientCrudPage';
import NotFound from './pages/NotFound';
import RoleGuard from './components/common/RoleGuard';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Landing — role selection */}
      <Route path="/" element={<RoleSelectionPage />} />

      {/* Shared */}
      <Route path="/launch" element={<RoleSelectionPage />} />
      <Route path="/queue" element={<PatientQueuePage />} />
      <Route path="/webhooks" element={<WebhookManagementPage />} />
      <Route path="/events" element={<EventMonitorPage />} />

      {/* PSA-only routes */}
      <Route
        path="/patients"
        element={<RoleGuard allowed={['psa']}><PatientSearchPage /></RoleGuard>}
      />
      <Route
        path="/patient/new"
        element={<RoleGuard allowed={['psa']}><PatientCrudPage /></RoleGuard>}
      />
      <Route
        path="/patient/:id/details"
        element={<RoleGuard allowed={['psa']}><PatientCrudPage /></RoleGuard>}
      />
      <Route
        path="/patient/:id/visit/new"
        element={<RoleGuard allowed={['psa']}><VisitRegistrationPage /></RoleGuard>}
      />
      <Route
        path="/patient/:id/encounter/:encounterId/triage"
        element={<RoleGuard allowed={['psa']}><PsaTriagePage /></RoleGuard>}
      />

      {/* Clinician-only routes */}
      <Route
        path="/patient/:id/records"
        element={<RoleGuard allowed={['clinician']}><PatientRecordsPage /></RoleGuard>}
      />
      <Route
        path="/patient/:id/encounter/:encounterId/consult"
        element={<RoleGuard allowed={['clinician']}><ClinicalConsultPage /></RoleGuard>}
      />
      <Route
        path="/patient/:id/encounter/:encounterId/notes"
        element={<RoleGuard allowed={['clinician']}><ConsultNoteDetailPage /></RoleGuard>}
      />

      {/* Patient detail (nested) — accessible to both roles */}
      <Route path="/patient/:id" element={<PatientPage />}>
        <Route path="careplan" element={<CarePlanPage />} />
        <Route path="careplan/new" element={<CarePlanCrudPage />} />
        <Route path="observation" element={<ObservationPage />} />
        <Route path="observation/new" element={<ObservationCrudPage />} />
        <Route path="medication" element={<MedicationRequestPage />} />
        <Route path="medication/new" element={<MedicationRequestCrudPage />} />
        <Route path="encounter" element={<EncounterPage />} />
        <Route path="encounter/new" element={<EncounterCrudPage />} />
        <Route path="careplan/crud" element={<CarePlanCrudPage />} />
        <Route path="careplan/crud/:resourceId" element={<CarePlanCrudPage />} />
        <Route path="observation/crud" element={<ObservationCrudPage />} />
        <Route path="observation/crud/:resourceId" element={<ObservationCrudPage />} />
        <Route path="medication/crud" element={<MedicationRequestCrudPage />} />
        <Route path="medication/crud/:resourceId" element={<MedicationRequestCrudPage />} />
        <Route path="encounter/crud" element={<EncounterCrudPage />} />
        <Route path="encounter/crud/:resourceId" element={<EncounterCrudPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
