import React from 'react';
import { useGetResourceByIdQuery } from '../../services/fhir/client';

// Renders HL7 FHIR R5 CarePlan elements (http://hl7.org/fhir/R5/careplan.html).

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-SG', { dateStyle: 'medium' });
};

const conceptText = (concept: any): string =>
  concept?.text ||
  concept?.coding?.[0]?.display ||
  concept?.coding?.[0]?.code ||
  '';

const codingLabels = (concept: any): string[] =>
  (concept?.coding ?? [])
    .filter((coding: any) => coding?.code)
    .map((coding: any) => {
      const system = String(coding.system || '');
      const prefix = system.includes('snomed')
        ? 'SNOMED'
        : system.includes('loinc')
          ? 'LOINC'
          : system.includes('rxnorm')
            ? 'RxNorm'
            : system.includes('icd')
              ? 'ICD'
              : '';
      return prefix ? `${prefix} ${coding.code}` : coding.code;
    });

const referenceLabel = (reference: any): string =>
  reference?.display || reference?.reference || '';

const codeableReferenceLabel = (value: any): string =>
  conceptText(value?.concept) || referenceLabel(value?.reference);

const periodLabel = (period: any): string => {
  if (!period?.start && !period?.end) return '';
  return `${formatDate(period.start) || '—'} → ${formatDate(period.end) || 'ongoing'}`;
};

const timingLabel = (timing: any): string => {
  if (!timing) return '';
  const repeat = timing.repeat;
  const parts: string[] = [];
  if (timing.code) parts.push(conceptText(timing.code));
  if (repeat?.frequency && repeat?.period && repeat?.periodUnit) {
    parts.push(
      repeat.frequency === 1
        ? `Every ${repeat.period} ${repeat.periodUnit}`
        : `${repeat.frequency}× per ${repeat.period} ${repeat.periodUnit}`,
    );
  }
  if (repeat?.boundsPeriod) parts.push(periodLabel(repeat.boundsPeriod));
  if (timing.event?.length) parts.push(timing.event.map(formatDate).join(', '));
  return parts.filter(Boolean).join(' · ');
};

const annotationText = (notes: any[] = []): string[] =>
  notes.map((note) => note?.text).filter(Boolean);

const parseLocalReference = (reference?: string) => {
  if (!reference || reference.startsWith('#')) return null;
  const parts = reference.split('?')[0].replace(/\/$/, '').split('/');
  if (parts.length < 2) return null;
  return { resourceType: parts[parts.length - 2], id: parts[parts.length - 1] };
};

const StatusChip: React.FC<{ value?: string }> = ({ value }) =>
  value ? (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {value}
    </span>
  ) : null;

// One-line facts for whatever request/goal resource an activity or goal points to.
const ResourceFacts: React.FC<{ resource: any }> = ({ resource }) => {
  const title =
    conceptText(resource.code) ||
    conceptText(resource.medication?.concept) ||
    resource.description?.text ||
    (typeof resource.description === 'string' ? resource.description : '') ||
    conceptText(resource.serviceType?.[0]?.concept) ||
    resource.resourceType;
  const status = resource.status || resource.lifecycleStatus;
  const codes = codingLabels(resource.code);
  const schedule =
    timingLabel(resource.occurrenceTiming) ||
    periodLabel(resource.occurrencePeriod) ||
    formatDate(resource.occurrenceDateTime) ||
    periodLabel(resource.executionPeriod) ||
    (resource.start ? formatDate(resource.start) : '');
  const dosage = resource.dosageInstruction
    ?.map((dose: any) => dose.text || timingLabel(dose.timing))
    .filter(Boolean)
    .join('; ');
  const performer =
    referenceLabel(resource.performer?.[0]) ||
    conceptText(resource.performerType) ||
    referenceLabel(resource.owner);
  const reasons = (resource.reason ?? [])
    .map(codeableReferenceLabel)
    .filter(Boolean)
    .join(', ');
  const targets = (resource.target ?? [])
    .map((target: any) =>
      [
        conceptText(target.measure),
        target.detailQuantity
          ? `${target.detailQuantity.comparator ?? ''}${target.detailQuantity.value} ${target.detailQuantity.unit ?? ''}`.trim()
          : target.detailString ||
            conceptText(target.detailCodeableConcept) ||
            (target.detailRange
              ? `${target.detailRange.low?.value ?? ''}–${target.detailRange.high?.value ?? ''} ${target.detailRange.high?.unit ?? ''}`
              : ''),
        target.dueDate ? `by ${formatDate(target.dueDate)}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean);
  const notes = annotationText(resource.note);

  const rows: Array<[string, string]> = [
    ['Codes', codes.join(', ')],
    ['Schedule', schedule],
    ['Dosage', dosage || ''],
    ['Performer', performer],
    ['Reason', reasons],
    ['Targets', targets.join('; ')],
    ['Notes', notes.join(' · ')],
  ];

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <span className="text-[11px] text-gray-500">
          {resource.resourceType}
        </span>
        <StatusChip value={status} />
        {resource.intent && <StatusChip value={resource.intent} />}
      </div>
      <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-600 sm:grid-cols-[auto,1fr]">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="font-medium text-gray-500">{label}</dt>
              <dd className="break-words">{value}</dd>
            </React.Fragment>
          ))}
      </dl>
    </div>
  );
};

// Resolves a Reference to a contained resource ("#id") or fetches it from the server.
const ReferencedResource: React.FC<{ reference: any; contained: any[] }> = ({
  reference,
  contained,
}) => {
  const ref = String(reference?.reference || '');
  const containedResource = ref.startsWith('#')
    ? contained.find((item) => item?.id === ref.slice(1))
    : undefined;
  const target = containedResource ? null : parseLocalReference(ref);
  const { data, isFetching, isError } = useGetResourceByIdQuery(
    { resourceType: target?.resourceType ?? '', id: target?.id ?? '' },
    { skip: !target },
  );
  const resource = containedResource || data;

  if (resource) return <ResourceFacts resource={resource} />;
  return (
    <span className="text-sm text-gray-700">
      {referenceLabel(reference) || 'Unresolved reference'}
      {isFetching && (
        <span className="ml-2 text-xs text-gray-400">Loading…</span>
      )}
      {isError && (
        <span className="ml-2 text-xs text-red-600">
          Unable to load details
        </span>
      )}
    </span>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="mt-4">
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {title}
    </h4>
    {children}
  </section>
);

export const CarePlanDetails: React.FC<{ carePlan: any }> = ({ carePlan }) => {
  const contained: any[] = carePlan.contained ?? [];
  const overview: Array<[string, string]> = [
    ['Status', carePlan.status],
    ['Intent', carePlan.intent],
    [
      'Category',
      (carePlan.category ?? []).map(conceptText).filter(Boolean).join(', '),
    ],
    ['Period', periodLabel(carePlan.period)],
    ['Created', formatDate(carePlan.created)],
    ['Custodian', referenceLabel(carePlan.custodian)],
    [
      'Contributors',
      (carePlan.contributor ?? [])
        .map(referenceLabel)
        .filter(Boolean)
        .join(', '),
    ],
    ['Encounter', referenceLabel(carePlan.encounter)],
    [
      'Based on',
      (carePlan.basedOn ?? []).map(referenceLabel).filter(Boolean).join(', '),
    ],
    [
      'Replaces',
      (carePlan.replaces ?? []).map(referenceLabel).filter(Boolean).join(', '),
    ],
    [
      'Part of',
      (carePlan.partOf ?? []).map(referenceLabel).filter(Boolean).join(', '),
    ],
    [
      'Protocol',
      [
        ...(carePlan.instantiatesCanonical ?? []),
        ...(carePlan.instantiatesUri ?? []),
      ].join(', '),
    ],
    [
      'Identifier',
      (carePlan.identifier ?? [])
        .map((id: any) => id.value)
        .filter(Boolean)
        .join(', '),
    ],
  ];
  const addresses = (carePlan.addresses ?? [])
    .map(codeableReferenceLabel)
    .filter(Boolean);
  const supportingInfo = (carePlan.supportingInfo ?? [])
    .map(referenceLabel)
    .filter(Boolean);
  const careTeams = (carePlan.careTeam ?? [])
    .map(referenceLabel)
    .filter(Boolean);
  const activities: any[] = carePlan.activity ?? [];
  const notes: any[] = carePlan.note ?? [];

  return (
    <div className="text-sm text-gray-700">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {overview
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="inline font-medium text-gray-600">{label}: </dt>
              <dd className="inline break-words">{value}</dd>
            </div>
          ))}
      </dl>

      {addresses.length > 0 && (
        <Section title="Addresses">
          <div className="flex flex-wrap gap-2">
            {addresses.map((label: string, index: number) => (
              <span
                key={`${label}-${index}`}
                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800"
              >
                {label}
              </span>
            ))}
          </div>
        </Section>
      )}

      {carePlan.goal?.length > 0 && (
        <Section title={`Goals (${carePlan.goal.length})`}>
          <ul className="space-y-2">
            {carePlan.goal.map((goal: any, index: number) => (
              <li
                key={index}
                className="rounded-md border border-emerald-200 bg-white px-3 py-2"
              >
                <ReferencedResource reference={goal} contained={contained} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {activities.length > 0 && (
        <Section title={`Activities (${activities.length})`}>
          <ol className="space-y-2">
            {activities.map((activity: any, index: number) => {
              const performed = (activity.performedActivity ?? [])
                .map(codeableReferenceLabel)
                .filter(Boolean);
              const progress = annotationText(activity.progress);
              // R4-shaped data (activity.detail) is still shown if present.
              const legacyDetail = activity.detail;
              return (
                <li
                  key={index}
                  className="rounded-md border border-blue-200 bg-white px-3 py-2"
                >
                  <div className="flex gap-2">
                    <span className="text-xs font-semibold text-blue-700">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {activity.plannedActivityReference ? (
                        <ReferencedResource
                          reference={activity.plannedActivityReference}
                          contained={contained}
                        />
                      ) : legacyDetail ? (
                        <ResourceFacts
                          resource={{
                            ...legacyDetail,
                            resourceType: legacyDetail.kind || 'Activity',
                            occurrenceTiming: legacyDetail.scheduledTiming,
                            occurrencePeriod: legacyDetail.scheduledPeriod,
                            occurrenceDateTime: legacyDetail.scheduledString,
                          }}
                        />
                      ) : (
                        <p className="text-sm text-gray-500">
                          No planned activity specified.
                        </p>
                      )}
                      {performed.length > 0 && (
                        <p className="text-xs text-gray-600">
                          <span className="font-medium text-gray-500">
                            Performed:{' '}
                          </span>
                          {performed.join(', ')}
                        </p>
                      )}
                      {progress.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-600">
                          {progress.map((text, noteIndex) => (
                            <li key={noteIndex}>{text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {careTeams.length > 0 && (
        <Section title="Care team">
          <p>{careTeams.join(', ')}</p>
        </Section>
      )}

      {supportingInfo.length > 0 && (
        <Section title="Supporting information">
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {supportingInfo.map((label: string, index: number) => (
              <li key={index}>{label}</li>
            ))}
          </ul>
        </Section>
      )}

      {notes.length > 0 && (
        <Section title="Notes">
          <ul className="space-y-1.5">
            {notes.map((note: any, index: number) => (
              <li
                key={index}
                className="rounded-md bg-white px-3 py-2 text-xs text-gray-700 ring-1 ring-gray-200"
              >
                {note.text}
                {(note.authorReference || note.authorString || note.time) && (
                  <span className="mt-1 block text-[11px] text-gray-400">
                    {[
                      referenceLabel(note.authorReference) || note.authorString,
                      formatDate(note.time),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

export default CarePlanDetails;
