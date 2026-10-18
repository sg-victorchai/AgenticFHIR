import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentBuilderService } from '../../services/agentBuilderService';
import ScenarioScoringEditor, {
  buildScenarioScoring,
  newScenarioScoring,
  ScenarioScoringDraft,
} from './ScenarioScoringEditor';

afterEach(cleanup);
vi.mock('../../services/agentBuilderService', () => ({
  agentBuilderService: { getSearchParameters: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentBuilderService.getSearchParameters).mockResolvedValue([
    { code: 'code' },
    { code: 'status' },
  ]);
});

const Harness = () => {
  const [value, setValue] = useState(newScenarioScoring);
  return <ScenarioScoringEditor value={value} onChange={setValue} />;
};

describe('scenario scoring', () => {
  it('loads parameters for the selected resource and clears only names when it changes', async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    const parameter = screen.getByRole('combobox', {
      name: 'Search parameter',
    }) as HTMLSelectElement;
    await waitFor(() => expect(parameter.disabled).toBe(false));
    expect(agentBuilderService.getSearchParameters).toHaveBeenCalledWith(
      'Patient',
    );
    fireEvent.change(parameter, { target: { value: 'code' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected value' }), {
      target: { value: '4548-4' },
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Expected data source 1' }),
      { target: { value: 'Observation' } },
    );
    await waitFor(() =>
      expect(agentBuilderService.getSearchParameters).toHaveBeenCalledWith(
        'Observation',
      ),
    );
    await waitFor(() => expect(parameter.disabled).toBe(false));
    expect(parameter.value).toBe('');
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Expected value',
        }) as HTMLInputElement
      ).value,
    ).toBe('4548-4');
    fireEvent.change(parameter, { target: { value: 'code' } });
    expect(parameter.value).toBe('code');
  });

  it('lets users retry a failed parameter lookup', async () => {
    vi.mocked(agentBuilderService.getSearchParameters).mockRejectedValueOnce(
      new Error('Lookup failed'),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('combobox', {
            name: 'Search parameter',
          }) as HTMLSelectElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.getByRole('option', { name: 'code' })).toBeTruthy();
  });

  it('defaults to automatic baseline criteria with no expected queries', () => {
    expect(buildScenarioScoring(newScenarioScoring())).toEqual({
      generateRubric: true,
      expectedQueryPatterns: [],
    });
  });

  it('creates manual criteria and structured hypertension query expectations', () => {
    const draft: ScenarioScoringDraft = {
      generateRubric: false,
      criteria:
        ' States the most recent blood pressure numerically \n\nLists current medications',
      expectedWriteTypes: [],
      queries: [
        { resourceType: 'Patient', filters: [] },
        {
          resourceType: 'Observation',
          filters: [{ name: 'code', value: '85354-9' }],
        },
        {
          resourceType: 'Condition',
          filters: [{ name: 'code', value: '38341003' }],
        },
        { resourceType: 'MedicationRequest', filters: [] },
      ],
    };
    expect(buildScenarioScoring(draft)).toEqual({
      generateRubric: false,
      responseCriteria: [
        'States the most recent blood pressure numerically',
        'Lists current medications',
      ],
      expectedQueryPatterns: [
        { resourceType: 'Patient', expectedParams: {} },
        { resourceType: 'Observation', expectedParams: { code: '85354-9' } },
        { resourceType: 'Condition', expectedParams: { code: '38341003' } },
        { resourceType: 'MedicationRequest', expectedParams: {} },
      ],
    });
  });

  it('serializes expected writes as one gold-bundle entry per unique type', () => {
    expect(
      buildScenarioScoring({
        ...newScenarioScoring(),
        expectedWriteTypes: ['CarePlan', 'MedicationRequest', 'CarePlan'],
      }).expectedWrites,
    ).toEqual({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'CarePlan' } },
        { resource: { resourceType: 'MedicationRequest' } },
      ],
    });
  });

  it('rejects blank manual criteria and incomplete filters', () => {
    expect(() =>
      buildScenarioScoring({ ...newScenarioScoring(), generateRubric: false }),
    ).toThrow('Add at least one');
    expect(() =>
      buildScenarioScoring({
        ...newScenarioScoring(),
        queries: [
          {
            resourceType: 'Observation',
            filters: [{ name: 'code', value: '' }],
          },
        ],
      }),
    ).toThrow('Each query filter');
  });

  it('rejects duplicate search parameters instead of silently overwriting them', () => {
    expect(() =>
      buildScenarioScoring({
        ...newScenarioScoring(),
        queries: [
          {
            resourceType: 'Observation',
            filters: [
              { name: 'code', value: '85354-9' },
              { name: 'code', value: '4548-4' },
            ],
          },
        ],
      }),
    ).toThrow('repeated');
  });

  it('warns inline when a data source repeats code and explains how to fix it', async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    const parameterFields = screen.getAllByRole('combobox', {
      name: 'Search parameter',
    });
    await waitFor(() =>
      expect((parameterFields[0] as HTMLSelectElement).disabled).toBe(false),
    );
    fireEvent.change(parameterFields[0], { target: { value: 'code' } });
    fireEvent.change(
      screen.getAllByRole('textbox', { name: 'Expected value' })[0],
      { target: { value: '4548-4' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    await waitFor(() =>
      expect(
        (
          screen.getAllByRole('combobox', {
            name: 'Search parameter',
          })[1] as HTMLSelectElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Search parameter' })[1],
      { target: { value: 'code' } },
    );
    fireEvent.change(
      screen.getAllByRole('textbox', { name: 'Expected value' })[1],
      { target: { value: '85354-9' } },
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'code is repeated in this data source',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'add another expected data source',
    );
  });

  it('preserves manual criteria when switching rubric mode and shows scoring guidance', () => {
    render(<Harness />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'What should a good response include?',
      }),
      { target: { value: 'Does not invent lab values' } },
    );
    fireEvent.click(checkbox);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Does not invent lab values',
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).required).toBe(
      false,
    );
    fireEvent.click(checkbox);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Does not invent lab values',
    );
    expect(
      screen.getByLabelText('Query correctness guidance').textContent,
    ).toContain('neutral 50%');
    expect(
      screen.getByLabelText('Automatic criteria guidance').textContent,
    ).toContain('800 characters');
  });

  it('submits entered response criteria even with automatic generation enabled', () => {
    expect(
      buildScenarioScoring({
        ...newScenarioScoring(),
        criteria: 'Does not fabricate lab values',
      }),
    ).toEqual({
      generateRubric: true,
      responseCriteria: ['Does not fabricate lab values'],
      expectedQueryPatterns: [],
    });
  });

  it('separates the three inputs and reveals info boxes only when opened', () => {
    render(<Harness />);
    expect(
      screen.getByRole('heading', { name: 'Automatic response baseline' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Response quality criteria' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Query correctness',
      }),
    ).toBeTruthy();
    expect(screen.queryByText('generateRubric')).toBeNull();
    expect(screen.queryByText('responseCriteria')).toBeNull();
    expect(screen.queryByText('expectedQueryPatterns')).toBeNull();
    for (const title of [
      'About automatic criteria',
      'About response quality scoring',
      'About expected data queries',
    ]) {
      const summary = screen.getByText(title);
      const disclosure = summary.parentElement as HTMLDetailsElement;
      expect(disclosure.open).toBe(false);
      fireEvent.click(summary);
      expect(disclosure.open).toBe(true);
    }
    expect(screen.getByRole('textbox').className).toContain('font-normal');
  });

  it('lets users add and remove data sources and filters without JSON', async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('combobox', {
            name: 'Search parameter',
          }) as HTMLSelectElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Search parameter' }),
      { target: { value: 'code' } },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected value' }), {
      target: { value: '85354-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(
      screen.queryByRole('combobox', { name: 'Search parameter' }),
    ).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: 'Expected value' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
