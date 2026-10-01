import React from 'react';

export const friendlyFieldLabel = (field: string) =>
  field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());

export const FhirResourceEditor: React.FC<{
  resource: Record<string, any>;
  onChange: (resource: Record<string, any>) => void;
}> = ({ resource, onChange }) => {
  const update = (path: Array<string | number>, value: unknown) => {
    const next = JSON.parse(JSON.stringify(resource));
    let target = next;
    path.slice(0, -1).forEach((key) => {
      target[key] = target[key] || {};
      target = target[key];
    });
    target[path[path.length - 1]] = value;
    onChange(next);
  };

  const inputClass =
    'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30';

  const temporalFieldPattern =
    /(^|date|time|datetime|issued|authored|recorded|effective|onset|performed|occurrence|created|updated|start|end)$/i;

  const isTemporalField = (path: Array<string | number>, value: unknown) => {
    const field = String(path[path.length - 1]);
    return (
      temporalFieldPattern.test(field) ||
      (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value))
    );
  };

  const toDateInputValue = (value: string, dateTime: boolean) =>
    dateTime ? value.slice(0, 16) : value.slice(0, 10);

  const isReadOnlyReferenceField = (path: Array<string | number>) => {
    const field = String(path[path.length - 1]).toLowerCase();
    return (
      field === 'id' ||
      field.endsWith('id') ||
      field === 'reference' ||
      field.endsWith('reference') ||
      field === 'resourcetype'
    );
  };

  const renderCodeableConcept = (
    value: Record<string, any>,
    path: Array<string | number>,
    label: string,
  ): React.ReactNode => {
    const coding = Array.isArray(value.coding) ? value.coding : [];
    return (
      <fieldset
        key={path.join('.')}
        className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3"
      >
        {coding.map((entry: Record<string, any>, index: number) => (
          <div
            key={`${path.join('.')}.coding.${index}`}
            className="space-y-3 rounded-md border border-gray-200 bg-white p-3"
          >
            <label className="block text-xs font-semibold text-gray-600">
              Code
              <input
                className={inputClass}
                value={entry.code || ''}
                onChange={(event) =>
                  update([...path, 'coding', index, 'code'], event.target.value)
                }
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              System
              <input
                className={inputClass}
                value={entry.system || ''}
                onChange={(event) =>
                  update(
                    [...path, 'coding', index, 'system'],
                    event.target.value,
                  )
                }
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Display
              <input
                className={inputClass}
                value={entry.display || ''}
                onChange={(event) =>
                  update(
                    [...path, 'coding', index, 'display'],
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        ))}
        <label className="block text-xs font-semibold text-gray-600">
          Text
          <input
            className={inputClass}
            value={value.text || ''}
            onChange={(event) => update([...path, 'text'], event.target.value)}
          />
        </label>
        {coding.length === 0 && !value.text && (
          <p className="text-xs text-gray-500">No code or text supplied.</p>
        )}
        {label === 'Code' && (
          <p className="text-[11px] text-gray-500">
            Update the clinical code, terminology system, display label, or free
            text.
          </p>
        )}
      </fieldset>
    );
  };

  const renderValue = (
    value: any,
    path: Array<string | number>,
    label: string,
    depth = 0,
  ): React.ReactNode => {
    if (value === null || value === undefined) {
      const isTemporal = isTemporalField(path, value);
      const readOnly = isReadOnlyReferenceField(path);
      return (
        <label
          key={path.join('.')}
          className="block text-xs font-semibold text-gray-600"
        >
          {label}
          <input
            type={isTemporal ? 'date' : 'text'}
            className={`${inputClass} ${readOnly ? 'cursor-not-allowed bg-gray-200 text-gray-600' : ''}`}
            value=""
            readOnly={readOnly}
            onChange={(event) => update(path, event.target.value)}
          />
        </label>
      );
    }

    if (typeof value === 'object') {
      if (
        !Array.isArray(value) &&
        ('coding' in value ||
          (typeof value.text === 'string' &&
            [
              'code',
              'category',
              'severity',
              'clinicalStatus',
              'verificationStatus',
              'interpretation',
            ].includes(String(path[path.length - 1]))))
      ) {
        return renderCodeableConcept(value, path, label);
      }
      if (Array.isArray(value)) {
        const readOnly = isReadOnlyReferenceField(path);
        return (
          <fieldset
            key={path.join('.')}
            className={`space-y-3 rounded-md border border-gray-300 p-3 ${readOnly ? 'bg-gray-200' : 'bg-gray-50'}`}
          >
            <legend className="px-1 text-xs font-semibold text-gray-600">
              {label}
            </legend>
            {value.length === 0 ? (
              <p className="text-xs text-gray-500">No entries</p>
            ) : (
              value.map((item, index) =>
                renderValue(
                  item,
                  [...path, index],
                  `${label} ${index + 1}`,
                  depth + 1,
                ),
              )
            )}
          </fieldset>
        );
      }

      return (
        <fieldset
          key={path.join('.')}
          className={`space-y-3 rounded-md border border-gray-300 p-3 ${isReadOnlyReferenceField(path) ? 'bg-gray-200' : depth > 0 ? 'bg-gray-50' : 'bg-white'}`}
        >
          <legend className="px-1 text-xs font-semibold text-gray-600">
            {label}
          </legend>
          {Object.entries(value).map(([field, nestedValue]) =>
            renderValue(
              nestedValue,
              [...path, field],
              friendlyFieldLabel(field),
              depth + 1,
            ),
          )}
        </fieldset>
      );
    }

    const isBoolean = typeof value === 'boolean';
    const isNumber = typeof value === 'number';
    const isTemporal = isTemporalField(path, value);
    const isDateTime = isTemporal && String(value).includes('T');
    const readOnly = isReadOnlyReferenceField(path);
    return (
      <label
        key={path.join('.')}
        className="block text-xs font-semibold text-gray-600"
      >
        {label}
        {isBoolean ? (
          <select
            className={`${inputClass} ${readOnly ? 'cursor-not-allowed bg-gray-200 text-gray-600' : ''}`}
            value={String(value)}
            disabled={readOnly}
            onChange={(event) => update(path, event.target.value === 'true')}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        ) : (
          <input
            type={
              isNumber
                ? 'number'
                : isDateTime
                  ? 'datetime-local'
                  : isTemporal
                    ? 'date'
                    : 'text'
            }
            value={
              isTemporal
                ? toDateInputValue(String(value), isDateTime)
                : String(value)
            }
            readOnly={readOnly}
            className={`${inputClass} ${readOnly ? 'cursor-not-allowed bg-gray-200 text-gray-600' : ''}`}
            onChange={(event) =>
              update(
                path,
                isNumber ? Number(event.target.value) : event.target.value,
              )
            }
          />
        )}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      {Object.entries(resource).map(([field, value]) =>
        renderValue(value, [field], friendlyFieldLabel(field)),
      )}
    </div>
  );
};
