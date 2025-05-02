import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  useGetPatientQuery,
  useUpdatePatientMutation,
  useCreatePatientMutation,
} from '../../services/fhir/client';
import { Patient, HumanName, ContactPoint, Address } from 'fhir/r5';

const PatientCrudPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Check if we're on the new patient page or if the current path contains "new"
  const isNew = id === 'new' || location.pathname.includes('/patient/new');
  const [mode, setMode] = useState<'view' | 'edit'>(isNew ? 'edit' : 'view');

  // Form state
  const [formData, setFormData] = useState<Patient>({
    resourceType: 'Patient',
    active: true,
    name: [{ use: 'official', family: '', given: [''] }],
    telecom: [],
    gender: 'unknown',
    address: [],
    identifier: [],
  });

  // Queries and mutations
  // Use the correct id for the query - for /patient/:id/details paths, we need to extract the ID
  const patientId = isNew ? '' : id;
  const {
    data: patientData,
    isLoading,
    isError,
  } = useGetPatientQuery(patientId || '', { skip: isNew });
  const [updatePatient, { isLoading: isUpdating }] = useUpdatePatientMutation();
  const [createPatient, { isLoading: isCreating }] = useCreatePatientMutation();

  // Load patient data
  useEffect(() => {
    if (patientData && !isNew) {
      setFormData(patientData);
    }
  }, [patientData, isNew]);

  // Common identifier systems in healthcare
  const commonIdentifierSystems = [
    {
      value: 'http://terminology.hl7.org/CodeSystem/v2-0203|MR',
      label: 'Medical Record Number',
    },
    {
      value: 'http://terminology.hl7.org/CodeSystem/v2-0203|SS',
      label: 'Social Security Number',
    },
    {
      value: 'http://terminology.hl7.org/CodeSystem/v2-0203|DL',
      label: "Driver's License",
    },
    {
      value: 'http://terminology.hl7.org/CodeSystem/v2-0203|PPN',
      label: 'Passport Number',
    },
    {
      value: 'http://terminology.hl7.org/CodeSystem/v2-0203|PI',
      label: 'Patient Internal Identifier',
    },
    {
      value: 'http://hl7.org/fhir/sid/us-npi',
      label: 'National Provider Identifier',
    },
    {
      value: 'http://hl7.org/fhir/sid/us-ssn',
      label: 'US Social Security Number',
    },
    { value: 'custom', label: 'Other (specify)' },
  ];

  // Full list of ISO 3166 2-letter country codes
  const countryCodes = [
    { code: 'AF', name: 'Afghanistan' },
    { code: 'AX', name: 'Åland Islands' },
    { code: 'AL', name: 'Albania' },
    { code: 'DZ', name: 'Algeria' },
    { code: 'AS', name: 'American Samoa' },
    { code: 'AD', name: 'Andorra' },
    { code: 'AO', name: 'Angola' },
    { code: 'AI', name: 'Anguilla' },
    { code: 'AQ', name: 'Antarctica' },
    { code: 'AG', name: 'Antigua and Barbuda' },
    { code: 'AR', name: 'Argentina' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AW', name: 'Aruba' },
    { code: 'AU', name: 'Australia' },
    { code: 'AT', name: 'Austria' },
    { code: 'AZ', name: 'Azerbaijan' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'BH', name: 'Bahrain' },
    { code: 'BD', name: 'Bangladesh' },
    { code: 'BB', name: 'Barbados' },
    { code: 'BY', name: 'Belarus' },
    { code: 'BE', name: 'Belgium' },
    { code: 'BZ', name: 'Belize' },
    { code: 'BJ', name: 'Benin' },
    { code: 'BM', name: 'Bermuda' },
    { code: 'BT', name: 'Bhutan' },
    { code: 'BO', name: 'Bolivia' },
    { code: 'BQ', name: 'Bonaire, Sint Eustatius and Saba' },
    { code: 'BA', name: 'Bosnia and Herzegovina' },
    { code: 'BW', name: 'Botswana' },
    { code: 'BV', name: 'Bouvet Island' },
    { code: 'BR', name: 'Brazil' },
    { code: 'IO', name: 'British Indian Ocean Territory' },
    { code: 'BN', name: 'Brunei Darussalam' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'BF', name: 'Burkina Faso' },
    { code: 'BI', name: 'Burundi' },
    { code: 'CV', name: 'Cabo Verde' },
    { code: 'KH', name: 'Cambodia' },
    { code: 'CM', name: 'Cameroon' },
    { code: 'CA', name: 'Canada' },
    { code: 'KY', name: 'Cayman Islands' },
    { code: 'CF', name: 'Central African Republic' },
    { code: 'TD', name: 'Chad' },
    { code: 'CL', name: 'Chile' },
    { code: 'CN', name: 'China' },
    { code: 'CX', name: 'Christmas Island' },
    { code: 'CC', name: 'Cocos (Keeling) Islands' },
    { code: 'CO', name: 'Colombia' },
    { code: 'KM', name: 'Comoros' },
    { code: 'CG', name: 'Congo' },
    { code: 'CD', name: 'Congo, Democratic Republic of the' },
    { code: 'CK', name: 'Cook Islands' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'CI', name: "Côte d'Ivoire" },
    { code: 'HR', name: 'Croatia' },
    { code: 'CU', name: 'Cuba' },
    { code: 'CW', name: 'Curaçao' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'CZ', name: 'Czechia' },
    { code: 'DK', name: 'Denmark' },
    { code: 'DJ', name: 'Djibouti' },
    { code: 'DM', name: 'Dominica' },
    { code: 'DO', name: 'Dominican Republic' },
    { code: 'EC', name: 'Ecuador' },
    { code: 'EG', name: 'Egypt' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'GQ', name: 'Equatorial Guinea' },
    { code: 'ER', name: 'Eritrea' },
    { code: 'EE', name: 'Estonia' },
    { code: 'SZ', name: 'Eswatini' },
    { code: 'ET', name: 'Ethiopia' },
    { code: 'FK', name: 'Falkland Islands (Malvinas)' },
    { code: 'FO', name: 'Faroe Islands' },
    { code: 'FJ', name: 'Fiji' },
    { code: 'FI', name: 'Finland' },
    { code: 'FR', name: 'France' },
    { code: 'GF', name: 'French Guiana' },
    { code: 'PF', name: 'French Polynesia' },
    { code: 'TF', name: 'French Southern Territories' },
    { code: 'GA', name: 'Gabon' },
    { code: 'GM', name: 'Gambia' },
    { code: 'GE', name: 'Georgia' },
    { code: 'DE', name: 'Germany' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GI', name: 'Gibraltar' },
    { code: 'GR', name: 'Greece' },
    { code: 'GL', name: 'Greenland' },
    { code: 'GD', name: 'Grenada' },
    { code: 'GP', name: 'Guadeloupe' },
    { code: 'GU', name: 'Guam' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'GG', name: 'Guernsey' },
    { code: 'GN', name: 'Guinea' },
    { code: 'GW', name: 'Guinea-Bissau' },
    { code: 'GY', name: 'Guyana' },
    { code: 'HT', name: 'Haiti' },
    { code: 'HM', name: 'Heard Island and McDonald Islands' },
    { code: 'VA', name: 'Holy See' },
    { code: 'HN', name: 'Honduras' },
    { code: 'HK', name: 'Hong Kong' },
    { code: 'HU', name: 'Hungary' },
    { code: 'IS', name: 'Iceland' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IR', name: 'Iran, Islamic Republic of' },
    { code: 'IQ', name: 'Iraq' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IM', name: 'Isle of Man' },
    { code: 'IL', name: 'Israel' },
    { code: 'IT', name: 'Italy' },
    { code: 'JM', name: 'Jamaica' },
    { code: 'JP', name: 'Japan' },
    { code: 'JE', name: 'Jersey' },
    { code: 'JO', name: 'Jordan' },
    { code: 'KZ', name: 'Kazakhstan' },
    { code: 'KE', name: 'Kenya' },
    { code: 'KI', name: 'Kiribati' },
    { code: 'KP', name: "Korea, Democratic People's Republic of" },
    { code: 'KR', name: 'Korea, Republic of' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'KG', name: 'Kyrgyzstan' },
    { code: 'LA', name: "Lao People's Democratic Republic" },
    { code: 'LV', name: 'Latvia' },
    { code: 'LB', name: 'Lebanon' },
    { code: 'LS', name: 'Lesotho' },
    { code: 'LR', name: 'Liberia' },
    { code: 'LY', name: 'Libya' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'MO', name: 'Macao' },
    { code: 'MG', name: 'Madagascar' },
    { code: 'MW', name: 'Malawi' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'MV', name: 'Maldives' },
    { code: 'ML', name: 'Mali' },
    { code: 'MT', name: 'Malta' },
    { code: 'MH', name: 'Marshall Islands' },
    { code: 'MQ', name: 'Martinique' },
    { code: 'MR', name: 'Mauritania' },
    { code: 'MU', name: 'Mauritius' },
    { code: 'YT', name: 'Mayotte' },
    { code: 'MX', name: 'Mexico' },
    { code: 'FM', name: 'Micronesia, Federated States of' },
    { code: 'MD', name: 'Moldova, Republic of' },
    { code: 'MC', name: 'Monaco' },
    { code: 'MN', name: 'Mongolia' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MS', name: 'Montserrat' },
    { code: 'MA', name: 'Morocco' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'MM', name: 'Myanmar' },
    { code: 'NA', name: 'Namibia' },
    { code: 'NR', name: 'Nauru' },
    { code: 'NP', name: 'Nepal' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'NC', name: 'New Caledonia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'NE', name: 'Niger' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NU', name: 'Niue' },
    { code: 'NF', name: 'Norfolk Island' },
    { code: 'MK', name: 'North Macedonia' },
    { code: 'MP', name: 'Northern Mariana Islands' },
    { code: 'NO', name: 'Norway' },
    { code: 'OM', name: 'Oman' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'PW', name: 'Palau' },
    { code: 'PS', name: 'Palestine, State of' },
    { code: 'PA', name: 'Panama' },
    { code: 'PG', name: 'Papua New Guinea' },
    { code: 'PY', name: 'Paraguay' },
    { code: 'PE', name: 'Peru' },
    { code: 'PH', name: 'Philippines' },
    { code: 'PN', name: 'Pitcairn' },
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
    { code: 'PR', name: 'Puerto Rico' },
    { code: 'QA', name: 'Qatar' },
    { code: 'RE', name: 'Réunion' },
    { code: 'RO', name: 'Romania' },
    { code: 'RU', name: 'Russian Federation' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'BL', name: 'Saint Barthélemy' },
    { code: 'SH', name: 'Saint Helena, Ascension and Tristan da Cunha' },
    { code: 'KN', name: 'Saint Kitts and Nevis' },
    { code: 'LC', name: 'Saint Lucia' },
    { code: 'MF', name: 'Saint Martin (French part)' },
    { code: 'PM', name: 'Saint Pierre and Miquelon' },
    { code: 'VC', name: 'Saint Vincent and the Grenadines' },
    { code: 'WS', name: 'Samoa' },
    { code: 'SM', name: 'San Marino' },
    { code: 'ST', name: 'Sao Tome and Principe' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'SN', name: 'Senegal' },
    { code: 'RS', name: 'Serbia' },
    { code: 'SC', name: 'Seychelles' },
    { code: 'SL', name: 'Sierra Leone' },
    { code: 'SG', name: 'Singapore' },
    { code: 'SX', name: 'Sint Maarten (Dutch part)' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'SB', name: 'Solomon Islands' },
    { code: 'SO', name: 'Somalia' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
    { code: 'SS', name: 'South Sudan' },
    { code: 'ES', name: 'Spain' },
    { code: 'LK', name: 'Sri Lanka' },
    { code: 'SD', name: 'Sudan' },
    { code: 'SR', name: 'Suriname' },
    { code: 'SJ', name: 'Svalbard and Jan Mayen' },
    { code: 'SE', name: 'Sweden' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'SY', name: 'Syrian Arab Republic' },
    { code: 'TW', name: 'Taiwan, Province of China' },
    { code: 'TJ', name: 'Tajikistan' },
    { code: 'TZ', name: 'Tanzania, United Republic of' },
    { code: 'TH', name: 'Thailand' },
    { code: 'TL', name: 'Timor-Leste' },
    { code: 'TG', name: 'Togo' },
    { code: 'TK', name: 'Tokelau' },
    { code: 'TO', name: 'Tonga' },
    { code: 'TT', name: 'Trinidad and Tobago' },
    { code: 'TN', name: 'Tunisia' },
    { code: 'TR', name: 'Turkey' },
    { code: 'TM', name: 'Turkmenistan' },
    { code: 'TC', name: 'Turks and Caicos Islands' },
    { code: 'TV', name: 'Tuvalu' },
    { code: 'UG', name: 'Uganda' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States' },
    { code: 'UM', name: 'United States Minor Outlying Islands' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'UZ', name: 'Uzbekistan' },
    { code: 'VU', name: 'Vanuatu' },
    { code: 'VE', name: 'Venezuela, Bolivarian Republic of' },
    { code: 'VN', name: 'Viet Nam' },
    { code: 'VG', name: 'Virgin Islands, British' },
    { code: 'VI', name: 'Virgin Islands, U.S.' },
    { code: 'WF', name: 'Wallis and Futuna' },
    { code: 'EH', name: 'Western Sahara' },
    { code: 'YE', name: 'Yemen' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'ZW', name: 'Zimbabwe' },
    { code: '', name: 'Not specified' },
  ];

  // Helper function to format patient name
  const formatPatientName = (name?: HumanName): string => {
    if (!name) return 'Unknown';

    // If text is available, use it directly
    if (name.text) {
      return name.text;
    }

    // Otherwise try to construct from family and given
    const familyName = name.family || '';
    const givenNames = name.given?.join(' ') || '';

    if (familyName || givenNames) {
      return `${familyName}${
        familyName && givenNames ? ', ' : ''
      }${givenNames}`;
    }

    // Fallback if nothing is available
    return 'Unknown';
  };

  // Handle form changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    console.log(`Changed ${name} to ${value}`); // Add logging to debug

    if (name.startsWith('name.')) {
      const [_, index, field] = name.split('.');
      const idx = Number(index);
      const updatedNames = [...(formData.name || [])];

      // Create a new name object if it doesn't exist
      if (!updatedNames[idx]) {
        updatedNames[idx] = { use: 'official' };
      } else {
        // Create a deep copy of the existing object
        updatedNames[idx] = { ...updatedNames[idx] };
      }

      if (field === 'family') {
        updatedNames[idx].family = value;
      } else if (field === 'given') {
        updatedNames[idx].given = [value];
      } else if (field === 'text') {
        updatedNames[idx].text = value;
      }

      setFormData({ ...formData, name: updatedNames });
    } else if (name.startsWith('telecom.')) {
      const [_, index, field] = name.split('.');
      const idx = Number(index);
      const updatedTelecom = [...(formData.telecom || [])];

      // Create a new telecom object if it doesn't exist
      if (!updatedTelecom[idx]) {
        updatedTelecom[idx] = { system: 'phone', use: 'home' };
      } else {
        // Create a deep copy of the existing object
        updatedTelecom[idx] = { ...updatedTelecom[idx] };
      }

      if (field === 'value') {
        updatedTelecom[idx].value = value;
      } else if (field === 'system') {
        updatedTelecom[idx].system = value as ContactPoint['system'];
      } else if (field === 'use') {
        updatedTelecom[idx].use = value as ContactPoint['use'];
      }

      setFormData({ ...formData, telecom: updatedTelecom });
    } else if (name.startsWith('address.')) {
      const [_, index, field] = name.split('.');
      const idx = Number(index);
      const updatedAddresses = [...(formData.address || [])];

      // Create a new address object if it doesn't exist
      if (!updatedAddresses[idx]) {
        updatedAddresses[idx] = { use: 'home' };
      } else {
        // Create a deep copy of the existing object
        updatedAddresses[idx] = { ...updatedAddresses[idx] };
      }

      if (field === 'line') {
        updatedAddresses[idx].line = [value];
      } else if (field === 'city') {
        updatedAddresses[idx].city = value;
      } else if (field === 'state') {
        updatedAddresses[idx].state = value;
      } else if (field === 'postalCode') {
        updatedAddresses[idx].postalCode = value;
      } else if (field === 'country') {
        updatedAddresses[idx].country = value;
      } else if (field === 'use') {
        updatedAddresses[idx].use = value as Address['use'];
      }

      setFormData({ ...formData, address: updatedAddresses });
    } else if (name.startsWith('identifier.')) {
      const [_, index, field] = name.split('.');
      const idx = Number(index);
      const updatedIdentifiers = [...(formData.identifier || [])];

      // Create a new identifier object if it doesn't exist
      if (!updatedIdentifiers[idx]) {
        updatedIdentifiers[idx] = {};
      } else {
        // Create a deep copy of the existing object
        updatedIdentifiers[idx] = { ...updatedIdentifiers[idx] };
      }

      if (field === 'value') {
        updatedIdentifiers[idx].value = value;
      } else if (field === 'system') {
        // Handle custom system if needed
        if (value === 'custom') {
          updatedIdentifiers[idx].system = '';
        } else {
          updatedIdentifiers[idx].system = value;
        }
      }

      setFormData({ ...formData, identifier: updatedIdentifiers });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // Handle save
  const handleSave = async () => {
    try {
      if (isNew) {
        await createPatient(formData).unwrap();
        navigate('/patients');
      } else {
        await updatePatient(formData).unwrap();
        setMode('view');
      }
    } catch (error) {
      console.error('Failed to save patient', error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isNew) {
      navigate('/patients');
    } else {
      setMode('view');
      if (patientData) {
        setFormData(patientData);
      }
    }
  };

  // Handle navigation back to patients list
  const handleBackToSearch = () => {
    navigate('/patients');
  };

  // Add new telecom
  const addTelecom = () => {
    const telecom = formData.telecom || [];
    setFormData({
      ...formData,
      telecom: [...telecom, { system: 'phone', use: 'home', value: '' }],
    });
  };

  // Add new address
  const addAddress = () => {
    const address = formData.address || [];
    setFormData({
      ...formData,
      address: [
        ...address,
        {
          use: 'home',
          line: [''],
          city: '',
          state: '',
          postalCode: '',
          country: '',
        },
      ],
    });
  };

  // Add new identifier
  const addIdentifier = () => {
    const identifier = formData.identifier || [];
    setFormData({
      ...formData,
      identifier: [...identifier, { system: '', value: '' }],
    });
  };

  // Remove telecom
  const removeTelecom = (index: number) => {
    const telecom = [...(formData.telecom || [])];
    telecom.splice(index, 1);
    setFormData({ ...formData, telecom });
  };

  // Remove address
  const removeAddress = (index: number) => {
    const address = [...(formData.address || [])];
    address.splice(index, 1);
    setFormData({ ...formData, address });
  };

  // Remove identifier
  const removeIdentifier = (index: number) => {
    const identifier = [...(formData.identifier || [])];
    identifier.splice(index, 1);
    setFormData({ ...formData, identifier });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (isError && !isNew) {
    return (
      <div className="p-4 bg-red-100 text-red-700 border border-red-400 rounded mb-4">
        <p>Failed to load patient data. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back button */}
      <div className="mb-4">
        <button
          onClick={handleBackToSearch}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Back to Patient Search
        </button>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          {isNew
            ? 'New Patient'
            : `Patient: ${formatPatientName(formData.name?.[0])}`}
        </h1>
        <div className="space-x-2">
          {mode === 'view' ? (
            <button
              onClick={() => setMode('edit')}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                disabled={isUpdating || isCreating}
              >
                {isUpdating || isCreating ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6">
        {/* Overview Group */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Active
              </label>
              {mode === 'edit' ? (
                <select
                  name="active"
                  value={formData.active ? 'true' : 'false'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      active: e.target.value === 'true',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <div className="py-2 px-3 bg-gray-50 rounded-md">
                  {formData.active ? 'Yes' : 'No'}
                </div>
              )}
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gender
              </label>
              {mode === 'edit' ? (
                <select
                  name="gender"
                  value={formData.gender || 'unknown'}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
              ) : (
                <div className="py-2 px-3 bg-gray-50 rounded-md">
                  {formData.gender === 'male'
                    ? 'Male'
                    : formData.gender === 'female'
                    ? 'Female'
                    : formData.gender === 'other'
                    ? 'Other'
                    : 'Unknown'}
                </div>
              )}
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Birth Date
              </label>
              {mode === 'edit' ? (
                <input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <div className="py-2 px-3 bg-gray-50 rounded-md">
                  {formData.birthDate || 'Not specified'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name Group */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Name</h2>
          {formData.name?.map((name, index) => (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
            >
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Family Name
                </label>
                {mode === 'edit' ? (
                  <input
                    type="text"
                    name={`name.${index}.family`}
                    value={name.family || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {name.family || 'Not specified'}
                  </div>
                )}
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Given Name
                </label>
                {mode === 'edit' ? (
                  <input
                    type="text"
                    name={`name.${index}.given`}
                    value={name.given?.[0] || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {name.given?.join(' ') || 'Not specified'}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Text
                </label>
                {mode === 'edit' ? (
                  <input
                    type="text"
                    name={`name.${index}.text`}
                    value={name.text || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {name.text || 'Not specified'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Identifier Group */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="text-xl font-semibold">Identifiers</h2>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={addIdentifier}
                className="text-blue-500 hover:text-blue-700"
              >
                + Add Identifier
              </button>
            )}
          </div>
          {(formData.identifier || []).map((identifier, index) => (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"
            >
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  System
                </label>
                {mode === 'edit' ? (
                  <select
                    name={`identifier.${index}.system`}
                    value={identifier.system || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a system</option>
                    {commonIdentifierSystems.map((system) => (
                      <option key={system.value} value={system.value}>
                        {system.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {commonIdentifierSystems.find(
                      (system) => system.value === identifier.system,
                    )?.label ||
                      identifier.system ||
                      'Not specified'}
                  </div>
                )}
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value
                </label>
                {mode === 'edit' ? (
                  <input
                    type="text"
                    name={`identifier.${index}.value`}
                    value={identifier.value || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {identifier.value || 'Not specified'}
                  </div>
                )}
              </div>
              {mode === 'edit' && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeIdentifier(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {formData.identifier?.length === 0 && mode === 'view' && (
            <div className="text-gray-500 italic">No identifiers specified</div>
          )}
        </div>

        {/* Contact Group */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="text-xl font-semibold">Contact Information</h2>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={addTelecom}
                className="text-blue-500 hover:text-blue-700"
              >
                + Add Contact
              </button>
            )}
          </div>
          {(formData.telecom || []).map((telecom, index) => (
            <div
              key={index}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"
            >
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  System
                </label>
                {mode === 'edit' ? (
                  <select
                    name={`telecom.${index}.system`}
                    value={telecom.system || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a system</option>
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="fax">Fax</option>
                    <option value="pager">Pager</option>
                    <option value="url">URL</option>
                    <option value="sms">SMS</option>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {telecom.system
                      ? telecom.system.charAt(0).toUpperCase() +
                        telecom.system.slice(1)
                      : 'Not specified'}
                  </div>
                )}
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact
                </label>
                {mode === 'edit' ? (
                  <input
                    type="text"
                    name={`telecom.${index}.value`}
                    value={telecom.value || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {telecom.value || 'Not specified'}
                  </div>
                )}
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Use
                </label>
                {mode === 'edit' ? (
                  <select
                    name={`telecom.${index}.use`}
                    value={telecom.use || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a use</option>
                    <option value="home">Home</option>
                    <option value="work">Work</option>
                    <option value="temp">Temporary</option>
                    <option value="old">Old</option>
                    <option value="mobile">Mobile</option>
                  </select>
                ) : (
                  <div className="py-2 px-3 bg-gray-50 rounded-md">
                    {telecom.use
                      ? telecom.use.charAt(0).toUpperCase() +
                        telecom.use.slice(1)
                      : 'Not specified'}
                  </div>
                )}
              </div>
              {mode === 'edit' && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeTelecom(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {formData.telecom?.length === 0 && mode === 'view' && (
            <div className="text-gray-500 italic">
              No contact information specified
            </div>
          )}
        </div>

        {/* Address Group */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="text-xl font-semibold">Addresses</h2>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={addAddress}
                className="text-blue-500 hover:text-blue-700"
              >
                + Add Address
              </button>
            )}
          </div>
          {(formData.address || []).map((address, index) => (
            <div key={index} className="mb-6 pb-6 border-b border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Line
                  </label>
                  {mode === 'edit' ? (
                    <input
                      type="text"
                      name={`address.${index}.line`}
                      value={address.line?.[0] || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {address.line?.join(', ') || 'Not specified'}
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  {mode === 'edit' ? (
                    <input
                      type="text"
                      name={`address.${index}.city`}
                      value={address.city || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {address.city || 'Not specified'}
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  {mode === 'edit' ? (
                    <input
                      type="text"
                      name={`address.${index}.state`}
                      value={address.state || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {address.state || 'Not specified'}
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Postal Code
                  </label>
                  {mode === 'edit' ? (
                    <input
                      type="text"
                      name={`address.${index}.postalCode`}
                      value={address.postalCode || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {address.postalCode || 'Not specified'}
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  {mode === 'edit' ? (
                    <select
                      name={`address.${index}.country`}
                      value={address.country || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select a country</option>
                      {countryCodes.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {countryCodes.find(
                        (country) => country.code === address.country,
                      )?.name ||
                        address.country ||
                        'Not specified'}
                    </div>
                  )}
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Use
                  </label>
                  {mode === 'edit' ? (
                    <select
                      name={`address.${index}.use`}
                      value={address.use || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select a use</option>
                      <option value="home">Home</option>
                      <option value="work">Work</option>
                      <option value="temp">Temporary</option>
                      <option value="old">Old</option>
                      <option value="billing">Billing</option>
                    </select>
                  ) : (
                    <div className="py-2 px-3 bg-gray-50 rounded-md">
                      {address.use
                        ? address.use.charAt(0).toUpperCase() +
                          address.use.slice(1)
                        : 'Not specified'}
                    </div>
                  )}
                </div>
              </div>
              {mode === 'edit' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeAddress(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove Address
                  </button>
                </div>
              )}
            </div>
          ))}
          {formData.address?.length === 0 && mode === 'view' && (
            <div className="text-gray-500 italic">No addresses specified</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientCrudPage;
