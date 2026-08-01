import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import {
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useDeleteResourceMutation,
} from '../../services/fhir/client';
import { CarePlan } from 'fhir/r5';

const CarePlanCrudPage: React.FC = () => {
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
  const [formData, setFormData] = useState<Partial<CarePlan>>({
    resourceType: 'CarePlan',
    status: 'draft',
    intent: 'plan',
    title: '',
    description: '',
    subject: {
      reference: `Patient/${patientId}`,
      display: `${patient?.name?.[0]?.given?.[0] || ''} ${
        patient?.name?.[0]?.family || ''
      }`,
    },
    period: {
      start: new Date().toISOString().split('T')[0],
    },
  });

  // Fetch existing resource if editing
  const { data: existingResource, isLoading: isLoadingResource } =
    useGetResourceByIdQuery(
      { resourceType: 'CarePlan', id: resourceId || '' },
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
      setFormData(existingResource as CarePlan);
    }
  }, [existingResource]);

  // Form change handler
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      // Handle nested properties (e.g., period.start)
      const [parent, child] = name.split('.');
      setFormData((prev) => {
        // Create a safe copy of the parent object or initialize a new one
        const parentObj = prev[parent as keyof typeof prev] as Record<string, any> || {};
        
        return {
          ...prev,
          [parent]: {
            ...parentObj,
            [child]: value,
          },
        };
      });
    } else {
      // Handle top-level properties
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (resourceId) {
        // Update existing resource
        await updateResource({
          resourceType: 'CarePlan',
          id: resourceId,
          resource: formData as CarePlan,
        });
      } else {
        // Create new resource
        await createResource({
          resourceType: 'CarePlan',
          resource: formData as CarePlan,
        });
      }
      // Navigate back to list view after successful operation
      navigate(`/patient/${patientId}/careplan`);
    } catch (error) {
      console.error('Error saving care plan:', error);
      alert('Failed to save care plan. Please try again.');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (
      !resourceId ||
      !window.confirm('Are you sure you want to delete this care plan?')
    ) {
      return;
    }

    try {
      await deleteResource({
        resourceType: 'CarePlan',
        id: resourceId,
      });
      navigate(`/patient/${patientId}/careplan`);
    } catch (error) {
      console.error('Error deleting care plan:', error);
      alert('Failed to delete care plan. Please try again.');
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
    return date.toLocaleDateString();
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">
            {!resourceId ? 'Create New Care Plan' : 
            isEditMode ? 'Edit Care Plan' : 'Care Plan Details'}
          </h2>
          <p className="text-gray-600">
            {!resourceId
              ? `Creating new care plan for ${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}`
              : `${patient?.name?.[0]?.given?.[0]} ${patient?.name?.[0]?.family}'s care plan`}
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
            {isEditMode ? 'Cancel Editing' : 'Edit Care Plan'}
          </button>
        )}
      </div>

      {/* View Mode */}
      {resourceId && !isEditMode ? (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <div>
            <h3 className="text-lg font-medium">{formData.title || 'Untitled Care Plan'}</h3>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium capitalize">{formData.status || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Intent</p>
                <p className="font-medium capitalize">{formData.intent || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Start Date</p>
                <p className="font-medium">{formatDate(formData.period?.start)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">End Date</p>
                <p className="font-medium">{formatDate(formData.period?.end)}</p>
              </div>
            </div>
            {formData.description && (
              <div className="mt-4">
                <p className="text-sm text-gray-500">Description</p>
                <p className="mt-1">{formData.description}</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/patient/${patientId}/careplan`)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Care Plans
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
        /* Edit Mode */
        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200"
        >
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title || ''}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
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
              value={formData.status || 'draft'}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
              <option value="completed">Completed</option>
              <option value="unknown">Unknown</option>
              <option value="entered-in-error">Entered in Error</option>
            </select>
          </div>

          {/* Intent */}
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
              value={formData.intent || 'plan'}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="proposal">Proposal</option>
              <option value="plan">Plan</option>
              <option value="order">Order</option>
              <option value="option">Option</option>
            </select>
          </div>

          {/* Period - Start Date */}
          <div>
            <label
              htmlFor="period.start"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Start Date *
            </label>
            <input
              type="date"
              id="period.start"
              name="period.start"
              value={
                (formData.period?.start &&
                  formData.period.start.substring(0, 10)) ||
                ''
              }
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Period - End Date */}
          <div>
            <label
              htmlFor="period.end"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              End Date
            </label>
            <input
              type="date"
              id="period.end"
              name="period.end"
              value={
                (formData.period?.end && formData.period.end.substring(0, 10)) ||
                ''
              }
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              <button
                type="button"
                onClick={() => resourceId ? toggleEditMode() : navigate(`/patient/${patientId}/careplan`)}
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
                ? 'Update Care Plan'
                : 'Create Care Plan'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default CarePlanCrudPage;
