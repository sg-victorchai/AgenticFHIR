import React, { useMemo } from 'react';
import { DiagnosticReport, Observation, ObservationComponent } from 'fhir/r5';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHINESE_RE = /[\u4e00-\u9fff]/;

const formatDT = (s?: string) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return s;
  }
};

const chineseDisplay = (coding?: Array<{ display?: string }>): string | undefined => {
  for (const c of coding ?? []) {
    if (c.display && CHINESE_RE.test(c.display)) return c.display;
  }
  return undefined;
};

// ─── Unified row derived from either an Observation or an ObservationComponent ─

interface TestRow {
  key: string;
  testName: string;
  chineseName?: string;
  value: string;
  unit: string;
  refRange: string;
  isAbnormal: boolean;
  arrow: string;
}

const makeArrow = (code?: string, abnormal?: boolean): string => {
  if (code === 'H' || code === 'HH') return ' ↑';
  if (code === 'L' || code === 'LL') return ' ↓';
  if (abnormal) return ' !';
  return '';
};

const extractValue = (item: { valueQuantity?: { value?: number; unit?: string; code?: string }; valueString?: string; valueCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> } }): { value: string; unit: string } => {
  if (item.valueQuantity?.value != null) {
    return {
      value: String(item.valueQuantity.value),
      unit: item.valueQuantity.unit || item.valueQuantity.code || '',
    };
  }
  if (item.valueString) return { value: item.valueString, unit: '' };
  if (item.valueCodeableConcept?.text) return { value: item.valueCodeableConcept.text, unit: '' };
  if (item.valueCodeableConcept?.coding?.[0]?.display) return { value: item.valueCodeableConcept.coding[0].display, unit: '' };
  return { value: '—', unit: '' };
};

const extractRefRange = (rr?: Array<{ text?: string; low?: { value?: number }; high?: { value?: number } }>): string => {
  const r = rr?.[0];
  if (!r) return '';
  if (r.text) return r.text;
  if (r.low?.value != null && r.high?.value != null) return `(${r.low.value} - ${r.high.value})`;
  if (r.high?.value != null) return `(< ${r.high.value})`;
  if (r.low?.value != null) return `(> ${r.low.value})`;
  return '';
};

const componentToRow = (comp: ObservationComponent, idx: number): TestRow => {
  const coding = comp.code?.coding;
  const testName = comp.code?.text || coding?.[0]?.display || `Item ${idx + 1}`;
  const chineseName = chineseDisplay(coding);
  const { value, unit } = extractValue(comp as any);
  const refRange = extractRefRange(comp.referenceRange as any);
  const intCode = comp.interpretation?.[0]?.coding?.[0]?.code;
  const isAbnormal = intCode != null && intCode !== 'N' && intCode !== 'normal';
  return {
    key: `comp-${idx}-${testName}`,
    testName,
    chineseName,
    value,
    unit,
    refRange,
    isAbnormal,
    arrow: makeArrow(intCode, isAbnormal),
  };
};

const obsToRow = (obs: Observation): TestRow => {
  const coding = obs.code?.coding;
  const testName = obs.code?.text || coding?.[0]?.display || 'Unknown Test';
  const chineseName = chineseDisplay(coding);
  const { value, unit } = extractValue(obs as any);
  const refRange = extractRefRange(obs.referenceRange as any);
  const intCode = obs.interpretation?.[0]?.coding?.[0]?.code;
  const isAbnormal = intCode != null && intCode !== 'N' && intCode !== 'normal';
  return {
    key: obs.id ?? testName,
    testName,
    chineseName,
    value,
    unit,
    refRange,
    isAbnormal,
    arrow: makeArrow(intCode, isAbnormal),
  };
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DisplayGroup {
  id: string;
  name: string;
  rows: TestRow[];
}

interface Props {
  report: DiagnosticReport;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LabReportModal: React.FC<Props> = ({ report, onClose }) => {
  // Build map of contained Observations keyed by id.
  const containedObsMap = useMemo(() => {
    const map = new Map<string, Observation>();
    for (const r of report.contained ?? []) {
      if (r.resourceType === 'Observation' && r.id) {
        map.set(r.id, r as Observation);
      }
    }
    return map;
  }, [report.contained]);

  // Resolve result[] to contained Observations, preserving order.
  const resultObs = useMemo(() => {
    return (report.result ?? [])
      .map((ref) => {
        const raw = ref.reference ?? '';
        const id = raw.startsWith('#') ? raw.slice(1) : (raw.split('/').pop() ?? '');
        return containedObsMap.get(id);
      })
      .filter((o): o is Observation => o != null);
  }, [report.result, containedObsMap]);

  // Build display groups.
  // Priority: component[] → hasMember[] → direct observation row.
  const groups = useMemo<DisplayGroup[]>(() => {
    const panelGroups: DisplayGroup[] = [];
    const flatRows: TestRow[] = [];

    for (const obs of resultObs) {
      const panelName =
        obs.code?.text || obs.code?.coding?.[0]?.display || 'Results';

      if ((obs.component?.length ?? 0) > 0) {
        // Panel via component[]
        panelGroups.push({
          id: obs.id ?? panelName,
          name: panelName,
          rows: obs.component!.map((c, i) => componentToRow(c, i)),
        });
      } else if ((obs.hasMember?.length ?? 0) > 0) {
        // Panel via hasMember[] → look up children in containedObsMap
        const children = (obs.hasMember ?? [])
          .map((m) => {
            const raw = m.reference ?? '';
            const cid = raw.startsWith('#') ? raw.slice(1) : (raw.split('/').pop() ?? '');
            return containedObsMap.get(cid);
          })
          .filter((o): o is Observation => o != null);
        panelGroups.push({
          id: obs.id ?? panelName,
          name: panelName,
          rows: children.map(obsToRow),
        });
      } else {
        // Direct single-value observation
        flatRows.push(obsToRow(obs));
      }
    }

    const result: DisplayGroup[] = [...panelGroups];
    if (flatRows.length > 0) {
      result.push({ id: 'flat', name: 'Results', rows: flatRows });
    }
    return result;
  }, [resultObs, containedObsMap]);

  const reportTitle =
    report.code?.text || report.code?.coding?.[0]?.display || 'Lab Report';

  const statusCls =
    report.status === 'final' ? 'bg-green-100 text-green-800'
    : report.status === 'preliminary' ? 'bg-yellow-100 text-yellow-800'
    : report.status === 'amended' || report.status === 'corrected' ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">
              {reportTitle}
            </h2>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-1">
              {report.issued && <span>Issued: {formatDT(report.issued)}</span>}
              {report.performer?.[0]?.display && (
                <span>Performer: {report.performer[0].display}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No detailed results found in this report.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600 whitespace-nowrap">
                    {group.name}
                  </h3>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-semibold uppercase tracking-wider">Test</th>
                      <th className="text-right pb-2 font-semibold uppercase tracking-wider pr-6">Result</th>
                      <th className="text-left pb-2 font-semibold uppercase tracking-wider pr-4">Unit</th>
                      <th className="text-left pb-2 font-semibold uppercase tracking-wider">Ref. Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="py-2.5 pr-4">
                          <div className={`font-medium ${row.isAbnormal ? 'text-red-600' : 'text-gray-800'}`}>
                            {row.testName}
                          </div>
                          {row.chineseName && (
                            <div className="text-xs text-gray-400 mt-0.5">{row.chineseName}</div>
                          )}
                        </td>
                        <td className={`py-2.5 pr-6 text-right font-semibold tabular-nums ${row.isAbnormal ? 'text-red-600' : 'text-gray-900'}`}>
                          {row.value}
                          {row.arrow && <span className="text-xs font-bold">{row.arrow}</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-500 text-xs">{row.unit}</td>
                        <td className="py-2.5 text-gray-400 text-xs">{row.refRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}

          {report.conclusion && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Conclusion</p>
              <p className="text-sm text-blue-900 leading-relaxed">{report.conclusion}</p>
            </div>
          )}

          {(report.conclusionCode?.length ?? 0) > 0 && (
            <div className="text-xs text-gray-500">
              <span className="font-medium">Finding codes: </span>
              {report.conclusionCode!
                .map((cc) => cc.coding?.[0]?.display || cc.text)
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusCls}`}>
            {report.status}
          </span>
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabReportModal;
