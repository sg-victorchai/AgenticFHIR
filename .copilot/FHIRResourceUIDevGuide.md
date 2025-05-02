# FHIR Resource UI Generation Guide

This guide provides prompts and specifications for generating user interfaces to display and manage FHIR resources.

## Table Listing View

The table listing view should display only elements where `isSummary=true` in the respective structure definition file. This creates a concise overview that highlights the most important information for each resource type.

### Dynamic Column Definition Approach for Table Listing View

```typescript
// Function to extract isSummary elements from structure definition
async function getSummaryElementsFromStructureDefinition(resourceType) {
  // Load the appropriate structure definition file
  const structureDefPath = `/fhirprofile/structure-definition-${resourceType.toLowerCase()}.json`;
  const structureDef = await fetchJSON(structureDefPath);

  // Extract elements where isSummary is true
  const summaryElements = [];
  if (structureDef && structureDef.snapshot && structureDef.snapshot.element) {
    structureDef.snapshot.element.forEach((element) => {
      if (element.isSummary === true) {
        // Extract the element path, removing the resourceType prefix
        const path = element.path.startsWith(`${resourceType}.`)
          ? element.path.substring(resourceType.length + 1)
          : element.path;

        summaryElements.push({
          path,
          definition: element.definition,
          type: element.type ? element.type[0]?.code : null,
        });
      }
    });
  }

  return summaryElements;
}

// Generate columns based on summary elements
async function generateListColumns(resourceType) {
  const summaryElements = await getSummaryElementsFromStructureDefinition(
    resourceType,
  );

  // Map summary elements to column definitions
  const columns = summaryElements.map((element) => {
    // Handle special cases based on element type
    switch (element.path) {
      case 'id':
        return {
          header: 'ID',
          accessor: 'id',
          width: '80px',
        };
      case 'status':
        return {
          header: 'Status',
          accessor: 'status',
          width: '120px',
          cell: (status) => <StatusBadge status={status} />,
        };
      case 'effective[x]':
        return {
          header: 'Effective Date',
          accessor: 'effective[x]',
          width: '150px',
          cell: (effective) => formatEffectiveDate(effective),
        };
      // Add other special cases here
      default:
        // Generate a standard column for other types
        return {
          header: formatHeaderFromPath(element.path),
          accessor: element.path,
          width: '150px',
          // Add appropriate formatters based on element type
          cell: getCellFormatterForType(element.type, element.path),
        };
    }
  });

  // Always add an actions column
  columns.push({
    header: 'Actions',
    width: '100px',
    cell: (_, resource) => (
      <ActionButtons
        viewUrl={`/${resourceType.toLowerCase()}/${resource.id}`}
        editUrl={`/${resourceType.toLowerCase()}/${resource.id}/edit`}
      />
    ),
  });

  return columns;
}

// Helper function to format a path into a readable header
function formatHeaderFromPath(path) {
  // Handle complex paths, arrays, etc.
  const lastSegment = path.includes('.') ? path.split('.').pop() : path;
  // Remove [x] if present (for choice types)
  const cleanSegment = lastSegment.replace('[x]', '');
  // Capitalize and add spaces
  return cleanSegment
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase());
}

// Helper function to get appropriate cell formatter
function getCellFormatterForType(type, path) {
  switch (type) {
    case 'dateTime':
    case 'instant':
    case 'date':
      return (value) => formatDateTime(value);
    case 'CodeableConcept':
      return (value) => value?.coding?.[0]?.display || value?.text || '';
    case 'Reference':
      return (value) => value?.display || formatReference(value);
    case 'Quantity':
      return (value) => formatQuantity(value);
    // Add other type handlers as needed
    default:
      // For arrays, provide special handling
      if (path.endsWith('[0]') || path.includes('.')) {
        return (value) => formatComplexValue(value, path);
      }
      return (value) => value?.toString() || '';
  }
}
```

### Prompt for Dynamic Table Listing UI Generation

```
Generate a responsive table component to display FHIR {ResourceType} resources with the following requirements:
1. Follow the design patterns used in ObservationPage.tsx using Tailwind CSS for styling
2. Dynamically read the structure definition file at runtime to determine which elements have isSummary=true and show only those elements
3. Include filter controls at the top of the page (for relevant categories and dates)
4. Implement a clean table layout with appropriate column headers based on the resource's summary elements
5. Process FHIR resources to extract relevant display values from complex structures
6. Display status values using color-coded badges (green for final/active, yellow for preliminary/draft, etc.)
7. Include different visual states for:
   - Loading data (animated spinner)
   - Error states (red alert box)
   - Empty states (yellow info box)
8. Format dates and other values appropriately for display
9. Add "View Details" links to navigate to the detailed view of each resource
10. Ensure the table is responsive with horizontal scrolling on small screens
11. Include pagination for large result sets
12. Implement a title/header section that shows context (e.g., patient name if applicable)

The component should be designed to work with any FHIR resource type by simply changing the resourceType property.
```

## Detail/Edit/Create View

The detail/edit/create view should provide a comprehensive interface for viewing and managing all elements of a FHIR resource.

### Grouping Structure for Form Elements

```typescript
// Generic function to generate form groups based on resource type
async function generateFormGroups(resourceType) {
  // Load the appropriate structure definition file
  const structureDefPath = `/fhirprofile/structure-definition-${resourceType.toLowerCase()}.json`;
  let structureDef;

  try {
    structureDef = await fetchJSON(structureDefPath);
  } catch (error) {
    console.error(
      `Failed to load structure definition for ${resourceType}:`,
      error,
    );
    // Fall back to default groups if structure definition cannot be loaded
    return generateDefaultGroups(resourceType);
  }

  // Extract elements from the structure definition
  const elements = extractElementsFromStructureDefinition(structureDef);

  // Group elements into logical sections based on their paths and properties
  return organizeElementsIntoGroups(resourceType, elements);
}

// Extract elements from the structure definition
function extractElementsFromStructureDefinition(structureDef) {
  if (!structureDef?.snapshot?.element) {
    return [];
  }

  const elements = [];
  const baseResourceType = structureDef.type;

  structureDef.snapshot.element.forEach((element) => {
    // Skip the root element and resource-level elements that don't represent data fields
    const skipElements = [
      'id',
      'meta',
      'implicitRules',
      'language',
      'text',
      'contained',
      'extension',
      'modifierExtension',
    ];
    const path = element.path;

    // Skip the root element and extension elements
    if (
      path === baseResourceType ||
      skipElements.some((skip) => path === `${baseResourceType}.${skip}`)
    ) {
      return;
    }

    // Skip nested backbone elements (we'll handle these separately)
    if (
      path.split('.').length > 2 &&
      !path.endsWith('[x]') &&
      !isSimpleSubPath(path, baseResourceType)
    ) {
      return;
    }

    elements.push({
      path: path,
      definition: element.definition || '',
      short: element.short || '',
      min: element.min || 0,
      max: element.max || '1',
      type: element.type || [],
      isRequired: element.min > 0,
      isSummary: element.isSummary === true,
      binding: element.binding,
      constraint: element.constraint,
    });
  });

  return elements;
}

// Check if this is a simple sub-path that we want to include directly
function isSimpleSubPath(path, baseResourceType) {
  const parts = path.split('.');

  // Only include direct child elements with simple paths
  // (e.g., "Observation.code.text" but not "Observation.component.code")
  if (parts.length === 3 && parts[0] === baseResourceType) {
    // Include simple sub-elements of common complex types
    const commonSubElements = [
      'coding',
      'text',
      'display',
      'reference',
      'value',
      'unit',
      'system',
      'code',
    ];
    return commonSubElements.includes(parts[2]);
  }

  return false;
}

// Organize elements into logical groups based on FHIR structure
function organizeElementsIntoGroups(resourceType, elements) {
  // Create the groups structure
  const groups = [];
  
  // Track which elements have been assigned to groups
  const assignedElements = new Set();
  
  // First, identify all backbone elements to create groups
  const backboneGroups = new Map();
  const backboneElements = elements.filter(element => {
    const types = element.type || [];
    return types.some(type => type.code === 'BackboneElement');
  });
  
  // Create a group for each backbone element
  backboneElements.forEach(backbone => {
    const pathParts = backbone.path.split('.');
    const elementName = pathParts[pathParts.length - 1];
    
    // Format the group title (e.g., "admission" -> "Admission Details")
    const groupTitle = elementName.charAt(0).toUpperCase() + 
                       elementName.slice(1) + ' Details';
    
    backboneGroups.set(backbone.path, {
      id: elementName.toLowerCase(),
      title: groupTitle,
      elements: [],
      path: backbone.path
    });
  });
  
  // Create an "Overview" group for top-level elements
  const overviewGroup = {
    id: 'overview',
    title: 'Overview',
    elements: []
  };
  
  // Assign elements to their respective groups
  elements.forEach(element => {
    const path = element.path;
    const pathParts = path.split('.');
    
    // Skip backbone elements themselves
    if (element.type && element.type.some(type => type.code === 'BackboneElement')) {
      assignedElements.add(path);
      return;
    }
    
    // If this is a direct child of the resource type (i.e., path has only 2 parts)
    if (pathParts.length === 2) {
      overviewGroup.elements.push(pathParts[1]);
      assignedElements.add(path);
      return;
    }
    
    // Find the backbone parent for this element
    for (const [backbonePath, group] of backboneGroups.entries()) {
      if (path.startsWith(backbonePath + '.')) {
        // Get the element name relative to its backbone parent
        const elementName = pathParts[pathParts.length - 1];
        group.elements.push(elementName);
        assignedElements.add(path);
        return;
      }
    }
  });
  
  // Add the overview group if it has elements
  if (overviewGroup.elements.length > 0) {
    groups.push(overviewGroup);
  }
  
  // Add backbone groups in the order they appear in the structure definition
  const sortedBackboneGroups = Array.from(backboneGroups.values())
    .sort((a, b) => {
      // Find the index of these elements in the original elements array
      const indexA = elements.findIndex(e => e.path === a.path);
      const indexB = elements.findIndex(e => e.path === b.path);
      return indexA - indexB;
    });
  
  groups.push(...sortedBackboneGroups);
  
  // Check if any elements were not assigned to a group
  const unassignedElements = elements
    .filter(element => !assignedElements.has(element.path))
    .map(element => {
      const pathParts = element.path.split('.');
      return pathParts[pathParts.length - 1];
    });
  
  if (unassignedElements.length > 0) {
    groups.push({
      id: 'other',
      title: 'Other Information',
      elements: unassignedElements
    });
  }
  
  return groups;
}

// Format a group ID into a readable title
function formatGroupTitle(groupId) {
  switch (groupId) {
    case 'identification':
      return 'Identification';
    case 'timing':
      return 'Timing';
    case 'clinical':
      return 'Clinical Information';
    case 'subject':
      return 'Subject Information';
    case 'relationshipsAndReferences':
      return 'Related Resources';
    case 'components':
      return 'Components';
    case 'other':
      return 'Other Information';
    default:
      return groupId
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());
  }
}

// Add resource-specific customizations
function customizeGroupsForResourceType(resourceType, groups) {
  switch (resourceType) {
    case 'Observation':
      // For Observation, ensure component is in its own group
      const componentGroupIndex = groups.findIndex(
        (g) => g.id === 'components',
      );
      if (componentGroupIndex >= 0) {
        groups[componentGroupIndex].title = 'Component Observations';
      }
      break;

    case 'CarePlan':
      // For CarePlan, ensure activities have their own group
      const clinicalGroupIndex = groups.findIndex((g) => g.id === 'clinical');
      if (clinicalGroupIndex >= 0) {
        const activityIndex =
          groups[clinicalGroupIndex].elements.indexOf('activity');
        if (activityIndex >= 0) {
          // Remove activity from clinical group
          groups[clinicalGroupIndex].elements.splice(activityIndex, 1);

          // Add activities group
          groups.push({
            id: 'activities',
            title: 'Activities',
            elements: ['activity'],
          });
        }
      }
      break;

    case 'MedicationRequest':
      // For MedicationRequest, ensure medication information has its own group
      const medicationElements = [
        'medication[x]',
        'dosageInstruction',
        'dispenseRequest',
        'substitution',
      ];

      // Pull medication elements from other groups
      groups.forEach((group) => {
        group.elements = group.elements.filter(
          (element) =>
            !medicationElements.some((med) => {
              if (med.includes('[x]')) {
                const baseName = med.replace('[x]', '');
                return (
                  element.startsWith(baseName) &&
                  element.length > baseName.length &&
                  element[baseName.length] ===
                    element[baseName.length].toUpperCase()
                );
              }
              return element === med;
            }),
        );
      });

      // Add medication group
      groups.push({
        id: 'medication',
        title: 'Medication Information',
        elements: medicationElements,
      });
      break;
  }

  // Remove any empty groups after customization
  return groups.filter((group) => group.elements.length > 0);
}

// Generate default groups for when structure definition cannot be loaded
function generateDefaultGroups(resourceType) {
  return [
    {
      id: 'identification',
      title: 'Identification',
      elements: ['id', 'identifier', 'status', 'code', 'category'],
    },
    {
      id: 'timing',
      title: 'Timing',
      elements: [
        'issued',
        'effective[x]',
        'period',
        'date',
        'created',
        'authoredOn',
      ],
    },
    {
      id: 'clinical',
      title: 'Clinical Information',
      elements: [
        'value[x]',
        'dataAbsentReason',
        'interpretation',
        'note',
        'bodySite',
        'method',
      ],
    },
    {
      id: 'subject',
      title: 'Subject Information',
      elements: ['subject', 'encounter', 'performer'],
    },
    {
      id: 'other',
      title: 'Other Information',
      elements: [
        'basedOn',
        'partOf',
        'hasMember',
        'derivedFrom',
        'device',
        'specimen',
        'referenceRange',
      ],
    },
  ];
}
```

### Prompt for Detail/Edit View UI Generation

```
Generate a detailed UI component for viewing and editing FHIR {ResourceType} resources with the following requirements:
1. Organize fields into logical groups (identification, timing, clinical information, etc.)
2. Implement a toggle between view mode and edit mode
3. Handle all possible data types for choice elements (e.g., value[x])
4. Implement field validation based on FHIR constraints from the structure definition
5. Support special handling for required fields
6. Implement conditional fields that only appear when relevant
7. Include appropriate form controls for each data type:
   - Select dropdown for coded values with terminology binding
   - Date/time picker for temporal fields
   - Numerical inputs with units for Quantity values
   - Rich text for string values
   - Reference selectors for resource references
8. Handle complex nested structures (like component, activity, etc.)
9. Implement toolbar actions (save, cancel, delete)
10. Include error handling and validation feedback
11. Provide a responsive layout that works on both desktop and mobile devices

The component should read the FHIR structure definition file to understand constraints, required fields, and data types.
```

### Prompt for Create View UI Generation

```
Generate a UI component for creating new FHIR {ResourceType} resources with the following requirements:
1. Organize form into logical sections with clear labels
2. Pre-populate default values where appropriate (status="registered", current date/time)
3. Support all required fields and common optional fields for {ResourceType}
4. Handle different data types through dynamic form controls
5. Implement field validation based on FHIR constraints from the structure definition
6. Validate required fields before submission
7. Support reference selection for subject, performer, and other references
8. Include structured inputs for complex fields
9. Support adding multiple items to repeating elements
10. Implement save, cancel, and reset actions
11. Provide comprehensive error handling and validation feedback
12. Implement a responsive layout for desktop and mobile use

The component should read the FHIR structure definition file to understand constraints, required fields, and data types.
```

## Special Element Type Handling

### Choice Type Handling

Choice types (elements ending with [x]) require special handling to select the appropriate data type and render the correct input.

```typescript
// Component to handle choice type elements like value[x]
const ChoiceTypeInput = ({ resource, path, onChange, editable }) => {
  // Extract the base path (e.g., 'value' from 'value[x]')
  const basePath = path.replace('[x]', '');

  // Find which choice type is currently used in the resource
  const currentType = findChoiceType(resource, basePath);

  // Get allowed types for this choice element from structure definition
  const allowedTypes = getAllowedTypesFromStructureDef(path);

  if (editable) {
    return (
      <div>
        <div className="type-selector">
          <label>Type:</label>
          <select
            value={currentType || ''}
            onChange={(e) =>
              handleTypeChange(e.target.value, basePath, resource, onChange)
            }
          >
            <option value="">Select Type</option>
            {allowedTypes.map((type) => (
              <option key={type} value={type}>
                {formatTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        {currentType && (
          <div className="value-input">
            {renderInputForType(currentType, resource, basePath, onChange)}
          </div>
        )}
      </div>
    );
  }

  // Display version
  return currentType ? (
    <div className="value-display">
      {renderValueDisplay(currentType, resource, basePath)}
    </div>
  ) : null;
};

// Find which choice type is currently used in the resource
function findChoiceType(resource, basePath) {
  const possibleTypes = [
    'Quantity',
    'CodeableConcept',
    'string',
    'boolean',
    'integer',
    'Range',
    'Ratio',
    'SampledData',
    'time',
    'dateTime',
    'Period',
    'Attachment',
  ];

  for (const type of possibleTypes) {
    const key = `${basePath}${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (resource[key] !== undefined) {
      return type;
    }
  }

  return null;
}

// Render appropriate input control based on type
function renderInputForType(type, resource, basePath, onChange) {
  const key = `${basePath}${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const value = resource[key];

  switch (type) {
    case 'Quantity':
      return (
        <QuantityInput
          value={value}
          onChange={(v) => handleValueChange(v, key, resource, onChange)}
        />
      );
    case 'CodeableConcept':
      return (
        <CodeableConceptInput
          value={value}
          onChange={(v) => handleValueChange(v, key, resource, onChange)}
        />
      );
    case 'string':
      return (
        <TextInput
          value={value}
          onChange={(v) => handleValueChange(v, key, resource, onChange)}
        />
      );
    case 'boolean':
      return (
        <BooleanInput
          value={value}
          onChange={(v) => handleValueChange(v, key, resource, onChange)}
        />
      );
    // Add handlers for other types
    default:
      return <div>Unsupported type: {type}</div>;
  }
}
```

### Reference Handling

FHIR references require special handling to display human-readable information and allow users to select related resources.

```typescript
// Component to handle FHIR references
const ReferenceInput = ({ value, resourceTypes, onChange, editable }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Function to search for resources
  const searchResources = async (term) => {
    if (!term || term.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Construct search for multiple resource types
      const searchPromises = resourceTypes.map((type) =>
        fhirClient.search({
          resourceType: type,
          searchParams: { name: term, _summary: true, _count: 10 },
        }),
      );

      const searchResults = await Promise.all(searchPromises);

      // Flatten and format results
      const formattedResults = searchResults
        .flatMap((result) => result.entry || [])
        .map((entry) => ({
          reference: `${entry.resource.resourceType}/${entry.resource.id}`,
          display: formatReferenceDisplay(entry.resource),
          resource: entry.resource,
        }));

      setResults(formattedResults);
    } catch (error) {
      console.error('Error searching for references:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Format display text for a resource
  const formatReferenceDisplay = (resource) => {
    switch (resource.resourceType) {
      case 'Patient':
        return `${resource.name?.[0]?.family || ''}, ${
          resource.name?.[0]?.given?.join(' ') || ''
        }`;
      case 'Practitioner':
        return `${resource.name?.[0]?.prefix?.[0] || ''} ${
          resource.name?.[0]?.family || ''
        }, ${resource.name?.[0]?.given?.join(' ') || ''}`;
      case 'Organization':
        return resource.name || 'Unknown Organization';
      default:
        return `${resource.resourceType}/${resource.id}`;
    }
  };

  if (editable) {
    return (
      <div className="reference-input">
        <div className="current-reference">
          {value?.display || value?.reference || 'None selected'}
          {value && <button onClick={() => onChange(null)}>Clear</button>}
        </div>

        <div className="reference-search">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              searchResources(e.target.value);
            }}
            placeholder={`Search for ${resourceTypes.join(', ')}`}
          />

          {isSearching && <span className="loading">Searching...</span>}

          {results.length > 0 && (
            <ul className="search-results">
              {results.map((result) => (
                <li
                  key={result.reference}
                  onClick={() => {
                    onChange(result);
                    setSearchTerm('');
                    setResults([]);
                  }}
                >
                  {result.display}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Display version
  return (
    <div className="reference-display">
      {value?.display ||
        (value?.reference && (
          <ReferenceDisplay reference={value.reference} />
        )) ||
        'No reference'}
    </div>
  );
};

// Component to display a FHIR reference with lookup functionality
const ReferenceDisplay = ({ reference }) => {
  const { data, isLoading } = useFhirReference(reference);

  if (isLoading) return <Spinner size="sm" />;

  return (
    <div className="reference-display">
      {data?.display || formatReferenceByResourceType(data) || reference}
    </div>
  );
};
```

## Best Practices

1. **Structure Definition Integration**: Always read and parse the FHIR structure definition for each resource type to understand:

   - Required fields
   - Data types and constraints
   - Elements with isSummary=true for listing views
   - Cardinality (min/max occurrences)
   - Binding to value sets

2. **Terminology Integration**: Link to appropriate terminology services for coded values

3. **Validation**: Implement FHIR constraints as validation rules

4. **User Experience**: Guide users through complex fields with contextual help

5. **Performance**: Optimize rendering for large datasets

6. **Accessibility**: Ensure all UI components meet accessibility standards

7. **Internationalization**: Support for multiple languages and formatting conventions

8. **Error Handling**: Provide clear error messages and validation feedback

9. **Responsive Design**: Ensure usability across different device sizes

10. **Consistent Styling**: Maintain design consistency with the rest of the application

## Resource-Specific Considerations

### Observation Resource

Special handling needed for:

- Components (nested observations)
- Different value types (Quantity, CodeableConcept, string, etc.)
- Reference ranges

### CarePlan Resource

Special handling needed for:

- Activities and activity detail
- Multiple participants
- Goals references

### MedicationRequest Resource

Special handling needed for:

- Medication references or inline definition
- Dosage instructions
- Dispense requests

## Reference Lookups

When displaying FHIR references, provide lookups to display human-readable labels when available.

```typescript
// Example of reference lookup component
const ResourceReference = ({ reference }) => {
  const { data, isLoading } = useFhirReference(reference);

  if (isLoading) return <Spinner size="sm" />;

  return (
    <div>
      {data?.display ||
        formatReferenceByResourceType(data) ||
        reference.reference}
    </div>
  );
};

// Format reference display based on resource type
function formatReferenceByResourceType(resource) {
  if (!resource) return null;

  switch (resource.resourceType) {
    case 'Patient':
      return resource.name?.[0]
        ? `${resource.name[0].family}, ${
            resource.name[0].given?.join(' ') || ''
          }`
        : `Patient ${resource.id}`;
    case 'Practitioner':
      return resource.name?.[0]
        ? `${resource.name[0].prefix?.[0] || ''} ${resource.name[0].family}, ${
            resource.name[0].given?.join(' ') || ''
          }`
        : `Practitioner ${resource.id}`;
    case 'Organization':
      return resource.name || `Organization ${resource.id}`;
    default:
      return `${resource.resourceType} ${resource.id}`;
  }
}
```
