import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import {
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useDeleteResourceMutation,
} from '../../services/fhir/client';
import { Observation } from 'fhir/r5';

const ObservationCrudPage: React.FC = () => {
  const { id: patientId, resourceId } = useParams<{
    id: string;
    resourceId?: string;
  }>();
  const patient = useOutletContext<any>();
  const navigate = useNavigate();

  // State to control view/edit mode - new records start in edit mode, existing in view mode
  const [isEditMode, setIsEditMode] = useState<boolean>(!resourceId);

  // State for form
  const [formData, setFormData] = useState<Partial<Observation>>({
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '',
          display: '',
        },
      ],
      text: '',
    },
    subject: {
      reference: `Patient/${patientId}`,
      display: `${patient?.name?.[0]?.given?.[0] || ''} ${
        patient?.name?.[0]?.family || ''
      }`,
    },
    effectiveDateTime: new Date().toISOString(),
    valueQuantity: {
      value: undefined,
      unit: '',
      system: 'http://unitsofmeasure.org',
      code: '',
    },
  });

  // Value type options
  const [valueType, setValueType] = useState<string>('quantity');

  // Fetch existing resource if editing
  const { data: existingResource, isLoading: isLoadingResource } =
    useGetResourceByIdQuery(
      { resourceType: 'Observation', id: resourceId || '' },
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
      const observation = existingResource as Observation;

      // This code was causing an error because the object is not extensible
      // if (!observation.code?.text && observation.code?.coding?.[0]?.display) {
      //   observation.code.text = observation.code.coding[0].display;
      // }

      setFormData(observation);

      // Determine value type
      if (observation.valueQuantity) setValueType('quantity');
      else if (observation.valueString !== undefined) setValueType('string');
      else if (observation.valueBoolean !== undefined) setValueType('boolean');
      else if (observation.valueInteger !== undefined) setValueType('integer');
      else if (observation.valueCodeableConcept)
        setValueType('codeableConcept');
    }
  }, [existingResource]);

  // Form change handler
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === 'code.text') {
      setFormData((prev) => ({
        ...prev,
        code: {
          ...prev.code,
          text: value,
          coding: [
            {
              ...prev.code?.coding?.[0],
              display: value, // Also update the display in coding when text changes
            },
          ],
        },
      }));
    } else if (name === 'code.coding.0.code') {
      setFormData((prev) => ({
        ...prev,
        code: {
          ...prev.code,
          coding: [
            {
              ...prev.code?.coding?.[0],
              code: value,
            },
          ],
        },
      }));
    } else if (name === 'code.coding.0.display') {
      setFormData((prev) => ({
        ...prev,
        code: {
          ...prev.code,
          coding: [
            {
              ...prev.code?.coding?.[0],
              display: value,
            },
          ],
        },
      }));
    } else if (name === 'valueQuantity.value') {
      setFormData((prev) => ({
        ...prev,
        valueQuantity: {
          ...prev.valueQuantity,
          value: value === '' ? undefined : parseFloat(value),
        },
      }));
    } else if (name === 'valueQuantity.unit' || name === 'valueQuantity.code') {
      const fieldName = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        valueQuantity: {
          ...prev.valueQuantity,
          [fieldName]: value,
          // auto-sync code with unit so UCUM code is always populated;
          // user can override code independently via the code field
          ...(fieldName === 'unit' ? { code: value } : {}),
        },
      }));
    } else if (name === 'valueString') {
      setFormData((prev) => ({
        ...prev,
        valueString: value,
        valueQuantity: undefined,
        valueBoolean: undefined,
        valueInteger: undefined,
        valueCodeableConcept: undefined,
      }));
    } else if (name === 'valueBoolean') {
      setFormData((prev) => ({
        ...prev,
        valueBoolean: value === 'true',
        valueQuantity: undefined,
        valueString: undefined,
        valueInteger: undefined,
        valueCodeableConcept: undefined,
      }));
    } else if (name === 'valueInteger') {
      setFormData((prev) => ({
        ...prev,
        valueInteger: value === '' ? undefined : parseInt(value, 10),
        valueQuantity: undefined,
        valueString: undefined,
        valueBoolean: undefined,
        valueCodeableConcept: undefined,
      }));
    } else if (name === 'valueCodeableConcept.text') {
      setFormData((prev) => ({
        ...prev,
        valueCodeableConcept: {
          text: value,
          coding: [{ system: 'http://loinc.org', code: value, display: value }],
        },
        valueQuantity: undefined,
        valueString: undefined,
        valueBoolean: undefined,
        valueInteger: undefined,
      }));
    } else if (name === 'effectiveDateTime') {
      // Handle datetime-local inputs which return a formatted string
      setFormData((prev) => ({
        ...prev,
        effectiveDateTime: new Date(value).toISOString(),
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Helper function to get medication text
  const getObservationCodeText = () => {
    if (formData.code) {
      // Return text if available, otherwise try to use the display from coding
      if (formData.code.text && formData.code.text.trim() !== '') {
        return formData.code.text;
      } else if (
        formData.code.coding &&
        formData.code.coding.length > 0 &&
        formData.code.coding[0].display
      ) {
        return formData.code.coding[0].display;
      }
    }
    return '';
  };

  // Handle value type change
  const handleValueTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setValueType(newType);

    // Reset all value fields
    const updatedFormData = { ...formData };
    delete updatedFormData.valueQuantity;
    delete updatedFormData.valueString;
    delete updatedFormData.valueBoolean;
    delete updatedFormData.valueInteger;
    delete updatedFormData.valueCodeableConcept;

    // Set the new value type
    if (newType === 'quantity') {
      updatedFormData.valueQuantity = {
        value: undefined,
        unit: '',
        system: 'http://unitsofmeasure.org',
        code: '',
      };
    } else if (newType === 'string') {
      updatedFormData.valueString = '';
    } else if (newType === 'boolean') {
      updatedFormData.valueBoolean = false;
    } else if (newType === 'integer') {
      updatedFormData.valueInteger = undefined;
    } else if (newType === 'codeableConcept') {
      updatedFormData.valueCodeableConcept = {
        text: '',
        coding: [{ system: 'http://loinc.org', code: '', display: '' }],
      };
    }

    setFormData(updatedFormData);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Clean up form data before submitting
      const cleanedFormData = { ...formData };

      // Make sure the value type matches what's selected
      // Remove any value properties that aren't of the current valueType
      if (valueType === 'quantity') {
        delete cleanedFormData.valueString;
        delete cleanedFormData.valueBoolean;
        delete cleanedFormData.valueInteger;
        delete cleanedFormData.valueCodeableConcept;
      } else if (valueType === 'string') {
        delete cleanedFormData.valueQuantity;
        delete cleanedFormData.valueBoolean;
        delete cleanedFormData.valueInteger;
        delete cleanedFormData.valueCodeableConcept;
      } else if (valueType === 'boolean') {
        delete cleanedFormData.valueQuantity;
        delete cleanedFormData.valueString;
        delete cleanedFormData.valueInteger;
        delete cleanedFormData.valueCodeableConcept;
      } else if (valueType === 'integer') {
        delete cleanedFormData.valueQuantity;
        delete cleanedFormData.valueString;
        delete cleanedFormData.valueBoolean;
        delete cleanedFormData.valueCodeableConcept;
      } else if (valueType === 'codeableConcept') {
        delete cleanedFormData.valueQuantity;
        delete cleanedFormData.valueString;
        delete cleanedFormData.valueBoolean;
        delete cleanedFormData.valueInteger;
      }

      // Ensure date is in proper ISO format
      if (cleanedFormData.effectiveDateTime) {
        cleanedFormData.effectiveDateTime = new Date(
          cleanedFormData.effectiveDateTime,
        ).toISOString();
      }

      if (resourceId) {
        // Update existing resource
        await updateResource({
          resourceType: 'Observation',
          id: resourceId,
          resource: cleanedFormData as Observation,
        });
      } else {
        // Create new resource
        await createResource({
          resourceType: 'Observation',
          resource: cleanedFormData as Observation,
        });
      }
      // Navigate back to list view after successful operation
      navigate(`/patient/${patientId}/observation`);
    } catch (error) {
      console.error('Error saving observation:', error);
      alert('Failed to save observation. Please try again.');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (
      !resourceId ||
      !window.confirm('Are you sure you want to delete this observation?')
    ) {
      return;
    }

    try {
      await deleteResource({
        resourceType: 'Observation',
        id: resourceId,
      });
      navigate(`/patient/${patientId}/observation`);
    } catch (error) {
      console.error('Error deleting observation:', error);
      alert('Failed to delete observation. Please try again.');
    }
  };

  if (isLoadingResource && resourceId) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">
            {!resourceId 
              ? 'Create New Observation' 
              : isEditMode 
                ? 'Edit Observation' 
                : 'Observation Details'}
          </h2>
          <p className="text-gray-600">
            {!resourceId
              ? `Creating new observation for ${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}`
              : `Observation for ${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}`}
          </p>
        </div>
        
        {resourceId && !isEditMode && (
          <button
            type="button"
            onClick={() => setIsEditMode(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Edit
          </button>
        )}
      </div>

      {/* View mode for existing records */}
      {resourceId && !isEditMode ? (
        <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          {/* Observation Code Display */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Observation Code
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </p>
                <p className="text-gray-900">{getObservationCodeText() || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Code</p>
                <p className="text-gray-900">{formData.code?.coding?.[0]?.code || '-'}</p>
              </div>
            </div>
          </div>

          {/* Observation Value Display */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Observation Value
            </h3>
            {valueType === 'quantity' && formData.valueQuantity && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Value</p>
                  <p className="text-gray-900">{formData.valueQuantity.value || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Unit</p>
                  <p className="text-gray-900">{formData.valueQuantity.unit || '-'}</p>
                </div>
              </div>
            )}
            
            {valueType === 'string' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Text Value</p>
                <p className="text-gray-900 whitespace-pre-wrap">{formData.valueString || '-'}</p>
              </div>
            )}
            
            {valueType === 'boolean' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Yes/No Value</p>
                <p className="text-gray-900">{formData.valueBoolean === true ? 'Yes' : formData.valueBoolean === false ? 'No' : '-'}</p>
              </div>
            )}
            
            {valueType === 'integer' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Integer Value</p>
                <p className="text-gray-900">{formData.valueInteger !== undefined ? formData.valueInteger : '-'}</p>
              </div>
            )}
            
            {valueType === 'codeableConcept' && formData.valueCodeableConcept && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Coded Value Text</p>
                <p className="text-gray-900">{formData.valueCodeableConcept.text || '-'}</p>
              </div>
            )}
          </div>

          {/* Status Display */}
          <div className="border-b border-gray-200 pb-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Status</p>
            <p className="text-gray-900 capitalize">{formData.status || '-'}</p>
          </div>

          {/* Effective Date Time Display */}
          <div className="border-b border-gray-200 pb-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Effective Date/Time</p>
            <p className="text-gray-900">
              {formData.effectiveDateTime 
                ? new Date(formData.effectiveDateTime).toLocaleString() 
                : '-'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-4">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/patient/${patientId}/observation`)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
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
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Edit
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200"
        >
          {/* Code Information */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Observation Code
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="code.text"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Display Name *
                </label>
                <input
                  type="text"
                  id="code.text"
                  name="code.text"
                  value={getObservationCodeText() || ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Blood Pressure"
                />
              </div>

              <div>
                <label
                  htmlFor="code.coding.0.code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Code
                </label>
                <input
                  type="text"
                  id="code.coding.0.code"
                  name="code.coding.0.code"
                  value={formData.code?.coding?.[0]?.code || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 8480-6"
                />
              </div>
            </div>
          </div>

          {/* Value Type Selection */}
          <div className="border-b border-gray-200 pb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Observation Value
            </h3>

            <div className="mb-4">
              <label
                htmlFor="valueType"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Value Type *
              </label>
              <select
                id="valueType"
                value={valueType}
                onChange={handleValueTypeChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="quantity">Quantity (with units)</option>
                <option value="string">Text</option>
                <option value="boolean">Yes/No</option>
                <option value="integer">Integer</option>
                <option value="codeableConcept">Codeable Concept</option>
              </select>
            </div>

            {/* Value fields based on selected type */}
            {valueType === 'quantity' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="valueQuantity.value"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Value *
                  </label>
                  <input
                    type="number"
                    id="valueQuantity.value"
                    name="valueQuantity.value"
                    value={formData.valueQuantity?.value || ''}
                    onChange={handleChange}
                    step="any"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="valueQuantity.unit"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Display Unit
                  </label>
                  <input
                    type="text"
                    id="valueQuantity.unit"
                    name="valueQuantity.unit"
                    value={formData.valueQuantity?.unit || ''}
                    onChange={handleChange}
                    placeholder="e.g. mmHg"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="valueQuantity.code"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    UCUM Code
                  </label>
                  <input
                    type="text"
                    id="valueQuantity.code"
                    name="valueQuantity.code"
                    value={formData.valueQuantity?.code || ''}
                    onChange={handleChange}
                    placeholder="e.g. mm[Hg]"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {valueType === 'string' && (
              <div>
                <label
                  htmlFor="valueString"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Text Value *
                </label>
                <textarea
                  id="valueString"
                  name="valueString"
                  value={formData.valueString || ''}
                  onChange={handleChange}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {valueType === 'boolean' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Yes/No Value *
                </label>
                <div className="flex items-center space-x-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="valueBoolean"
                      value="true"
                      checked={formData.valueBoolean === true}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2">Yes</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="valueBoolean"
                      value="false"
                      checked={formData.valueBoolean === false}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2">No</span>
                  </label>
                </div>
              </div>
            )}

            {valueType === 'integer' && (
              <div>
                <label
                  htmlFor="valueInteger"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Integer Value *
                </label>
                <input
                  type="number"
                  id="valueInteger"
                  name="valueInteger"
                  value={formData.valueInteger || ''}
                  onChange={handleChange}
                  required
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {valueType === 'codeableConcept' && (
              <div>
                <label
                  htmlFor="valueCodeableConcept.text"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Coded Value Text *
                </label>
                <input
                  type="text"
                  id="valueCodeableConcept.text"
                  name="valueCodeableConcept.text"
                  value={formData.valueCodeableConcept?.text || ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Status */}
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
              value={formData.status || 'final'}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="registered">Registered</option>
              <option value="preliminary">Preliminary</option>
              <option value="final">Final</option>
              <option value="amended">Amended</option>
              <option value="corrected">Corrected</option>
              <option value="cancelled">Cancelled</option>
              <option value="entered-in-error">Entered in Error</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* Effective Date Time */}
          <div>
            <label
              htmlFor="effectiveDateTime"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Effective Date/Time *
            </label>
            <input
              type="datetime-local"
              id="effectiveDateTime"
              name="effectiveDateTime"
              value={
                formData.effectiveDateTime
                  ? new Date(formData.effectiveDateTime)
                      .toISOString()
                      .substring(0, 16)
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
              {resourceId && isEditMode ? (
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel Editing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/patient/${patientId}/observation`)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              )}

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
                ? 'Update Observation'
                : 'Create Observation'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ObservationCrudPage;
