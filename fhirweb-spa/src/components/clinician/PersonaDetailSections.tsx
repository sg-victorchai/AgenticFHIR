import React from 'react';
import { PersonaDetail } from '../../services/agentBuilderService';

const Section: React.FC<{
  title: string;
  count?: number;
  children: React.ReactNode;
}> = ({ title, count, children }) => (
  <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {title}
      {count !== undefined && (
        <span className="ml-1 font-normal normal-case text-slate-400">
          {count}
        </span>
      )}
    </h3>
    <div className="mt-2">{children}</div>
  </section>
);

const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());

const Value: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === 'boolean')
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
      >
        {value ? 'Yes' : 'No'}
      </span>
    );
  if (Array.isArray(value))
    return value.length ? (
      <span className="flex flex-wrap gap-1">
        {value.map((item, index) => (
          <span
            key={index}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]"
          >
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </span>
    ) : (
      <span className="text-slate-400">None</span>
    );
  if (value && typeof value === 'object')
    return (
      <pre className="overflow-auto whitespace-pre-wrap break-words text-[10px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  return <span className="break-words">{String(value)}</span>;
};

export const KeyValues: React.FC<{ data: Record<string, unknown> }> = ({
  data,
}) => {
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (!entries.length) return <p className="text-xs text-slate-400">None</p>;
  return (
    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[40%_1fr] gap-2 px-3 py-2">
          <dt className="text-[11px] text-slate-500">{humanize(key)}</dt>
          <dd className="min-w-0 text-xs font-medium text-slate-800">
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
};

type ToolScope = {
  allowedResourceTypes?:
    | Record<string, { defaultSearchParams?: Record<string, unknown> }>
    | string[];
  [key: string]: unknown;
};

const resourceTypeEntries = (scope: ToolScope) => {
  const allowed = scope.allowedResourceTypes;
  if (Array.isArray(allowed)) return allowed.map((type) => [type, {}] as const);
  return Object.entries(allowed ?? {});
};

const ToolScopeList: React.FC<{ detail: PersonaDetail }> = ({ detail }) => {
  const config = (detail.toolConfig ?? {}) as Record<string, ToolScope>;
  const tools = detail.tools?.length ? detail.tools : Object.keys(config);
  return (
    <div className="space-y-2">
      {tools.map((tool) => {
        const scope = config[tool] ?? {};
        const types = resourceTypeEntries(scope);
        const extras = Object.fromEntries(
          Object.entries(scope).filter(
            ([key]) => key !== 'allowedResourceTypes',
          ),
        );
        return (
          <details
            key={tool}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <summary className="cursor-pointer text-xs">
              <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-[10px] text-indigo-700">
                {tool}
              </span>
              {types.length > 0 && (
                <span className="ml-2 text-slate-500">
                  {types.length} resource type{types.length === 1 ? '' : 's'}
                </span>
              )}
            </summary>
            <div className="mt-2 space-y-2">
              {types.length > 0 ? (
                <ul className="space-y-1">
                  {types.map(([type, typeScope]) => {
                    const params = (
                      typeScope as { defaultSearchParams?: object }
                    ).defaultSearchParams;
                    return (
                      <li key={type} className="text-xs">
                        <span className="font-medium">{type}</span>
                        {params && Object.keys(params).length > 0 && (
                          <span className="ml-2 font-mono text-[10px] text-slate-500">
                            default:{' '}
                            {Object.entries(params)
                              .map(([name, value]) => `${name}=${value}`)
                              .join(', ')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">
                  No resource-type restrictions.
                </p>
              )}
              {Object.keys(extras).length > 0 && <KeyValues data={extras} />}
            </div>
          </details>
        );
      })}
    </div>
  );
};

const CompletionCriteria: React.FC<{ value: unknown }> = ({ value }) => {
  if (Array.isArray(value))
    return (
      <ul className="space-y-2">
        {value.map((criterion: any, index) => (
          <li
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
              {String(criterion.type ?? 'criterion')}
            </span>
            {criterion.description && (
              <p className="mt-1 text-xs text-slate-600">
                {String(criterion.description)}
              </p>
            )}
            {criterion.expression && (
              <code className="mt-1 block break-words text-[10px] text-slate-500">
                {String(criterion.expression)}
              </code>
            )}
          </li>
        ))}
      </ul>
    );
  return <KeyValues data={value as Record<string, unknown>} />;
};

export const PersonaDetailSections: React.FC<{ detail: PersonaDetail }> = ({
  detail,
}) => {
  const isPipeline = detail.personaType === 'DATA_PIPELINE';
  const skills = detail.skills?.resolvedSkills as
    | Array<Record<string, any>>
    | undefined;
  const formatters = detail.formatters as Record<string, any> | undefined;
  const hasToolScope =
    !isPipeline && (detail.tools?.length || detail.toolConfig);
  return (
    <>
      {hasToolScope && (
        <Section title="Tools and data scope" count={detail.tools?.length}>
          <ToolScopeList detail={detail} />
        </Section>
      )}
      {(detail.intendedUserRole ||
        detail.intendedChannels?.length ||
        detail.roleValidation) && (
        <Section title="Audience and access">
          <KeyValues
            data={{
              intendedUserRole: detail.intendedUserRole,
              intendedChannels: detail.intendedChannels,
              ...(detail.roleValidation ?? {}),
            }}
          />
        </Section>
      )}
      {detail.roleGuardrails && (
        <Section title="Guardrails">
          <KeyValues data={detail.roleGuardrails} />
        </Section>
      )}
      {detail.guardrailProfileRef && (
        <Section title="Guardrail profile">
          <KeyValues
            data={{
              profile: detail.guardrailProfileRef,
              ...(detail.guardrailProfile ?? {}),
            }}
          />
        </Section>
      )}
      {detail.completionCriteria &&
        (Array.isArray(detail.completionCriteria)
          ? detail.completionCriteria.length > 0
          : Object.keys(detail.completionCriteria).length > 0) && (
          <Section title="Completion criteria">
            <CompletionCriteria value={detail.completionCriteria} />
          </Section>
        )}
      {(detail.budget || detail.memory) && (
        <Section title="Budget and memory">
          <KeyValues
            data={{
              ...Object.fromEntries(
                Object.entries(detail.budget ?? {}).map(([key, value]) => [
                  `budget ${key}`,
                  value,
                ]),
              ),
              ...Object.fromEntries(
                Object.entries(detail.memory ?? {}).map(([key, value]) => [
                  `memory ${key}`,
                  value,
                ]),
              ),
            }}
          />
        </Section>
      )}
      {skills && skills.length > 0 && (
        <Section title="Skills" count={skills.length}>
          <ul className="space-y-2">
            {skills.map((skill) => (
              <li
                key={String(skill.id)}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">
                    {String(skill.name || skill.id)}
                  </span>
                  {skill.hook && (
                    <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-800">
                      {String(skill.hook)}
                    </span>
                  )}
                  {skill.stepCount !== undefined && (
                    <span className="text-[10px] text-slate-500">
                      {String(skill.stepCount)} step
                      {Number(skill.stepCount) === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p className="mt-1 text-xs text-slate-600">
                    {String(skill.description)}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] text-slate-400">
                  {String(skill.id)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {formatters && (
        <Section title="Formatter coverage">
          <KeyValues
            data={{
              personaSpecificTypes: formatters.personaSpecificTypes,
              defaultFallbackTypes: formatters.defaultFallbackTypes,
              defaultOnlyTypes: formatters.defaultOnlyTypes,
              note: formatters.note,
            }}
          />
        </Section>
      )}
      {detail.metadata && Object.keys(detail.metadata).length > 0 && (
        <Section title="Metadata">
          <KeyValues data={detail.metadata} />
        </Section>
      )}
      {isPipeline && detail.trigger && (
        <Section title="Trigger">
          <KeyValues data={detail.trigger} />
        </Section>
      )}
      {isPipeline && detail.inputSchema && (
        <Section title="Launch inputs">
          <InputSchema schema={detail.inputSchema} />
        </Section>
      )}
      {isPipeline && detail.policies && (
        <Section title="Policies">
          <div className="space-y-2">
            {Object.entries(detail.policies).map(([name, policy]) => (
              <div key={name}>
                <p className="mb-1 text-[11px] font-medium text-slate-600">
                  {humanize(name)}
                </p>
                <KeyValues data={policy as Record<string, unknown>} />
              </div>
            ))}
          </div>
        </Section>
      )}
      {isPipeline && detail.safety && (
        <Section title="Safety">
          <KeyValues data={detail.safety} />
        </Section>
      )}
    </>
  );
};

const InputSchema: React.FC<{ schema: Record<string, any> }> = ({ schema }) => {
  const fields: Array<{
    name: string;
    type?: string;
    description?: string;
    required: boolean;
  }> = Array.isArray(schema.fields)
    ? schema.fields.map((field: any) => ({
        name: String(field.name),
        type: field.type,
        description: field.description,
        required: Boolean(field.required),
      }))
    : Object.entries(schema.properties ?? {}).map(
        ([name, property]: [string, any]) => ({
          name,
          type: property.type,
          description: property.description,
          required: (schema.required ?? []).includes(name),
        }),
      );
  if (!fields.length) return <KeyValues data={schema} />;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {fields.map((field) => (
        <li key={field.name} className="px-3 py-2 text-xs">
          <span className="font-mono font-medium">{field.name}</span>
          {field.required && <span className="ml-1 text-rose-600">*</span>}
          {field.type && (
            <span className="ml-2 text-slate-500">{field.type}</span>
          )}
          {field.description && (
            <p className="mt-0.5 text-slate-500">{field.description}</p>
          )}
        </li>
      ))}
    </ul>
  );
};

export const ParameterList: React.FC<{
  params: Array<Record<string, any>>;
}> = ({ params }) => (
  <div className="space-y-2">
    {params.map((param) => {
      const range =
        param.min !== undefined || param.max !== undefined
          ? `${param.min ?? ''}–${param.max ?? ''}`
          : undefined;
      return (
        <div
          key={String(param.id)}
          className="rounded-lg border border-slate-100 bg-white p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold">
              {String(param.label || param.id)}
            </p>
            {param.type && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                {String(param.type)}
              </span>
            )}
            {param.required && (
              <span className="text-[10px] font-semibold text-rose-600">
                Required
              </span>
            )}
          </div>
          {param.description && (
            <p className="mt-1 text-[11px] text-slate-500">
              {String(param.description)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            {param.default !== undefined && `Default ${String(param.default)}`}
            {range && ` · Range ${range}`}
            {param.dependsOn &&
              ` · Shown when ${String(param.dependsOn.param)} is ${String(param.dependsOn.value)}`}
          </p>
        </div>
      );
    })}
  </div>
);
