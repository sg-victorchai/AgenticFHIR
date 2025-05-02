import React, { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import {
  useGetResourceByIdQuery,
  useCreateResourceMutation,
  useUpdateResourceMutation,
  useDeleteResourceMutation,
  useGetPractitionersQuery,
  useGetOrganizationsQuery,
  useGetConditionsQuery,
  useGetPractitionerByIdQuery,
  useGetLocationsQuery,
} from '../../services/fhir/client';
import { Encounter, Practitioner } from 'fhir/r5';

// Interface for form group structure
interface FormGroup {
  id: string;
  title: string;
  elements: string[];
  description?: string;
}

// Interface for reference options
interface ReferenceOption {
  reference: string;
  display: string;
}

// Interface for coding options
interface CodingOption {
  system: string;
  code: string;
  display: string;
}

// Common participant type coding options
const PARTICIPANT_TYPE_OPTIONS: CodingOption[] = [
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'PPRF',
    display: 'Primary Performer',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'SPRF',
    display: 'Secondary Performer',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'ATND',
    display: 'Attender',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'CON',
    display: 'Consultant',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'REF',
    display: 'Referrer',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'ADM',
    display: 'Admitter',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'DIS',
    display: 'Discharger',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
    code: 'CALLBCK',
    display: 'Callback Contact',
  },
];

// Common reason code options for CodeableConcept
const REASON_CODE_OPTIONS: CodingOption[] = [
  {
    system: 'http://terminology.hl7.org/CodeSystem/reason-medication-given',
    code: 'a',
    display: 'For procedure',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/reason-medication-given',
    code: 'b',
    display: 'For clinical assessment',
  },
  {
    system: 'http://snomed.info/sct',
    code: '410429000',
    display: 'Cardiac Arrest',
  },
  {
    system: 'http://snomed.info/sct',
    code: '418138009',
    display: 'Annual check-up',
  },
  {
    system: 'http://snomed.info/sct',
    code: '185345009',
    display: 'Follow-up encounter',
  },
  {
    system: 'http://snomed.info/sct',
    code: '270427003',
    display: 'Patient-initiated encounter',
  },
  {
    system: 'http://snomed.info/sct',
    code: '11429006',
    display: 'Consultation',
  },
  {
    system: 'http://snomed.info/sct',
    code: '183460006',
    display: 'Telephone encounter',
  },
];

// Location form options
const LOCATION_STATUS_OPTIONS = [
  { code: 'planned', display: 'Planned' },
  { code: 'active', display: 'Active' },
  { code: 'reserved', display: 'Reserved' },
  { code: 'completed', display: 'Completed' },
];

const LOCATION_FORM_OPTIONS = [
  {
    code: 'bd',
    display: 'Bed',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'ro',
    display: 'Room',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'wa',
    display: 'Ward',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'lvl',
    display: 'Level',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'site',
    display: 'Site',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 've',
    display: 'Vehicle',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'ho',
    display: 'House',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'ca',
    display: 'Cabinet',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'rd',
    display: 'Road',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'area',
    display: 'Area',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'jdn',
    display: 'Jurisdiction',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
  {
    code: 'virtual',
    display: 'Virtual',
    system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  },
];

// Identifier system options
const IDENTIFIER_SYSTEM_OPTIONS = [
  {
    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    code: 'MR',
    display: 'Medical Record Number',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    code: 'VN',
    display: 'Visit Number',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    code: 'PRN',
    display: 'Provider Number',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    code: 'FN',
    display: 'Facility Number',
  },
  {
    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
    code: 'PI',
    display: 'Patient Internal Identifier',
  },
  {
    system: 'http://hospital.smarthealthit.org',
    code: 'MRN',
    display: 'Hospital MRN',
  },
  {
    system: 'http://example.org/identifier/pre-admission',
    code: 'PAI',
    display: 'Pre-Admission Identifier',
  },
];

// Re-admission options
const READMISSION_OPTIONS = [
  {
    code: 'R',
    display: 'Re-admission',
    system: 'http://terminology.hl7.org/CodeSystem/v2-0092',
  },
  {
    code: 'UR',
    display: 'Unscheduled re-admission',
    system: 'http://terminology.hl7.org/CodeSystem/v2-0092',
  },
];

// Discharge disposition options
const DISCHARGE_DISPOSITION_OPTIONS = [
  {
    code: 'home',
    display: 'Home',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'alt-home',
    display: 'Alternative home',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'other-hcf',
    display: 'Other healthcare facility',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'hosp',
    display: 'Hospice',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'long',
    display: 'Long-term care',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'snf',
    display: 'Skilled nursing facility',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
  {
    code: 'oth',
    display: 'Other',
    system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
  },
];

// Interface for encounter location to enforce required 'location' property
interface EncounterLocation {
  status?: 'planned' | 'active' | 'reserved' | 'completed';
  location: {
    reference?: string;
    display: string;
  };
  form?: {
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  };
  period?: {
    start?: string;
    end?: string;
  };
}

interface CustomEncounter extends Omit<Encounter, 'diagnosis'> {
  participant?: Array<{
    type?: Array<{
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
      text?: string;
    }>;
    period?: {
      start?: string;
      end?: string;
    };
    actor?: {
      reference?: string;
      display?: string;
    };
  }>;
  diagnosis?: Array<{
    condition: {
      reference: string;
      display: string;
    };
    use: {
      coding: Array<{
        system?: string;
        code: string;
        display?: string;
      }>;
    };
  }>;
  reasonCode?: Array<{
    coding: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
    text?: string;
  }>;
  reasonReference?: Array<{
    reference: string;
    display: string;
  }>;
  hospitalization?: {
    preAdmissionIdentifier?: {
      value?: string;
      system?: string;
    };
    origin?: {
      reference?: string;
      display?: string;
    };
    admitSource?: {
      coding: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
    };
    reAdmission?: {
      coding: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
    };
    destination?: {
      reference?: string;
      display?: string;
    };
    dischargeDisposition?: {
      coding: Array<{
        system?: string;
        code?: string;
        display?: string;
      }>;
    };
  };
  location?: EncounterLocation[];
  actualPeriod?: {
    start?: string;
    end?: string;
  };
}

const EncounterCrudPage: React.FC = () => {
  const { id: patientId, resourceId } = useParams<{
    id: string;
    resourceId?: string;
  }>();
  const patient = useOutletContext<any>();
  const navigate = useNavigate();

  // State to control view/edit mode - new records start in edit mode, existing in view mode
  const [isEditMode, setIsEditMode] = useState<boolean>(!resourceId);

  // State for form groups - using the required 6 groups for Encounter
  const [formGroups] = useState<FormGroup[]>([
    {
      id: 'overview',
      title: 'Overview',
      elements: [
        'status',
        'class',
        'type',
        'subject',
        'actualPeriod',
        'serviceProvider',
      ],
      description: 'Basic information about the encounter',
    },
    {
      id: 'diagnosis',
      title: 'Diagnosis',
      elements: ['diagnosis'],
      description: 'Diagnoses relevant to this encounter',
    },
    {
      id: 'participant',
      title: 'Participant',
      elements: ['participant'],
      description: 'Healthcare providers involved in the encounter',
    },
    {
      id: 'reason',
      title: 'Reason',
      elements: ['reasonCode', 'reasonReference'],
      description: 'Reason for the encounter',
    },
    {
      id: 'location',
      title: 'Location',
      elements: ['location'],
      description: 'Where the encounter took place',
    },
    {
      id: 'admission',
      title: 'Admission',
      elements: ['hospitalization'],
      description: 'Details about the admission to a healthcare service',
    },
  ]);

  // State for form
  const [formData, setFormData] = useState<CustomEncounter>({
    resourceType: 'Encounter',
    status: 'planned',
    class: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'Ambulatory',
          },
        ],
      },
    ],
    subject: {
      reference: `Patient/${patientId}`,
      display: `${patient?.name?.[0]?.given?.[0] || ''} ${
        patient?.name?.[0]?.family || ''
      }`,
    },
    actualPeriod: {
      start: new Date().toISOString(),
      end: undefined,
    },
    type: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/encounter-type',
            code: '',
            display: '',
          },
        ],
        text: '',
      },
    ],
  });

  // State for reference options
  const [organizationOptions, setOrganizationOptions] = useState<
    ReferenceOption[]
  >([]);
  const [conditionOptions, setConditionOptions] = useState<ReferenceOption[]>(
    [],
  );
  const [practitionerOptions, setPractitionerOptions] = useState<
    ReferenceOption[]
  >([]);
  const [locationOptions, setLocationOptions] = useState<ReferenceOption[]>([]);

  // Fetch existing resource if editing
  const { data: existingResource, isLoading: isLoadingResource } =
    useGetResourceByIdQuery(
      { resourceType: 'Encounter', id: resourceId || '' },
      { skip: !resourceId },
    );

  // Fetch reference data using RTK Query
  const { data: practitionersData } = useGetPractitionersQuery(
    { searchParams: { _count: '100', _sort: 'family' } },
    { skip: !patientId },
  );

  const { data: organizationsData } = useGetOrganizationsQuery(
    { searchParams: { _count: '100', _sort: 'name' } },
    { skip: !patientId },
  );

  const { data: conditionsData } = useGetConditionsQuery(
    { patientId: patientId || '' },
    { skip: !patientId },
  );

  const { data: locationsData } = useGetLocationsQuery(
    { searchParams: { _count: '100', _sort: 'name' } },
    { skip: !patientId },
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
      const encounter = existingResource as unknown as CustomEncounter;
      setFormData(encounter);
    }
  }, [existingResource]);

  // Fetch reference data from RTK Query hooks
  useEffect(() => {
    // Process organization data
    if (organizationsData?.entry) {
      setOrganizationOptions(
        organizationsData.entry.map((entry: any) => ({
          reference: `Organization/${entry.resource.id}`,
          display: entry.resource.name || 'Unknown Organization',
        })),
      );
    }

    // Process condition data
    if (conditionsData?.entry) {
      setConditionOptions(
        conditionsData.entry.map((entry: any) => ({
          reference: `Condition/${entry.resource.id}`,
          display:
            entry.resource.code?.coding?.[0]?.display ||
            entry.resource.code?.text ||
            'Unnamed Condition',
        })),
      );
    }

    // Process practitioner data
    if (practitionersData?.entry) {
      setPractitionerOptions(
        practitionersData.entry.map((entry: any) => ({
          reference: `Practitioner/${entry.resource.id}`,
          display: entry.resource.name?.[0]?.family
            ? `${entry.resource.name[0].given?.[0] || ''} ${
                entry.resource.name[0].family
              }`
            : 'Unknown Practitioner',
        })),
      );
    }

    // Process location data
    if (locationsData?.entry) {
      setLocationOptions(
        locationsData.entry.map((entry: any) => ({
          reference: `Location/${entry.resource.id}`,
          display:
            entry.resource.name ||
            entry.resource.description ||
            'Unnamed Location',
        })),
      );
    }
  }, [organizationsData, conditionsData, practitionersData, locationsData]);

  // State to track missing practitioner IDs
  const [missingPractitionerIds, setMissingPractitionerIds] = useState<
    string[]
  >([]);

  // Fetch individual practitioners by ID
  const { data: practitionerData } = useGetPractitionerByIdQuery(
    missingPractitionerIds[0] || '',
    { skip: !missingPractitionerIds.length },
  );

  // Process individual practitioner data when it's available
  useEffect(() => {
    if (practitionerData && missingPractitionerIds.length > 0) {
      const id = missingPractitionerIds[0];
      const practitioner = practitionerData as Practitioner;
      const display = practitioner.name?.[0]?.family
        ? `${practitioner.name[0].given?.[0] || ''} ${
            practitioner.name[0].family
          }`
        : 'Unknown Practitioner';

      // Add to practitioner options
      setPractitionerOptions((prev) => {
        if (!prev.some((p) => p.reference === `Practitioner/${id}`)) {
          return [
            ...prev,
            {
              reference: `Practitioner/${id}`,
              display: display,
            },
          ];
        }
        return prev;
      });

      // Remove the ID we just processed
      setMissingPractitionerIds((prev) => prev.slice(1));

      console.log(`Added missing practitioner: ${display}`);
    }
  }, [practitionerData, missingPractitionerIds]);

  // Identify missing practitioners that need to be fetched
  useEffect(() => {
    if (formData.participant && formData.participant.length > 0) {
      // Check if we need to update actors that don't match any options
      const needsUpdate = formData.participant.some(
        (p) =>
          p.actor?.reference &&
          !practitionerOptions.some((o) => o.reference === p.actor?.reference),
      );

      if (needsUpdate) {
        // Extract practitioner IDs from references
        const missingRefs =
          formData.participant
            ?.filter(
              (p) =>
                p.actor?.reference &&
                !practitionerOptions.some(
                  (o) => o.reference === p.actor?.reference,
                ),
            )
            ?.map((p) => p.actor?.reference || '')
            .filter((ref) => ref.startsWith('Practitioner/'))
            .map((ref) => ref.replace('Practitioner/', '')) || [];

        if (missingRefs.length === 0) return;

        console.log('Missing practitioners found:', missingRefs);

        // Set the IDs to be fetched one by one
        setMissingPractitionerIds((prev) => {
          // Only add IDs that aren't already in the queue
          const newIds = missingRefs.filter((id) => !prev.includes(id));
          return [...prev, ...newIds];
        });
      }
    }
  }, [formData.participant, practitionerOptions]);

  // Add debug logging to track actor references
  useEffect(() => {
    if (formData.participant && formData.participant.length > 0) {
      console.log(
        'Current participant actors:',
        formData.participant.map((p) => p.actor?.reference),
      );
      console.log(
        'Available practitioner options:',
        practitionerOptions.map((p) => p.reference),
      );

      // Check if all options are loaded
      const allReferencesFound = formData.participant.every(
        (p) =>
          !p.actor?.reference ||
          practitionerOptions.some(
            (option) => option.reference === p.actor?.reference,
          ),
      );

      console.log('All references found:', allReferencesFound);
    }
  }, [formData.participant, practitionerOptions]);

  // Form change handler
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === 'type.text') {
      setFormData((prev) => ({
        ...prev,
        type: [
          {
            ...prev.type?.[0],
            text: value,
            coding: [
              {
                ...prev.type?.[0]?.coding?.[0],
                display: value,
              },
            ],
          },
        ],
      }));
    } else if (name === 'type.coding.0.code') {
      setFormData((prev) => ({
        ...prev,
        type: [
          {
            ...prev.type?.[0],
            coding: [
              {
                ...prev.type?.[0]?.coding?.[0],
                code: value,
              },
            ],
          },
        ],
      }));
    } else if (name === 'class.coding.0.code') {
      setFormData((prev) => ({
        ...prev,
        class: [
          {
            ...prev.class?.[0],
            coding: [
              {
                ...prev.class?.[0]?.coding?.[0],
                code: value,
              },
            ],
          },
        ],
      }));
    } else if (name === 'class.coding.0.display') {
      setFormData((prev) => ({
        ...prev,
        class: [
          {
            ...prev.class?.[0],
            coding: [
              {
                ...prev.class?.[0]?.coding?.[0],
                display: value,
              },
            ],
          },
        ],
      }));
    } else if (name === 'actualPeriod.start') {
      setFormData((prev) => ({
        ...prev,
        actualPeriod: {
          ...prev.actualPeriod,
          start: new Date(value).toISOString(),
        },
      }));
    } else if (name === 'actualPeriod.end') {
      const endDate = value ? new Date(value).toISOString() : undefined;
      setFormData((prev) => ({
        ...prev,
        actualPeriod: {
          ...prev.actualPeriod,
          end: endDate,
        },
      }));
    } else if (name === 'serviceProvider.display') {
      setFormData((prev) => ({
        ...prev,
        serviceProvider: {
          display: value,
        },
      }));
    } else if (name.startsWith('participant')) {
      // Handle participant array changes
      const participantIndex = parseInt(name.split('.')[1]);
      const fieldName = name.split('.').slice(2).join('.');

      setFormData((prev) => {
        const updatedParticipants = [...(prev.participant || [])];

        // Ensure participant at this index exists
        if (!updatedParticipants[participantIndex]) {
          updatedParticipants[participantIndex] = {};
        }

        // Update the specific field using a helper function
        const updatedParticipant = updateNestedField(
          updatedParticipants[participantIndex],
          fieldName,
          value,
        );

        updatedParticipants[participantIndex] = updatedParticipant;

        return {
          ...prev,
          participant: updatedParticipants,
        };
      });
    } else if (name.startsWith('location')) {
      // Handle location array changes
      const locationIndex = parseInt(name.split('.')[1]);
      const fieldName = name.split('.').slice(2).join('.');

      setFormData((prev) => {
        const updatedLocations = [...(prev.location || [])];

        // Ensure location at this index exists
        if (!updatedLocations[locationIndex]) {
          updatedLocations[locationIndex] = {
            location: {
              display: '',
            },
          };
        }

        // Update the specific field using a helper function
        const updatedLocation = updateNestedField(
          updatedLocations[locationIndex],
          fieldName,
          value,
        );

        updatedLocations[locationIndex] = updatedLocation;

        return {
          ...prev,
          location: updatedLocations,
        };
      });
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Add a handler for reference select changes
  const handleReferenceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Find the selected option to get both reference and display
    let selectedOption: ReferenceOption | undefined;
    let referenceType = name.split('.')[0];

    if (referenceType === 'serviceProvider') {
      selectedOption = organizationOptions.find(
        (option) => option.reference === value,
      );
    } else if (referenceType === 'diagnosis') {
      selectedOption = conditionOptions.find(
        (option) => option.reference === value,
      );
    } else if (referenceType.includes('reasonReference')) {
      selectedOption = conditionOptions.find(
        (option) => option.reference === value,
      );
    } else if (referenceType.includes('participant')) {
      selectedOption = practitionerOptions.find(
        (option) => option.reference === value,
      );
    }

    if (name === 'serviceProvider.reference') {
      setFormData((prev) => ({
        ...prev,
        serviceProvider: {
          reference: value,
          display: selectedOption?.display || '',
        },
      }));
    } else if (name === 'diagnosis.0.condition.reference') {
      setFormData((prev) => ({
        ...prev,
        diagnosis: [
          {
            ...prev.diagnosis?.[0],
            condition: {
              reference: value,
              display: selectedOption?.display || '',
            },
            // Make sure use is always defined with required coding array
            use: prev.diagnosis?.[0]?.use || {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                  code: 'AD',
                  display: 'Admission Diagnosis',
                },
              ],
            },
          },
        ],
      }));
    } else if (name === 'reasonReference.0.reference') {
      setFormData((prev) => ({
        ...prev,
        reasonReference: [
          {
            reference: value,
            display: selectedOption?.display || '',
          },
        ],
      }));
    } else if (
      name.includes('participant') &&
      name.includes('actor.reference')
    ) {
      const participantIndex = parseInt(name.split('.')[1]);

      setFormData((prev) => {
        const updatedParticipants = [...(prev.participant || [])];

        if (!updatedParticipants[participantIndex]) {
          updatedParticipants[participantIndex] = {};
        }

        updatedParticipants[participantIndex] = {
          ...updatedParticipants[participantIndex],
          actor: {
            reference: value,
            display: selectedOption?.display || '',
          },
        };

        return {
          ...prev,
          participant: updatedParticipants,
        };
      });
    }
  };

  // Add a handler for location reference select changes
  const handleLocationReferenceChange = (index: number, value: string) => {
    const selectedOption = locationOptions.find(
      (option) => option.reference === value,
    );

    setFormData((prev) => {
      const updatedLocations = [...(prev.location || [])];

      if (!updatedLocations[index]) {
        updatedLocations[index] = { location: { display: '' } };
      }

      updatedLocations[index] = {
        ...updatedLocations[index],
        location: {
          reference: value,
          display: selectedOption?.display || '',
        },
      };

      return {
        ...prev,
        location: updatedLocations,
      };
    });
  };

  // Function to handle origin selection in hospitalization
  const handleOriginReferenceChange = (value: string) => {
    const selectedOption = locationOptions.find(
      (option) => option.reference === value,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        origin: {
          reference: value,
          display: selectedOption?.display || '',
        },
      },
    }));
  };

  // Function to handle destination selection in hospitalization
  const handleDestinationReferenceChange = (value: string) => {
    const selectedOption = locationOptions.find(
      (option) => option.reference === value,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        destination: {
          reference: value,
          display: selectedOption?.display || '',
        },
      },
    }));
  };

  // Function to handle pre-admission identifier system selection
  const handlePreAdmissionSystemChange = (systemCode: string) => {
    const selectedOption = IDENTIFIER_SYSTEM_OPTIONS.find(
      (option) => option.code === systemCode,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        preAdmissionIdentifier: {
          ...prev.hospitalization?.preAdmissionIdentifier,
          system: selectedOption?.system || '',
        },
      },
    }));
  };

  // Helper function to update nested fields
  const updateNestedField = (obj: any, path: string, value: any): any => {
    const parts = path.split('.');
    const newObj = { ...obj };

    if (parts.length === 1) {
      newObj[parts[0]] = value;
      return newObj;
    }

    const key = parts[0];
    const remainingPath = parts.slice(1).join('.');

    if (key.includes('[') && key.includes(']')) {
      // Handle array access
      const arrayName = key.split('[')[0];
      const index = parseInt(key.split('[')[1].split(']')[0]);

      if (!newObj[arrayName]) {
        newObj[arrayName] = [];
      }

      if (!newObj[arrayName][index]) {
        newObj[arrayName][index] = {};
      }

      newObj[arrayName][index] = updateNestedField(
        newObj[arrayName][index],
        remainingPath,
        value,
      );
    } else {
      // Handle object access
      if (!newObj[key]) {
        newObj[key] = {};
      }

      newObj[key] = updateNestedField(newObj[key], remainingPath, value);
    }

    return newObj;
  };

  // Helper function to get encounter type text
  const getEncounterTypeText = () => {
    if (formData.type && formData.type.length > 0) {
      if (formData.type[0].text && formData.type[0].text.trim() !== '') {
        return formData.type[0].text;
      } else if (
        formData.type[0].coding &&
        formData.type[0].coding.length > 0 &&
        formData.type[0].coding[0].display
      ) {
        return formData.type[0].coding[0].display;
      }
    }
    return '';
  };

  // Function to handle reason code selection
  const handleReasonCodeChange = (code: string) => {
    const selectedOption = REASON_CODE_OPTIONS.find(
      (option) => option.code === code,
    );

    setFormData((prev) => ({
      ...prev,
      reasonCode: [
        {
          text: selectedOption?.display || '',
          coding: [
            {
              system: selectedOption?.system || 'http://snomed.info/sct',
              code: code,
              display: selectedOption?.display || '',
            },
          ],
        },
      ],
    }));
  };

  // Function to add a reasonCode with empty defaults
  const addReasonCode = () => {
    setFormData((prev) => ({
      ...prev,
      reasonCode: [
        {
          text: '',
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '',
              display: '',
            },
          ],
        },
      ],
    }));
  };

  // This function is used in the view mode to display reason code text
  // Removing the unused function to fix the error

  // Function to handle location form type selection
  const handleLocationFormChange = (index: number, code: string) => {
    const selectedOption = LOCATION_FORM_OPTIONS.find(
      (option) => option.code === code,
    );

    setFormData((prev) => {
      const updatedLocations = [...(prev.location || [])];

      if (!updatedLocations[index]) {
        updatedLocations[index] = {
          location: { display: '' },
        };
      }

      // Add the form field with proper coding structure if it doesn't exist yet
      updatedLocations[index] = {
        ...updatedLocations[index],
        form: {
          coding: [
            {
              system:
                selectedOption?.system ||
                'http://terminology.hl7.org/CodeSystem/location-physical-type',
              code: code,
              display: selectedOption?.display || '',
            },
          ],
        },
      };

      return {
        ...prev,
        location: updatedLocations,
      };
    });
  };

  // Admission source options
  const ADMIT_SOURCE_OPTIONS = [
    {
      code: 'hosp-trans',
      display: 'Transferred from other hospital',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'emd',
      display: 'From emergency department',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'outp',
      display: 'From outpatient department',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'born',
      display: 'Born in hospital',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'gp',
      display: 'General Practitioner referral',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'mp',
      display: 'Medical Practitioner/physician referral',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'nursing',
      display: 'From nursing home',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'psych',
      display: 'From psychiatric hospital',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'rehab',
      display: 'From rehabilitation facility',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
    {
      code: 'other',
      display: 'Other',
      system: 'http://terminology.hl7.org/CodeSystem/admit-source',
    },
  ];

  // Re-admission options
  const READMISSION_OPTIONS = [
    {
      code: 'R',
      display: 'Re-admission',
      system: 'http://terminology.hl7.org/CodeSystem/v2-0092',
    },
    {
      code: 'UR',
      display: 'Unscheduled re-admission',
      system: 'http://terminology.hl7.org/CodeSystem/v2-0092',
    },
  ];

  // Discharge disposition options
  const DISCHARGE_DISPOSITION_OPTIONS = [
    {
      code: 'home',
      display: 'Home',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'alt-home',
      display: 'Alternative home',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'other-hcf',
      display: 'Other healthcare facility',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'hosp',
      display: 'Hospice',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'long',
      display: 'Long-term care',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'snf',
      display: 'Skilled nursing facility',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
    {
      code: 'oth',
      display: 'Other',
      system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
    },
  ];

  // Function to handle admission source selection
  const handleAdmitSourceChange = (code: string) => {
    const selectedOption = ADMIT_SOURCE_OPTIONS.find(
      (option) => option.code === code,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        admitSource: {
          coding: [
            {
              system:
                selectedOption?.system ||
                'http://terminology.hl7.org/CodeSystem/admit-source',
              code: code,
              display: selectedOption?.display || '',
            },
          ],
        },
      },
    }));
  };

  // Function to handle discharge disposition selection
  const handleDischargeDispositionChange = (code: string) => {
    const selectedOption = DISCHARGE_DISPOSITION_OPTIONS.find(
      (option) => option.code === code,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        dischargeDisposition: {
          coding: [
            {
              system:
                selectedOption?.system ||
                'http://terminology.hl7.org/CodeSystem/discharge-disposition',
              code: code,
              display: selectedOption?.display || '',
            },
          ],
        },
      },
    }));
  };

  // Function to handle readmission selection
  const handleReadmissionChange = (code: string) => {
    const selectedOption = READMISSION_OPTIONS.find(
      (option) => option.code === code,
    );

    setFormData((prev) => ({
      ...prev,
      hospitalization: {
        ...prev.hospitalization,
        reAdmission: {
          coding: [
            {
              system:
                selectedOption?.system ||
                'http://terminology.hl7.org/CodeSystem/v2-0092',
              code: code,
              display: selectedOption?.display || '',
            },
          ],
        },
      },
    }));
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Create a deep clone of form data
      const rawData = JSON.parse(JSON.stringify(formData));

      // Create a clean data structure with proper arrays (not objects with numeric keys)
      const cleanedFormData: CustomEncounter = {
        ...rawData,
        resourceType: 'Encounter',
      };

      // Fix periods with proper date formatting
      if (cleanedFormData.actualPeriod) {
        if (cleanedFormData.actualPeriod.start) {
          cleanedFormData.actualPeriod.start = new Date(
            cleanedFormData.actualPeriod.start,
          ).toISOString();
        }
        if (cleanedFormData.actualPeriod.end) {
          cleanedFormData.actualPeriod.end = new Date(
            cleanedFormData.actualPeriod.end,
          ).toISOString();
        }
      }

      // Ensure participant structure is correct
      if (
        cleanedFormData.participant &&
        Array.isArray(cleanedFormData.participant)
      ) {
        cleanedFormData.participant = cleanedFormData.participant.map(
          (participant) => {
            // Create a new participant object with the correct structure
            const cleanParticipant: any = { ...participant };

            // Handle type field - ensure it's a proper array, not an object with numeric keys
            if (participant.type) {
              // Create a proper array of type objects
              cleanParticipant.type = Array.isArray(participant.type)
                ? participant.type.map((typeItem) => {
                    if (typeof typeItem === 'object' && typeItem !== null) {
                      const newTypeItem: any = {};

                      // Copy text property
                      if (typeItem && 'text' in typeItem) {
                        newTypeItem.text = typeItem.text;
                      }

                      // Ensure coding is a proper array
                      if (typeItem && 'coding' in typeItem) {
                        const coding = typeItem.coding;
                        if (coding) {
                          newTypeItem.coding = Array.isArray(coding)
                            ? coding.map((code) =>
                                typeof code === 'object' && code !== null
                                  ? { ...code }
                                  : { code },
                              )
                            : Object.values(coding).map((code) =>
                                typeof code === 'object' && code !== null
                                  ? { ...code }
                                  : { code },
                              );
                        }
                      }

                      return newTypeItem;
                    }
                    return typeItem;
                  })
                : Object.values(participant.type).map((typeItem) => {
                    if (typeof typeItem === 'object') {
                      const newTypeItem: any = {};

                      // Copy text property
                      if (
                        typeItem !== null &&
                        typeItem !== undefined &&
                        'text' in typeItem
                      ) {
                        newTypeItem.text = typeItem.text;
                      }

                      // Ensure coding is a proper array
                      if (
                        typeItem !== null &&
                        typeItem !== undefined &&
                        'coding' in typeItem
                      ) {
                        const coding = typeItem.coding;
                        if (coding) {
                          newTypeItem.coding = Array.isArray(coding)
                            ? coding.map((code) => ({ ...code }))
                            : Object.values(coding).map((code) => ({
                                ...code,
                              }));
                        }
                      }

                      return newTypeItem;
                    }
                    return typeItem;
                  });
            }

            // Handle period field - ensure dates are properly formatted
            if (participant.period) {
              cleanParticipant.period = { ...participant.period };
              if (cleanParticipant.period.start) {
                cleanParticipant.period.start = new Date(
                  cleanParticipant.period.start,
                ).toISOString();
              }
              if (cleanParticipant.period.end) {
                cleanParticipant.period.end = new Date(
                  cleanParticipant.period.end,
                ).toISOString();
              }
            }

            return cleanParticipant;
          },
        );
      }

      // Log the structure for debugging
      console.log(
        'Cleaned form data participant structure:',
        cleanedFormData.participant?.[0]?.type
          ? JSON.stringify(cleanedFormData.participant[0].type, null, 2)
          : 'No participants',
      );

      // Remove empty arrays and objects
      Object.keys(cleanedFormData).forEach((key) => {
        if (
          Array.isArray(cleanedFormData[key as keyof typeof cleanedFormData]) &&
          (cleanedFormData[key as keyof typeof cleanedFormData] as any[])
            .length === 0
        ) {
          delete cleanedFormData[key as keyof typeof cleanedFormData];
        } else if (
          typeof cleanedFormData[key as keyof typeof cleanedFormData] ===
            'object' &&
          cleanedFormData[key as keyof typeof cleanedFormData] !== null &&
          Object.keys(
            cleanedFormData[key as keyof typeof cleanedFormData] || {},
          ).length === 0
        ) {
          delete cleanedFormData[key as keyof typeof cleanedFormData];
        }
      });

      if (resourceId) {
        // Update existing resource
        await updateResource({
          resourceType: 'Encounter',
          id: resourceId,
          resource: cleanedFormData as Encounter,
        });
      } else {
        // Create new resource
        await createResource({
          resourceType: 'Encounter',
          resource: cleanedFormData as Encounter,
        });
      }
      // Navigate back to list view after successful operation
      navigate(`/patient/${patientId}/encounter`);
    } catch (error) {
      console.error('Error saving encounter:', error);
      alert('Failed to save encounter. Please try again.');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (
      !resourceId ||
      !window.confirm('Are you sure you want to delete this encounter?')
    ) {
      return;
    }

    try {
      await deleteResource({
        resourceType: 'Encounter',
        id: resourceId,
      });
      navigate(`/patient/${patientId}/encounter`);
    } catch (error) {
      console.error('Error deleting encounter:', error);
      alert('Failed to delete encounter. Please try again.');
    }
  };

  if (isLoadingResource && resourceId) {
    return (
      <div className="flex justify-center items-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Helper function to format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  // Helper function to format date for input
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toISOString().substring(0, 16);
    } catch {
      return '';
    }
  };

  // Helper function to get class display text
  const getClassDisplay = () => {
    if (formData.class && formData.class.length > 0) {
      const classCoding = formData.class[0]?.coding?.[0];
      return classCoding?.display || classCoding?.code || '';
    }
    return '';
  };

  // Function to add a new participant
  const addParticipant = () => {
    setFormData((prev) => ({
      ...prev,
      participant: [
        ...(prev.participant || []),
        {
          type: [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  code: '',
                  display: '',
                },
              ],
              text: '',
            },
          ],
          period: {
            start: new Date().toISOString(),
            end: undefined,
          },
          actor: {
            reference: '',
            display: '',
          },
        },
      ],
    }));
  };

  // Function to add a new location
  const addLocation = () => {
    setFormData((prev) => ({
      ...prev,
      location: [
        ...(prev.location || []),
        {
          status: 'active',
          location: {
            display: '',
          },
        },
      ],
    }));
  };

  // Function to remove a participant
  const removeParticipant = (index: number) => {
    setFormData((prev) => {
      const updatedParticipants = [...(prev.participant || [])];
      updatedParticipants.splice(index, 1);
      return {
        ...prev,
        participant: updatedParticipants.length
          ? updatedParticipants
          : undefined,
      };
    });
  };

  // Function to remove a location
  const removeLocation = (index: number) => {
    setFormData((prev) => {
      const updatedLocations = [...(prev.location || [])];
      updatedLocations.splice(index, 1);
      return {
        ...prev,
        location: updatedLocations.length ? updatedLocations : undefined,
      };
    });
  };

  // Render a group for view mode
  const renderViewGroup = (group: FormGroup) => {
    return (
      <div key={group.id} className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">
          {group.title}
        </h3>
        {group.description && (
          <p className="text-sm text-gray-500 mb-3">{group.description}</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {group.id === 'overview' && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Encounter Type
                </p>
                <p className="text-gray-900">{getEncounterTypeText() || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Status</p>
                <p className="text-gray-900 capitalize">
                  {formData.status || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Class</p>
                <p className="text-gray-900">{getClassDisplay() || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Patient
                </p>
                <p className="text-gray-900">
                  {formData.subject?.display || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Start Date/Time
                </p>
                <p className="text-gray-900">
                  {formatDate(formData.actualPeriod?.start) || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  End Date/Time
                </p>
                <p className="text-gray-900">
                  {formatDate(formData.actualPeriod?.end) || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Service Provider
                </p>
                <p className="text-gray-900">
                  {formData.serviceProvider?.display || '-'}
                </p>
              </div>
            </>
          )}

          {group.id === 'diagnosis' && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Condition
                </p>
                <p className="text-gray-900">
                  {formData.diagnosis?.[0]?.condition?.display || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Use</p>
                <p className="text-gray-900">
                  {formData.diagnosis?.[0]?.use?.coding?.[0]?.code
                    ? (() => {
                        const code = formData.diagnosis[0].use.coding[0].code;
                        const useMap: Record<string, string> = {
                          AD: 'Admission Diagnosis',
                          DD: 'Discharge Diagnosis',
                          CC: 'Chief Complaint',
                          CM: 'Comorbidity',
                          'pre-op': 'Pre-operative Diagnosis',
                          'post-op': 'Post-operative Diagnosis',
                          billing: 'Billing Diagnosis',
                        };
                        return useMap[code] || code;
                      })()
                    : '-'}
                </p>
              </div>
            </>
          )}

          {group.id === 'participant' && (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Participants
              </p>
              {formData.participant && formData.participant.length > 0 ? (
                <div className="space-y-2">
                  {formData.participant.map((participant, index) => (
                    <div
                      key={index}
                      className="pl-3 border-l-2 border-gray-200"
                    >
                      <p className="text-gray-900">
                        <span className="font-medium">Type:</span>{' '}
                        {participant.type?.[0]?.text
                          ? participant.type[0].text
                          : participant.type?.[0]?.coding?.[0]?.display ||
                            participant.type?.[0]?.coding?.[0]?.code ||
                            '-'}
                        {participant.type?.[0]?.text &&
                          participant.type?.[0]?.coding?.[0]?.display &&
                          ` (${participant.type[0].coding[0].display})`}
                      </p>
                      <p className="text-gray-900">
                        <span className="font-medium">Actor:</span>{' '}
                        {participant.actor?.display || '-'}
                        {participant.period?.end
                          ? ` End: ${formatDate(participant.period.end)}`
                          : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No participants added.
                </p>
              )}
            </div>
          )}

          {group.id === 'reason' && (
            <div className="sm:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Reason Code - Similar to Participant Type */}
                <div>
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason Code
                    </label>
                    {!formData.reasonCode?.length && (
                      <button
                        type="button"
                        onClick={addReasonCode}
                        className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 focus:outline-none"
                      >
                        Add Reason
                      </button>
                    )}
                  </div>

                  {formData.reasonCode && formData.reasonCode.length > 0 ? (
                    <>
                      <input
                        type="text"
                        name="reasonCode.0.text"
                        id="reasonCode.0.text-view"
                        value={formData.reasonCode[0].text || ''}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            reasonCode: [
                              {
                                ...prev.reasonCode?.[0],
                                text: e.target.value,
                                coding: [
                                  {
                                    system:
                                      prev.reasonCode?.[0]?.coding?.[0]
                                        ?.system || 'http://snomed.info/sct',
                                    code:
                                      prev.reasonCode?.[0]?.coding?.[0]?.code ||
                                      '',
                                    display: e.target.value,
                                  },
                                ],
                              },
                            ],
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-2"
                        placeholder="Custom reason description"
                      />

                      <select
                        value={formData.reasonCode[0]?.coding?.[0]?.code || ''}
                        onChange={(e) => handleReasonCodeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        aria-label="Select a reason code"
                        disabled
                      >
                        <option value="">Select reason code</option>
                        {REASON_CODE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      No reason code added.
                    </p>
                  )}
                </div>

                {/* Reason Reference - Similar to Actor */}
                <div>
                  <label
                    htmlFor="reasonReference.0.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Reason Reference
                  </label>
                  <select
                    name="reasonReference.0.reference"
                    id="reasonReference.0.reference"
                    value={formData.reasonReference?.[0]?.reference || ''}
                    onChange={handleReferenceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select a reason reference</option>
                    {conditionOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {group.id === 'location' && (
            <div className="sm:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Locations
                </label>
                <button
                  type="button"
                  onClick={addLocation}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Add Location
                </button>
              </div>

              {(formData.location || []).map((location, index) => (
                <div
                  key={index}
                  className="border border-gray-200 p-3 rounded-md mb-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Location name/description */}
                    <div>
                      <label
                        htmlFor={`location.${index}.location.reference`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Location Reference *
                      </label>
                      <select
                        name={`location.${index}.location.reference`}
                        id={`location.${index}.location.reference`}
                        value={location.location?.reference || ''}
                        onChange={(e) =>
                          handleLocationReferenceChange(index, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                        disabled
                      >
                        <option value="">Select a location</option>
                        {locationOptions.map((option) => (
                          <option
                            key={option.reference}
                            value={option.reference}
                          >
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location status */}
                    <div>
                      <label
                        htmlFor={`location.${index}.status`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Status
                      </label>
                      <select
                        name={`location.${index}.status`}
                        id={`location.${index}.status`}
                        value={location.status || 'active'}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled
                      >
                        {LOCATION_STATUS_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location form (physical type) */}
                    <div>
                      <label
                        id={`location-${index}-form-label`}
                        htmlFor={`location.${index}.form`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Physical Type
                      </label>
                      <select
                        id={`location.${index}.form`}
                        name={`location.${index}.form`}
                        aria-labelledby={`location-${index}-form-label`}
                        value={location.form?.coding?.[0]?.code || ''}
                        onChange={(e) =>
                          handleLocationFormChange(index, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled
                      >
                        <option value="">Select location type</option>
                        {LOCATION_FORM_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location period */}
                    <div>
                      <label
                        htmlFor={`location.${index}.period.start`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        name={`location.${index}.period.start`}
                        id={`location.${index}.period.start`}
                        value={formatDateForInput(location.period?.start)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2"
                        disabled
                      />

                      <label
                        htmlFor={`location.${index}.period.end`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        End Time
                      </label>
                      <input
                        type="datetime-local"
                        name={`location.${index}.period.end`}
                        id={`location.${index}.period.end`}
                        value={formatDateForInput(location.period?.end)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        disabled
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLocation(index)}
                      className="px-2 py-1 text-xs font-medium text-red-600 border border-red-600 rounded-md hover:bg-red-50 focus:outline-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!formData.location?.length && (
                <p className="text-sm text-gray-500 italic">
                  No locations added yet.
                </p>
              )}
            </div>
          )}

          {group.id === 'admission' && (
            <div className="sm:col-span-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Pre-admission identifier - system first, then value */}
                <div>
                  <label
                    id="pre-admission-system-label"
                    htmlFor="hospitalization.preAdmissionIdentifier.system"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Pre-admission Identifier System
                  </label>
                  <select
                    id="hospitalization.preAdmissionIdentifier.system"
                    aria-labelledby="pre-admission-system-label"
                    value={(() => {
                      const systemUrl =
                        formData.hospitalization?.preAdmissionIdentifier
                          ?.system || '';
                      const option = IDENTIFIER_SYSTEM_OPTIONS.find(
                        (opt) => opt.system === systemUrl,
                      );
                      return option?.code || '';
                    })()}
                    onChange={(e) =>
                      handlePreAdmissionSystemChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select identifier system</option>
                    {IDENTIFIER_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="hospitalization.preAdmissionIdentifier.value"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Pre-admission Identifier Value
                  </label>
                  <input
                    type="text"
                    name="hospitalization.preAdmissionIdentifier.value"
                    id="hospitalization.preAdmissionIdentifier.value"
                    value={
                      formData.hospitalization?.preAdmissionIdentifier?.value ||
                      ''
                    }
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        hospitalization: {
                          ...prev.hospitalization,
                          preAdmissionIdentifier: {
                            ...prev.hospitalization?.preAdmissionIdentifier,
                            value: e.target.value,
                          },
                        },
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Pre-admission ID"
                    disabled
                  />
                </div>

                {/* Origin */}
                <div>
                  <label
                    htmlFor="hospitalization.origin.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Origin (Location/Organization)
                  </label>
                  <select
                    name="hospitalization.origin.reference"
                    id="hospitalization.origin.reference"
                    value={formData.hospitalization?.origin?.reference || ''}
                    onChange={(e) =>
                      handleOriginReferenceChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select origin</option>
                    {locationOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Admit Source */}
                <div>
                  <label
                    id="admit-source-label"
                    htmlFor="hospitalization.admitSource"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Admit Source
                  </label>
                  <select
                    id="hospitalization.admitSource"
                    aria-labelledby="admit-source-label"
                    value={
                      formData.hospitalization?.admitSource?.coding?.[0]
                        ?.code || ''
                    }
                    onChange={(e) => handleAdmitSourceChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select admit source</option>
                    {ADMIT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Re-admission */}
                <div>
                  <label
                    id="readmission-label"
                    htmlFor="hospitalization.reAdmission"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Re-admission
                  </label>
                  <select
                    id="hospitalization.reAdmission"
                    aria-labelledby="readmission-label"
                    value={
                      formData.hospitalization?.reAdmission?.coding?.[0]
                        ?.code || ''
                    }
                    onChange={(e) => handleReadmissionChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Not a re-admission</option>
                    {READMISSION_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination */}
                <div>
                  <label
                    htmlFor="hospitalization.destination.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Destination
                  </label>
                  <select
                    name="hospitalization.destination.reference"
                    id="hospitalization.destination.reference"
                    value={
                      formData.hospitalization?.destination?.reference || ''
                    }
                    onChange={(e) =>
                      handleDestinationReferenceChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select destination</option>
                    {locationOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Discharge Disposition */}
                <div>
                  <label
                    id="discharge-disposition-label"
                    htmlFor="hospitalization.dischargeDisposition"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Discharge Disposition
                  </label>
                  <select
                    id="hospitalization.dischargeDisposition"
                    name="hospitalization.dischargeDisposition"
                    aria-labelledby="discharge-disposition-label"
                    value={
                      formData.hospitalization?.dischargeDisposition
                        ?.coding?.[0]?.code || ''
                    }
                    onChange={(e) =>
                      handleDischargeDispositionChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    disabled
                  >
                    <option value="">Select discharge disposition</option>
                    {DISCHARGE_DISPOSITION_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render a group for edit mode
  const renderEditGroup = (group: FormGroup) => {
    return (
      <div key={group.id} className="border-b border-gray-200 pb-4">
        <h3 className="text-lg font-medium text-gray-900 mb-3">
          {group.title}
        </h3>
        {group.description && (
          <p className="text-sm text-gray-500 mb-3">{group.description}</p>
        )}

        {/* Render form fields based on group elements */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {group.id === 'overview' && (
            <>
              <div>
                <label
                  htmlFor="type.text"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Encounter Type
                </label>
                <input
                  type="text"
                  name="type.text"
                  id="type.text"
                  value={formData.type?.[0]?.text || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  id="status-label"
                  htmlFor="status"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  aria-labelledby="status-label"
                  value={formData.status || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="planned">Planned</option>
                  <option value="in-progress">In Progress</option>
                  <option value="finished">Finished</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="entered-in-error">Entered in Error</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="class.coding.0.code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Class
                </label>
                <select
                  id="class.coding.0.code"
                  name="class.coding.0.code"
                  value={formData.class?.[0]?.coding?.[0]?.code || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a class</option>
                  <option value="AMB">Ambulatory</option>
                  <option value="EMER">Emergency</option>
                  <option value="IMP">Inpatient</option>
                  <option value="ACUTE">Acute</option>
                  <option value="NONAC">Non-Acute</option>
                  <option value="PRENC">Pre-Admission</option>
                  <option value="SS">Short Stay</option>
                  <option value="VR">Virtual</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="subject.display"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Patient
                </label>
                <input
                  type="text"
                  name="subject.display"
                  id="subject.display"
                  value={formData.subject?.display || ''}
                  readOnly
                  disabled
                  className="bg-gray-100 shadow-sm block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label
                  htmlFor="actualPeriod.start"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Start Date/Time
                </label>
                <input
                  type="datetime-local"
                  name="actualPeriod.start"
                  id="actualPeriod.start"
                  value={formatDateForInput(formData.actualPeriod?.start)}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label
                  htmlFor="actualPeriod.end"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  End Date/Time
                </label>
                <input
                  type="datetime-local"
                  name="actualPeriod.end"
                  id="actualPeriod.end"
                  value={formatDateForInput(formData.actualPeriod?.end)}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label
                  htmlFor="serviceProvider.reference"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Service Provider
                </label>
                <select
                  name="serviceProvider.reference"
                  id="serviceProvider.reference"
                  value={formData.serviceProvider?.reference || ''}
                  onChange={handleReferenceChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a service provider</option>
                  {organizationOptions.map((option) => (
                    <option key={option.reference} value={option.reference}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {group.id === 'diagnosis' && (
            <div className="sm:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="diagnosis.0.condition.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Condition
                  </label>
                  <select
                    name="diagnosis.0.condition.reference"
                    id="diagnosis.0.condition.reference"
                    value={formData.diagnosis?.[0]?.condition?.reference || ''}
                    onChange={handleReferenceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a condition</option>
                    {conditionOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="diagnosis.0.use.coding.0.code"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Use
                  </label>
                  <select
                    name="diagnosis.0.use.coding.0.code"
                    id="diagnosis.0.use.coding.0.code"
                    value={
                      formData.diagnosis?.[0]?.use?.coding?.[0]?.code || ''
                    }
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select diagnosis use</option>
                    <option value="AD">Admission Diagnosis</option>
                    <option value="DD">Discharge Diagnosis</option>
                    <option value="CC">Chief Complaint</option>
                    <option value="CM">Comorbidity</option>
                    <option value="pre-op">Pre-operative Diagnosis</option>
                    <option value="post-op">Post-operative Diagnosis</option>
                    <option value="billing">Billing Diagnosis</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {group.id === 'participant' && (
            <div className="sm:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Participants
                </label>
                <button
                  type="button"
                  onClick={addParticipant}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Add Participant
                </button>
              </div>

              {(formData.participant || []).map((participant, index) => (
                <div
                  key={index}
                  className="border border-gray-200 p-3 rounded-md mb-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Type field */}
                    <div>
                      <label
                        htmlFor={`participant.${index}.type.0.text`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Type Text
                      </label>
                      <input
                        type="text"
                        name={`participant.${index}.type.0.text`}
                        id={`participant.${index}.type.0.text`}
                        value={participant.type?.[0]?.text || ''}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-2"
                        placeholder="Custom type description"
                      />
                      <label
                        htmlFor={`participant.${index}.type.0.coding.0.code`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Type Coding
                      </label>
                      <select
                        name={`participant.${index}.type.0.coding.0.code`}
                        id={`participant.${index}.type.0.coding.0.code`}
                        value={participant.type?.[0]?.coding?.[0]?.code || ''}
                        onChange={(e) => {
                          const selectedCode = e.target.value;
                          const selectedOption = PARTICIPANT_TYPE_OPTIONS.find(
                            (option) => option.code === selectedCode,
                          );

                          // Update both the code and display values for the selected coding
                          setFormData((prev) => {
                            const updatedParticipants = [
                              ...(prev.participant || []),
                            ];

                            // Create a fresh new object for this participant
                            updatedParticipants[index] = {
                              ...(updatedParticipants[index] || {}),
                            };

                            // Create a fresh type array
                            if (!updatedParticipants[index].type) {
                              updatedParticipants[index].type = [{}];
                            } else {
                              // Clone the type array to ensure it's extensible
                              updatedParticipants[index].type = [
                                ...updatedParticipants[index].type,
                              ];
                              // Ensure the first element exists and is extensible
                              updatedParticipants[index].type[0] = {
                                ...(updatedParticipants[index].type[0] || {}),
                              };
                            }

                            // Create a fresh coding array
                            if (!updatedParticipants[index].type[0].coding) {
                              updatedParticipants[index].type[0].coding = [{}];
                            } else {
                              // Clone the coding array to ensure it's extensible
                              updatedParticipants[index].type[0].coding = [
                                ...updatedParticipants[index].type[0].coding,
                              ];
                              // Ensure the first element exists and is extensible
                              updatedParticipants[index].type[0].coding[0] = {
                                ...(updatedParticipants[index].type[0]
                                  .coding[0] || {}),
                              };
                            }

                            // Now assign the new values to the freshly created extensible object
                            updatedParticipants[index].type[0].coding[0] = {
                              system:
                                selectedOption?.system ||
                                'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                              code: selectedCode,
                              display: selectedOption?.display || '',
                            };

                            return {
                              ...prev,
                              participant: updatedParticipants,
                            };
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select participant type coding</option>
                        {PARTICIPANT_TYPE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actor field (reference) */}
                    <div>
                      <label
                        htmlFor={`participant.${index}.actor.reference`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Actor
                      </label>
                      <select
                        name={`participant.${index}.actor.reference`}
                        id={`participant.${index}.actor.reference`}
                        value={participant.actor?.reference || ''}
                        onChange={handleReferenceChange}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                          participant.actor?.reference &&
                          !practitionerOptions.some(
                            (opt) =>
                              opt.reference === participant.actor?.reference,
                          )
                            ? 'bg-yellow-50'
                            : ''
                        }`}
                      >
                        <option value="">Select actor</option>
                        {/* Add an option for the current participant if it exists but isn't in practitionerOptions */}
                        {participant.actor?.reference &&
                          !practitionerOptions.some(
                            (opt) =>
                              opt.reference === participant.actor?.reference,
                          ) && (
                            <option
                              value={participant.actor.reference}
                              key={participant.actor.reference}
                            >
                              {participant.actor.display ||
                                participant.actor.reference}
                            </option>
                          )}
                        {practitionerOptions.map((option) => (
                          <option
                            key={option.reference}
                            value={option.reference}
                          >
                            {option.display}
                          </option>
                        ))}
                      </select>
                      {participant.actor?.reference &&
                        !practitionerOptions.some(
                          (opt) =>
                            opt.reference === participant.actor?.reference,
                        ) && (
                          <p className="text-xs text-yellow-600 mt-1">
                            Loading practitioner data...
                          </p>
                        )}
                    </div>

                    {/* Period start field */}
                    <div>
                      <label
                        htmlFor={`participant.${index}.period.start`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Period Start
                      </label>
                      <input
                        type="datetime-local"
                        name={`participant.${index}.period.start`}
                        id={`participant.${index}.period.start`}
                        value={formatDateForInput(participant.period?.start)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>

                    {/* Period end field */}
                    <div>
                      <label
                        htmlFor={`participant.${index}.period.end`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Period End
                      </label>
                      <input
                        type="datetime-local"
                        name={`participant.${index}.period.end`}
                        id={`participant.${index}.period.end`}
                        value={formatDateForInput(participant.period?.end)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeParticipant(index)}
                      className="px-2 py-1 text-xs font-medium text-red-600 border border-red-600 rounded-md hover:bg-red-50 focus:outline-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!formData.participant?.length && (
                <p className="text-sm text-gray-500 italic">
                  No participants added yet.
                </p>
              )}
            </div>
          )}

          {group.id === 'reason' && (
            <div className="sm:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Reason Code - Similar to Participant Type */}
                <div>
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason Code
                    </label>
                    {!formData.reasonCode?.length && (
                      <button
                        type="button"
                        onClick={addReasonCode}
                        className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 focus:outline-none"
                      >
                        Add Reason
                      </button>
                    )}
                  </div>

                  {formData.reasonCode && formData.reasonCode.length > 0 ? (
                    <>
                      <input
                        type="text"
                        name="reasonCode.0.text"
                        id="reasonCode.0.text"
                        value={formData.reasonCode[0].text || ''}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            reasonCode: [
                              {
                                ...prev.reasonCode?.[0],
                                text: e.target.value,
                                coding: [
                                  {
                                    system:
                                      prev.reasonCode?.[0]?.coding?.[0]
                                        ?.system || 'http://snomed.info/sct',
                                    code:
                                      prev.reasonCode?.[0]?.coding?.[0]?.code ||
                                      '',
                                    display: e.target.value,
                                  },
                                ],
                              },
                            ],
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-2"
                        placeholder="Custom reason description"
                      />

                      <select
                        value={formData.reasonCode[0]?.coding?.[0]?.code || ''}
                        onChange={(e) => handleReasonCodeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        aria-label="Select a reason code"
                      >
                        <option value="">Select reason code</option>
                        {REASON_CODE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      No reason code added.
                    </p>
                  )}
                </div>

                {/* Reason Reference - Similar to Actor */}
                <div>
                  <label
                    htmlFor="reasonReference.0.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Reason Reference
                  </label>
                  <select
                    name="reasonReference.0.reference"
                    id="reasonReference.0.reference"
                    value={formData.reasonReference?.[0]?.reference || ''}
                    onChange={handleReferenceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a reason reference</option>
                    {conditionOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {group.id === 'location' && (
            <div className="sm:col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Locations
                </label>
                <button
                  type="button"
                  onClick={addLocation}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Add Location
                </button>
              </div>

              {(formData.location || []).map((location, index) => (
                <div
                  key={index}
                  className="border border-gray-200 p-3 rounded-md mb-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Location name/description */}
                    <div>
                      <label
                        htmlFor={`location.${index}.location.reference`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Location Reference *
                      </label>
                      <select
                        name={`location.${index}.location.reference`}
                        id={`location.${index}.location.reference`}
                        value={location.location?.reference || ''}
                        onChange={(e) =>
                          handleLocationReferenceChange(index, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select a location</option>
                        {locationOptions.map((option) => (
                          <option
                            key={option.reference}
                            value={option.reference}
                          >
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location status */}
                    <div>
                      <label
                        htmlFor={`location.${index}.status`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Status
                      </label>
                      <select
                        name={`location.${index}.status`}
                        id={`location.${index}.status`}
                        value={location.status || 'active'}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {LOCATION_STATUS_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location form (physical type) */}
                    <div>
                      <label
                        id={`location-${index}-form-label`}
                        htmlFor={`location.${index}.form`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Physical Type
                      </label>
                      <select
                        id={`location.${index}.form`}
                        name={`location.${index}.form`}
                        aria-labelledby={`location-${index}-form-label`}
                        value={location.form?.coding?.[0]?.code || ''}
                        onChange={(e) =>
                          handleLocationFormChange(index, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select location type</option>
                        {LOCATION_FORM_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.display}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Location period */}
                    <div>
                      <label
                        htmlFor={`location.${index}.period.start`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        name={`location.${index}.period.start`}
                        id={`location.${index}.period.start`}
                        value={formatDateForInput(location.period?.start)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2"
                      />

                      <label
                        htmlFor={`location.${index}.period.end`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        End Time
                      </label>
                      <input
                        type="datetime-local"
                        name={`location.${index}.period.end`}
                        id={`location.${index}.period.end`}
                        value={formatDateForInput(location.period?.end)}
                        onChange={handleChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLocation(index)}
                      className="px-2 py-1 text-xs font-medium text-red-600 border border-red-600 rounded-md hover:bg-red-50 focus:outline-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!formData.location?.length && (
                <p className="text-sm text-gray-500 italic">
                  No locations added yet.
                </p>
              )}
            </div>
          )}

          {group.id === 'admission' && (
            <div className="sm:col-span-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Pre-admission identifier - system first, then value */}
                <div>
                  <label
                    id="pre-admission-system-label"
                    htmlFor="hospitalization.preAdmissionIdentifier.system"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Pre-admission Identifier System
                  </label>
                  <select
                    id="hospitalization.preAdmissionIdentifier.system"
                    aria-labelledby="pre-admission-system-label"
                    value={(() => {
                      const systemUrl =
                        formData.hospitalization?.preAdmissionIdentifier
                          ?.system || '';
                      const option = IDENTIFIER_SYSTEM_OPTIONS.find(
                        (opt) => opt.system === systemUrl,
                      );
                      return option?.code || '';
                    })()}
                    onChange={(e) =>
                      handlePreAdmissionSystemChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select identifier system</option>
                    {IDENTIFIER_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="hospitalization.preAdmissionIdentifier.value"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Pre-admission Identifier Value
                  </label>
                  <input
                    type="text"
                    name="hospitalization.preAdmissionIdentifier.value"
                    id="hospitalization.preAdmissionIdentifier.value"
                    value={
                      formData.hospitalization?.preAdmissionIdentifier?.value ||
                      ''
                    }
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        hospitalization: {
                          ...prev.hospitalization,
                          preAdmissionIdentifier: {
                            ...prev.hospitalization?.preAdmissionIdentifier,
                            value: e.target.value,
                          },
                        },
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Pre-admission ID"
                  />
                </div>

                {/* Origin */}
                <div>
                  <label
                    htmlFor="hospitalization.origin.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Origin (Location/Organization)
                  </label>
                  <select
                    name="hospitalization.origin.reference"
                    id="hospitalization.origin.reference"
                    value={formData.hospitalization?.origin?.reference || ''}
                    onChange={(e) =>
                      handleOriginReferenceChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select origin</option>
                    {locationOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Admit Source */}
                <div>
                  <label
                    id="admit-source-label"
                    htmlFor="hospitalization.admitSource"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Admit Source
                  </label>
                  <select
                    id="hospitalization.admitSource"
                    aria-labelledby="admit-source-label"
                    value={
                      formData.hospitalization?.admitSource?.coding?.[0]
                        ?.code || ''
                    }
                    onChange={(e) => handleAdmitSourceChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select admit source</option>
                    {ADMIT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Re-admission */}
                <div>
                  <label
                    id="readmission-label"
                    htmlFor="hospitalization.reAdmission"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Re-admission
                  </label>
                  <select
                    id="hospitalization.reAdmission"
                    aria-labelledby="readmission-label"
                    value={
                      formData.hospitalization?.reAdmission?.coding?.[0]
                        ?.code || ''
                    }
                    onChange={(e) => handleReadmissionChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Not a re-admission</option>
                    {READMISSION_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination */}
                <div>
                  <label
                    htmlFor="hospitalization.destination.reference"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Destination
                  </label>
                  <select
                    name="hospitalization.destination.reference"
                    id="hospitalization.destination.reference"
                    value={
                      formData.hospitalization?.destination?.reference || ''
                    }
                    onChange={(e) =>
                      handleDestinationReferenceChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select destination</option>
                    {locationOptions.map((option) => (
                      <option key={option.reference} value={option.reference}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Discharge Disposition */}
                <div>
                  <label
                    id="discharge-disposition-label"
                    htmlFor="hospitalization.dischargeDisposition"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Discharge Disposition
                  </label>
                  <select
                    id="hospitalization.dischargeDisposition"
                    name="hospitalization.dischargeDisposition"
                    aria-labelledby="discharge-disposition-label"
                    value={
                      formData.hospitalization?.dischargeDisposition
                        ?.coding?.[0]?.code || ''
                    }
                    onChange={(e) =>
                      handleDischargeDispositionChange(e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select discharge disposition</option>
                    {DISCHARGE_DISPOSITION_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.display}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">
            {!resourceId
              ? 'Create New Encounter'
              : isEditMode
              ? 'Edit Encounter'
              : 'Encounter Details'}
          </h2>
          <p className="text-gray-600">
            {!resourceId
              ? getPatientDisplayName(patient)
                ? `Creating new encounter for ${getPatientDisplayName(patient)}`
                : 'Creating new encounter'
              : formData?.subject?.display
              ? `Encounter for ${formData.subject.display}`
              : getPatientDisplayName(patient)
              ? `Encounter for ${getPatientDisplayName(patient)}`
              : 'Encounter details'}
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
          {formGroups.map(renderViewGroup)}

          {/* Action buttons */}
          <div className="flex justify-between pt-4">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/patient/${patientId}/encounter`)}
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
          {formGroups.map(renderEditGroup)}

          {/* Form Actions */}
          <div className="flex justify-between pt-4">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/patient/${patientId}/encounter`)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back
              </button>
              {resourceId && (
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
                ? 'Save Changes'
                : 'Create Encounter'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// Helper function to get patient display name prioritizing HumanName.text
const getPatientDisplayName = (patient: any): string => {
  if (!patient || !patient.name || !patient.name.length) {
    return '';
  }

  // First check if HumanName.text is available
  if (patient.name[0].text) {
    return patient.name[0].text;
  }

  // Otherwise concatenate given and family name
  const given = patient.name[0].given ? patient.name[0].given[0] || '' : '';
  const family = patient.name[0].family || '';

  if (given || family) {
    return `${given} ${family}`.trim();
  }

  return '';
};

export default EncounterCrudPage;
