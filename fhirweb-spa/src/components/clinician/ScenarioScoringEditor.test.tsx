import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ScenarioScoringEditor, {
  buildScenarioScoring,
  newScenarioScoring,
  ScenarioScoringDraft,
} from './ScenarioScoringEditor';

afterEach(cleanup);

const Harness = () => {
  const [value, setValue] = useState(newScenarioScoring);
  return <ScenarioScoringEditor value={value} onChange={setValue} />;
};

describe('scenario scoring', () => {
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

  it('warns inline when a data source repeats code and explains how to fix it', () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    const parameterFields = screen.getAllByRole('textbox', {
      name: 'Search parameter',
    });
    fireEvent.change(parameterFields[0], { target: { value: 'code' } });
    fireEvent.change(
      screen.getAllByRole('textbox', { name: 'Expected value' })[0],
      { target: { value: '4548-4' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    fireEvent.change(
      screen.getAllByRole('textbox', { name: 'Search parameter' })[1],
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
      screen.getByRole('heading', { name: '1. Auto-generated baseline' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: '2. What makes a good response?' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: '3. Did the agent query the right data?',
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

  it('lets users add and remove data sources and filters without JSON', () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Add expected data source' }),
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add query filter' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search parameter' }),
      { target: { value: 'code' } },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Expected value' }), {
      target: { value: '85354-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
    expect(
      screen.queryByRole('textbox', { name: 'Search parameter' }),
    ).toBeNull();
    expect(
      screen.queryByRole('textbox', { name: 'Expected value' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove data source' }));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
