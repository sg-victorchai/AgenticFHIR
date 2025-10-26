import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import {
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useDeleteResourceMutation,
} from '../../services/fhir/client';
import { MedicationRequest } from 'fhir/r5';

const MedicationRequestCrudPage: React.FC = () => {
  const { id: patientId, resourceId } = useParams<{
    id: string;
    resourceId?: string;
  }>();
  const patient = useOutletContext<any>();
  const navigate = useNavigate();

  // Track whether we're in view mode or edit mode
  // Default to edit mode for new resources, view mode for existing ones
  const [isEditMode, setIsEditMode] = useState(!resourceId);

  // State for form
  const [formData, setFormData] = useState<Partial<MedicationRequest>>({
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medication: {
      concept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '',
            display: '',
          },
        ],
        text: '',
      },
    },
    subject: {
      reference: `Patient/${patientId}`,
      display: `${patient?.name?.[0]?.given?.[0] || ''} ${
        patient?.name?.[0]?.family || ''
      }`,
    },
    authoredOn: new Date().toISOString(),
    dosageInstruction: [
      {
        text: '',
        timing: {
          repeat: {
            frequency: 1,
            period: 1,
            periodUnit: 'd', // FHIR R5 uses 'd' for day
          },
        },
      },
    ],
  });

  // Fetch existing resource if editing
  const { data: existingResource, isLoading: isLoadingResource } =
    useGetResourceByIdQuery(
      { resourceType: 'MedicationRequest', id: resourceId || '' },
      { skip: !resourceId },
    );

  // Mutations
  const [createResource, { isLoading: isCreating }] =
    useCreateResourceMutation();
  const [updateResource, { isLoading: isUpdating }] =
    useUpdateResourceMutation();
  const [deleteResource, { isLoading: isDeleting }] =
    useDeleteResourceMutation();

  // Load existing data if editing
  useEffect(() => {
    if (existingResource) {
      setFormData(existingResource as MedicationRequest);
    }
  }, [existingResource]);

  // Form change handler
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === 'medication.concept.text') {
      setFormData((prev) => ({
        ...prev,
        medication: {
          ...prev.medication,
          concept: {
            ...prev.medication?.concept,
            text: value,
          },
        },
      }));
    } else if (name === 'medication.concept.coding.0.code') {
      setFormData((prev) => ({
        ...prev,
        medication: {
          ...prev.medication,
          concept: {
            ...prev.medication?.concept,
            coding: [
              {
                ...prev.medication?.concept?.coding?.[0],
                code: value,
              },
            ],
          },
        },
      }));
    } else if (name === 'medication.concept.coding.0.display') {
      setFormData((prev) => ({
        ...prev,
        medication: {
          ...prev.medication,
          concept: {
            ...prev.medication?.concept,
            coding: [
              {
                ...prev.medication?.concept?.coding?.[0],
                display: value,
              },
            ],
          },
        },
      }));
    } else if (name === 'dosageInstruction.0.text') {
      setFormData((prev) => ({
        ...prev,
        dosageInstruction: [
          {
            ...prev.dosageInstruction?.[0],
            text: value,
          },
        ],
      }));
    } else if (name === 'dosageInstruction.0.timing.repeat.frequency') {
      setFormData((prev) => ({
        ...prev,
        dosageInstruction: [
          {
            ...prev.dosageInstruction?.[0],
            timing: {
              ...prev.dosageInstruction?.[0]?.timing,
              repeat: {
                ...prev.dosageInstruction?.[0]?.timing?.repeat,
                frequency: parseInt(value, 10),
              },
            },
          },
        ],
      }));
    } else if (name === 'dosageInstruction.0.timing.repeat.period') {
      setFormData((prev) => ({
        ...prev,
        dosageInstruction: [
          {
            ...prev.dosageInstruction?.[0],
            timing: {
              ...prev.dosageInstruction?.[0]?.timing,
              repeat: {
                ...prev.dosageInstruction?.[0]?.timing?.repeat,
                period: parseFloat(value),
              },
            },
          },
        ],
      }));
    } else if (name === 'dosageInstruction.0.timing.repeat.periodUnit') {
      setFormData((prev) => ({
        ...prev,
        dosageInstruction: [
          {
            ...prev.dosageInstruction?.[0],
            timing: {
              ...prev.dosageInstruction?.[0]?.timing,
              repeat: {
                ...prev.dosageInstruction?.[0]?.timing?.repeat,
                periodUnit: value as
                  | 'd'
                  | 'h'
                  | 'min'
                  | 's'
                  | 'mo'
                  | 'wk'
                  | 'a',
              },
            },
          },
        ],
      }));
    } else if (name.includes('.')) {
      // Handle other nested properties generically
      const parts = name.split('.');
      setFormData((prev) => {
        const newData = { ...prev };
        let current: any = newData;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          current[part] = current[part] ? { ...current[part] } : {};
          current = current[part];
        }
        current[parts[parts.length - 1]] = value;
        return newData;
      });
    } else {
      // Handle top-level properties
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (resourceId) {
        // Update existing resource
        await updateResource({
          resourceType: 'MedicationRequest',
          id: resourceId,
          resource: formData as MedicationRequest,
        });
      } else {
        // Create new resource
        await createResource({
          resourceType: 'MedicationRequest',
          resource: formData as MedicationRequest,
        });
      }
      // Navigate back to list view after successful operation
      navigate(`/patient/${patientId}/medication`);
    } catch (error) {
      console.error('Error saving medication request:', error);
      alert('Failed to save medication request. Please try again.');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (
      !resourceId ||
      !window.confirm(
        'Are you sure you want to delete this medication request?',
      )
    ) {
      return;
    }

    try {
      await deleteResource({
        resourceType: 'MedicationRequest',
        id: resourceId,
      });
      navigate(`/patient/${patientId}/medication`);
    } catch (error) {
      console.error('Error deleting medication request:', error);
      alert('Failed to delete medication request. Please try again.');
    }
  };

  // Toggle between view and edit modes
  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  if (isLoadingResource && resourceId) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Helper function to get medication text
  const getMedicationText = () => {
    if (
      formData.medication &&
      'concept' in formData.medication &&
      formData.medication.concept
    ) {
      // Return text if available, otherwise try to use the display from coding
      if (
        formData.medication.concept.text &&
        formData.medication.concept.text.trim() !== ''
      ) {
        return formData.medication.concept.text;
      } else if (
        formData.medication.concept.coding &&
        formData.medication.concept.coding.length > 0 &&
        formData.medication.concept.coding[0].display
      ) {
        return formData.medication.concept.coding[0].display;
      }
    }
    return '';
  };

  // Helper function to get medication coding
  const getMedicationCoding = () => {
    if (
      formData.medication &&
      'concept' in formData.medication &&
      formData.medication.concept &&
      formData.medication.concept.coding &&
      formData.medication.concept.coding.length > 0
    ) {
      return formData.medication.concept.coding[0];
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">
            {!resourceId
              ? 'Create New Medication Request'
              : isEditMode
              ? 'Edit Medication Request'
              : 'Medication Request Details'}
          </h2>
          <p className="text-gray-600">
            {!resourceId
              ? `Creating new medication request for ${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}`
              : `${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}'s medication request`}
          </p>
        </div>
        {resourceId && (
          <button
            type="button"
            onClick={toggleEditMode}
            className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isEditMode
                ? 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {isEditMode ? 'Cancel Editing' : 'Edit Medication Request'}
          </button>
        )}
      </div>

      {/* View Mode */}
      {resourceId && !isEditMode ? (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <div>
            <h3 className="text-lg font-medium">
              {getMedicationText() || 'Unnamed Medication'}
            </h3>

            {/* Medication Information */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-200 pb-4">
              <div>
                <p className="text-sm text-gray-500">Medication Name</p>
                <p className="font-medium">
                  {getMedicationText() || 'Not specified'}
                </p>
              </div>
              {getMedicationCoding()?.code && (
                <div>
                  <p className="text-sm text-gray-500">Medication Code</p>
                  <p className="font-medium">
                    {getMedicationCoding()?.code}
                    {getMedicationCoding()?.display &&
                      ` (${getMedicationCoding()?.display})`}
                  </p>
                </div>
              )}
            </div>

            {/* Dosage Information */}
            <div className="mt-4 border-b border-gray-200 pb-4">
              <p className="text-sm text-gray-500">Dosage Instructions</p>
              <p className="font-medium">
                {formData.dosageInstruction?.[0]?.text || 'Not specified'}
              </p>

              {formData.dosageInstruction?.[0]?.timing?.repeat && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Frequency</p>
                    <p className="font-medium">
                      {formData.dosageInstruction[0].timing.repeat.frequency ||
                        '1'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Period</p>
                    <p className="font-medium">
                      {formData.dosageInstruction[0].timing.repeat.period ||
                        '1'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Period Unit</p>
                    <p className="font-medium">
                      {(formData.dosageInstruction[0].timing.repeat
                        .periodUnit === 'd'
                        ? 'day'
                        : formData.dosageInstruction[0].timing.repeat
                            .periodUnit === 'h'
                        ? 'hour'
                        : formData.dosageInstruction[0].timing.repeat
                            .periodUnit === 'wk'
                        ? 'week'
                        : formData.dosageInstruction[0].timing.repeat
                            .periodUnit === 'mo'
                        ? 'month'
                        : formData.dosageInstruction[0].timing.repeat
                            .periodUnit) || 'day'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Status Information */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-200 pb-4">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium capitalize">
                  {formData.status || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Intent</p>
                <p className="font-medium capitalize">
                  {formData.intent || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Authored On</p>
                <p className="font-medium">{formatDate(formData.authoredOn)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/patient/${patientId}/medication`)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Medications
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="ml-3 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Edit Mode - original form */
        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200"
        >
          {/* Medication Information */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Medication Information
            </h3>

            <div>
              <label
                htmlFor="medication.concept.text"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Medication Name *
              </label>
              <input
                type="text"
                id="medication.concept.text"
                name="medication.concept.text"
                value={getMedicationText() || ''}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Amoxicillin 500mg"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4">
              <div>
                <label
                  htmlFor="medication.concept.coding.0.code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  RxNorm Code
                </label>
                <input
                  type="text"
                  id="medication.concept.coding.0.code"
                  name="medication.concept.coding.0.code"
                  value={getMedicationCoding()?.code || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 723"
                />
              </div>
              <div>
                <label
                  htmlFor="medication.concept.coding.0.display"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Display Name
                </label>
                <input
                  type="text"
                  id="medication.concept.coding.0.display"
                  name="medication.concept.coding.0.display"
                  value={getMedicationCoding()?.display || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Amoxicillin 500mg tablet"
                />
              </div>
            </div>
          </div>

          {/* Dosage Instructions */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Dosage Instructions
            </h3>

            <div className="mb-4">
              <label
                htmlFor="dosageInstruction.0.text"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Dosage Instructions *
              </label>
              <textarea
                id="dosageInstruction.0.text"
                name="dosageInstruction.0.text"
                value={formData.dosageInstruction?.[0]?.text || ''}
                onChange={handleChange}
                required
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Take one tablet by mouth three times daily for 10 days"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="dosageInstruction.0.timing.repeat.frequency"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Frequency
                </label>
                <input
                  type="number"
                  id="dosageInstruction.0.timing.repeat.frequency"
                  name="dosageInstruction.0.timing.repeat.frequency"
                  value={
                    formData.dosageInstruction?.[0]?.timing?.repeat
                      ?.frequency || 1
                  }
                  onChange={handleChange}
                  min="1"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="dosageInstruction.0.timing.repeat.period"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Period
                </label>
                <input
                  type="number"
                  id="dosageInstruction.0.timing.repeat.period"
                  name="dosageInstruction.0.timing.repeat.period"
                  value={
                    formData.dosageInstruction?.[0]?.timing?.repeat?.period || 1
                  }
                  onChange={handleChange}
                  min="0.25"
                  step="0.25"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="dosageInstruction.0.timing.repeat.periodUnit"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Period Unit
                </label>
                <select
                  id="dosageInstruction.0.timing.repeat.periodUnit"
                  name="dosageInstruction.0.timing.repeat.periodUnit"
                  value={
                    formData.dosageInstruction?.[0]?.timing?.repeat
                      ?.periodUnit || 'd'
                  }
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="h">Hour</option>
                  <option value="d">Day</option>
                  <option value="wk">Week</option>
                  <option value="mo">Month</option>
                </select>
              </div>
            </div>
          </div>

          {/* Status and Intent */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Status *
              </label>
              <select
                id="status"
                name="status"
                value={formData.status || 'active'}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="active">Active</option>
                <option value="on-hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
                <option value="stopped">Stopped</option>
                <option value="draft">Draft</option>
                <option value="entered-in-error">Entered in Error</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="intent"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Intent *
              </label>
              <select
                id="intent"
                name="intent"
                value={formData.intent || 'order'}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="proposal">Proposal</option>
                <option value="plan">Plan</option>
                <option value="order">Order</option>
                <option value="instance-order">Instance Order</option>
                <option value="option">Option</option>
              </select>
            </div>
          </div>

          {/* Authored Date */}
          <div>
            <label
              htmlFor="authoredOn"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Authored Date *
            </label>
            <input
              type="datetime-local"
              id="authoredOn"
              name="authoredOn"
              value={
                formData.authoredOn
                  ? new Date(formData.authoredOn).toISOString().slice(0, 16)
                  : ''
              }
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              <button
                type="button"
                onClick={() =>
                  resourceId
                    ? toggleEditMode()
                    : navigate(`/patient/${patientId}/medication`)
                }
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {resourceId ? 'Cancel' : 'Back'}
              </button>

              {resourceId && isEditMode && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="ml-3 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isCreating || isUpdating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {isCreating || isUpdating
                ? 'Saving...'
                : resourceId
                ? 'Update Medication Request'
                : 'Create Medication Request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default MedicationRequestCrudPage;
