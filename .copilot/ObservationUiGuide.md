# FHIR Observation UI Generation Guide

This guide provides prompts and specifications for generating user interfaces to display and manage FHIR Observation resources.

## Table Listing View

The table listing view should display only elements where `isSummary=true`. This creates a concise overview of Observations that highlights the most important information.

### Column Definition for Table Listing View

```typescript
// Define columns for the Observation listing table
// Only include elements where isSummary=true
const observationListColumns = [
  {
    header: 'ID',
    accessor: 'id',
    width: '80px',
  },
  {
    header: 'Status',
    accessor: 'status',
    width: '120px',
    // Status is a modifier element and requires special styling
    cell: (status) => <StatusBadge status={status} />,
  },
  {
    header: 'Code',
    accessor: 'code.coding[0].display',
    fallback: 'code.text',
    width: '200px',
  },
  {
    header: 'Subject',
    accessor: 'subject.display',
    width: '180px',
  },
  {
    header: 'Effective Date',
    accessor: 'effective[x]',
    width: '150px',
    // Handle various effective[x] types
    cell: (effective) => formatEffectiveDate(effective),
  },
  {
    header: 'Value',
    // Handle various value[x] types
    accessor: 'value[x]',
    width: '150px',
    cell: (value) => formatObservationValue(value),
  },
  {
    header: 'Issued',
    accessor: 'issued',
    width: '150px',
    cell: (date) => formatDateTime(date),
  },
  {
    header: 'Performer',
    accessor: 'performer[0].display',
    width: '180px',
  },
  {
    header: 'Actions',
    width: '100px',
    cell: (_, observation) => (
      <ActionButtons
        viewUrl={`/observation/${observation.id}`}
        editUrl={`/observation/${observation.id}/edit`}
      />
    ),
  },
];
```

### Prompt for Table Listing UI Generation

```
Generate a responsive table component to display FHIR Observations with the following requirements:
1. Only show summary elements (elements marked with isSummary=true in the FHIR specification)
2. Include columns for: id, status, code, subject, effective date/time, value, issued date, and performer
3. Implement proper formatting for different data types (datetime, CodeableConcept, Quantity, etc.)
4. Include sorting and filtering capabilities
5. Handle pagination for large result sets
6. Display status values using appropriate visual indicators (colors/badges)
7. Provide action buttons for viewing details and editing
8. Include empty state handling
9. Include error state handling
10. Implement responsive design for mobile and desktop views
```

## Detail/Edit/Create View

The detail/edit/create view should provide a comprehensive interface for viewing and managing all elements of an Observation resource.

### Grouping Structure for Form Elements

```typescript
// Organize Observation elements into logical groups for the UI
const observationFormGroups = [
  {
    id: 'identification',
    title: 'Identification',
    elements: ['id', 'identifier', 'status', 'category', 'code'],
  },
  {
    id: 'timing',
    title: 'Timing',
    elements: ['issued', 'effective[x]'],
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
    elements: ['subject', 'focus', 'encounter'],
  },
  {
    id: 'relationships',
    title: 'Related Resources',
    elements: ['basedOn', 'partOf', 'hasMember', 'derivedFrom'],
  },
  {
    id: 'other',
    title: 'Other Information',
    elements: [
      'performer',
      'specimen',
      'device',
      'referenceRange',
      'component',
    ],
  },
];
```

### Prompt for Detail/Edit View UI Generation

```
Generate a detailed UI component for viewing and editing FHIR Observation resources with the following requirements:
1. Organize fields into logical groups (identification, timing, clinical information, etc.)
2. Implement a toggle between view mode and edit mode
3. Handle all possible data types for value[x] (Quantity, CodeableConcept, string, boolean, etc.)
4. Implement field validation based on FHIR constraints
5. Support special handling for required fields (code, status)
6. Implement conditional fields that only appear when relevant
7. Include appropriate form controls for each data type:
   - Select dropdown for coded values with terminology binding
   - Date/time picker for temporal fields
   - Numerical inputs with units for Quantity values
   - Rich text for string values
   - Reference selectors for resource references
8. Handle complex nested structures like component and referenceRange
9. Implement toolbar actions (save, cancel, delete)
10. Include error handling and validation feedback
11. Provide a responsive layout that works on both desktop and mobile devices
```

### Prompt for Create View UI Generation

```
Generate a UI component for creating new FHIR Observation resources with the following requirements:
1. Organize form into logical sections with clear labels
2. Pre-populate default values where appropriate (status="registered", current date/time)
3. Support all major Observation types (vital signs, lab results, social history, etc.)
4. Handle different value types through dynamic form controls
5. Implement field validation based on FHIR constraints
6. Validate required fields before submission
7. Support reference selection for subject, performer, and other references
8. Include structured inputs for complex fields like components and reference ranges
9. Support adding multiple items to repeating elements (identifier, category, performer)
10. Implement save, cancel, and reset actions
11. Provide comprehensive error handling and validation feedback
12. Implement a responsive layout for desktop and mobile use
```

## Additional Considerations

### Observation Component Handling

Components require special handling as they are nested structures that include their own code, value, and reference ranges.

```typescript
// Example component rendering for both display and edit modes
const ObservationComponent = ({ component, editable }) => {
  if (editable) {
    return (
      <ComponentEditForm
        component={component}
        codeOptions={getCodeOptions()}
        onUpdate={handleComponentUpdate}
        onRemove={handleRemoveComponent}
      />
    );
  }

  return (
    <ComponentDisplay
      code={component.code}
      value={component.value[x]}
      dataAbsentReason={component.dataAbsentReason}
      interpretation={component.interpretation}
      referenceRange={component.referenceRange}
    />
  );
};
```

### Value Type Handling

The Observation value can be of various types, requiring special handling.

```typescript
// Example of handling different value types
const ObservationValue = ({ observation, editable, onChange }) => {
  // Determine which value type is present
  const valueType = determineValueType(observation);

  if (editable) {
    switch (valueType) {
      case 'Quantity':
        return (
          <QuantityInput
            value={observation.valueQuantity}
            onChange={onChange}
          />
        );
      case 'CodeableConcept':
        return (
          <CodeableConceptInput
            value={observation.valueCodeableConcept}
            onChange={onChange}
          />
        );
      case 'string':
        return (
          <TextInput value={observation.valueString} onChange={onChange} />
        );
      case 'boolean':
        return (
          <BooleanInput value={observation.valueBoolean} onChange={onChange} />
        );
      // Handle other value types...
      default:
        return <ValueTypeSelector onTypeChange={handleValueTypeChange} />;
    }
  }

  // Display version
  return <FormattedObservationValue observation={observation} />;
};
```

## Best Practices

1. **Terminology Integration**: Link to appropriate terminology services for coded values
2. **Validation**: Implement FHIR constraints as validation rules
3. **User Experience**: Guide users through complex fields with contextual help
4. **Performance**: Optimize rendering for large datasets
5. **Accessibility**: Ensure all UI components meet accessibility standards
6. **Internationalization**: Support for multiple languages and formatting conventions
7. **Error Handling**: Provide clear error messages and validation feedback
8. **Responsive Design**: Ensure usability across different device sizes
9. **Consistent Styling**: Maintain design consistency with the rest of the application

## Reference Lookups

When displaying FHIR references, provide lookups to display human-readable labels when available.

```typescript
// Example of reference lookup component
const ReferenceDisplay = ({ reference }) => {
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
```
