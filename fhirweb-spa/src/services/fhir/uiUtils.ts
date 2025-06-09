/**
 * FHIR UI Utilities
 *
 * Utility functions to support UI generation for FHIR resources
 */

/**
 * Fetches a JSON file from the specified path
 */
async function fetchJSON(path: string) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${path}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching JSON from ${path}:`, error);
    throw error;
  }
}

/**
 * Generates form groups for a FHIR resource type
 * Groups elements into logical sections based on their paths and properties
 */
export async function generateFormGroups(resourceType: string) {
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

/**
 * Extract elements from the FHIR structure definition
 */
function extractElementsFromStructureDefinition(structureDef: any) {
  if (!structureDef?.snapshot?.element) {
    return [];
  }

  const elements: any[] = [];
  const baseResourceType = structureDef.type;

  structureDef.snapshot.element.forEach((element: any) => {
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

/**
 * Check if this is a simple sub-path that we want to include directly
 */
function isSimpleSubPath(path: string, baseResourceType: string) {
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

/**
 * Organize elements into logical groups based on FHIR structure
 */
function organizeElementsIntoGroups(resourceType: string, elements: any[]) {
  // Create the groups structure
  const groups: any[] = [];

  // Track which elements have been assigned to groups
  const assignedElements = new Set<string>();

  // First, identify all backbone elements to create groups
  const backboneGroups = new Map<string, any>();
  const backboneElements = elements.filter((element) => {
    const types = element.type || [];
    return types.some((type) => type.code === 'BackboneElement');
  });

  // Create a group for each backbone element
  backboneElements.forEach((backbone) => {
    const pathParts = backbone.path.split('.');
    const elementName = pathParts[pathParts.length - 1];

    // Format the group title (e.g., "admission" -> "Admission Details")
    const groupTitle =
      elementName.charAt(0).toUpperCase() + elementName.slice(1) + ' Details';

    backboneGroups.set(backbone.path, {
      id: elementName.toLowerCase(),
      title: groupTitle,
      elements: [],
      path: backbone.path,
    });
  });

  // Create an "Overview" group for top-level elements
  const overviewGroup = {
    id: 'overview',
    title: 'Overview',
    elements: [],
  };

  // Assign elements to their respective groups
  elements.forEach((element) => {
    const path = element.path;
    const pathParts = path.split('.');

    // Skip backbone elements themselves
    if (
      element.type &&
      element.type.some((type: any) => type.code === 'BackboneElement')
    ) {
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
  const sortedBackboneGroups = Array.from(backboneGroups.values()).sort(
    (a, b) => {
      // Find the index of these elements in the original elements array
      const indexA = elements.findIndex((e) => e.path === a.path);
      const indexB = elements.findIndex((e) => e.path === b.path);
      return indexA - indexB;
    },
  );

  groups.push(...sortedBackboneGroups);

  // Check if any elements were not assigned to a group
  const unassignedElements = elements
    .filter((element) => !assignedElements.has(element.path))
    .map((element) => {
      const pathParts = element.path.split('.');
      return pathParts[pathParts.length - 1];
    });

  if (unassignedElements.length > 0) {
    groups.push({
      id: 'other',
      title: 'Other Information',
      elements: unassignedElements,
    });
  }

  // Apply resource-specific customizations - pass elements as argument
  return customizeGroupsForResourceType(resourceType, groups, elements);
}

/**
 * Add resource-specific customizations to the groups
 */
function customizeGroupsForResourceType(
  resourceType: string,
  groups: any[],
  elements: any[] = [],
) {
  switch (resourceType) {
    case 'Observation':
      // For Observation, ensure component is in its own group
      const componentGroupIndex = groups.findIndex(
        (g) => g.id === 'components' || g.elements.includes('component'),
      );

      if (componentGroupIndex >= 0) {
        groups[componentGroupIndex].title = 'Component Observations';
      } else {
        // Check if component is in another group and move it
        for (let i = 0; i < groups.length; i++) {
          const compIndex = groups[i].elements.indexOf('component');
          if (compIndex >= 0) {
            // Remove from current group
            groups[i].elements.splice(compIndex, 1);

            // Add to new group
            groups.push({
              id: 'components',
              title: 'Component Observations',
              elements: ['component'],
            });
            break;
          }
        }
      }
      break;

    case 'CarePlan':
      // For CarePlan, ensure activities have their own group
      let activityFound = false;
      for (let i = 0; i < groups.length; i++) {
        const activityIndex = groups[i].elements.indexOf('activity');
        if (activityIndex >= 0) {
          // Remove activity from current group
          groups[i].elements.splice(activityIndex, 1);
          activityFound = true;

          // Add activities group if it doesn't exist yet
          if (!groups.some((g) => g.id === 'activities')) {
            groups.push({
              id: 'activities',
              title: 'Activities',
              elements: ['activity'],
            });
          }
          break;
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
          (element: string) =>
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

      // Add medication group if there are medication elements
      const hasMedElements = medicationElements.some((med) =>
        elements.some((el: any) => {
          const pathParts = el.path.split('.');
          const elementName = pathParts[pathParts.length - 1];
          return (
            elementName === med ||
            (med.includes('[x]') &&
              elementName.startsWith(med.replace('[x]', '')))
          );
        }),
      );

      if (hasMedElements) {
        groups.push({
          id: 'medication',
          title: 'Medication Information',
          elements: medicationElements,
        });
      }
      break;
  }

  // Remove any empty groups after customization
  return groups.filter((group) => group.elements.length > 0);
}

/**
 * Generate default groups for when structure definition cannot be loaded
 */
function generateDefaultGroups(resourceType: string) {
  switch (resourceType) {
    case 'Observation':
      return [
        {
          id: 'identification',
          title: 'Identification',
          elements: ['id', 'identifier', 'status', 'code', 'category'],
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
          id: 'components',
          title: 'Component Observations',
          elements: ['component'],
        },
        {
          id: 'other',
          title: 'Other Information',
          elements: ['performer', 'specimen', 'device', 'referenceRange'],
        },
      ];
    case 'CarePlan':
      return [
        {
          id: 'identification',
          title: 'Identification',
          elements: ['id', 'identifier', 'status', 'intent', 'category'],
        },
        {
          id: 'timing',
          title: 'Timing',
          elements: ['created', 'period'],
        },
        {
          id: 'clinical',
          title: 'Clinical Information',
          elements: ['description', 'note'],
        },
        {
          id: 'subject',
          title: 'Subject Information',
          elements: ['subject', 'encounter', 'author', 'careTeam', 'addresses'],
        },
        {
          id: 'activities',
          title: 'Activities',
          elements: ['activity'],
        },
        {
          id: 'other',
          title: 'Other Information',
          elements: ['basedOn', 'replaces', 'partOf', 'goal', 'supportingInfo'],
        },
      ];
    case 'MedicationRequest':
      return [
        {
          id: 'identification',
          title: 'Identification',
          elements: [
            'id',
            'identifier',
            'status',
            'intent',
            'category',
            'priority',
          ],
        },
        {
          id: 'timing',
          title: 'Timing',
          elements: ['authoredOn'],
        },
        {
          id: 'medication',
          title: 'Medication Information',
          elements: [
            'medication[x]',
            'dosageInstruction',
            'dispenseRequest',
            'substitution',
          ],
        },
        {
          id: 'subject',
          title: 'Subject Information',
          elements: [
            'subject',
            'encounter',
            'requester',
            'performer',
            'recorder',
          ],
        },
        {
          id: 'other',
          title: 'Other Information',
          elements: [
            'basedOn',
            'groupIdentifier',
            'courseOfTherapyType',
            'insurance',
            'note',
            'reasonCode',
            'reasonReference',
            'supportingInformation',
          ],
        },
      ];
    default:
      return [
        {
          id: 'identification',
          title: 'Identification',
          elements: ['id', 'identifier', 'status', 'code', 'category'],
        },
        {
          id: 'timing',
          title: 'Timing',
          elements: ['issued', 'period', 'date', 'created', 'authoredOn'],
        },
        {
          id: 'clinical',
          title: 'Clinical Information',
          elements: ['value[x]', 'description', 'note'],
        },
        {
          id: 'subject',
          title: 'Subject Information',
          elements: ['subject', 'encounter', 'performer', 'author'],
        },
        {
          id: 'other',
          title: 'Other Information',
          elements: ['basedOn', 'partOf'],
        },
      ];
  }
}
