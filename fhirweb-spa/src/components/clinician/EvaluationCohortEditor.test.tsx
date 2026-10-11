import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvaluationCohortEditor, {
  buildCohortGroups,
  newCohortGroup,
} from './EvaluationCohortEditor';
import { agentBuilderService } from '../../services/agentBuilderService';

vi.mock('../../services/agentBuilderService', () => ({
  agentBuilderService: { searchTerminology: vi.fn() },
}));

const renderEditor = () => {
  const onChange = vi.fn();
  const StatefulEditor = () => {
    const [groups, setGroups] = React.useState([newCohortGroup()]);
    return (
      <EvaluationCohortEditor
        groups={groups}
        onChange={(next) => {
          onChange(next);
          setGroups(next);
        }}
      />
    );
  };
  const result = render(<StatefulEditor />);
  return { ...result, onChange };
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.resetAllMocks());

describe('EvaluationCohortEditor medication and terminology', () => {
  it('includes medication requests in seed groups and validates code and lookback', () => {
    const group = {
      ...newCohortGroup(),
      label: 'Hypertension',
      medicationRequests: [
        { medicationCode: ' 866427 ', status: 'active', daysBack: 180 },
      ],
    };
    expect(buildCohortGroups([group])[0]).toMatchObject({
      medicationRequests: [
        { medicationCode: '866427', status: 'active', daysBack: 180 },
      ],
    });
    expect(() =>
      buildCohortGroups([
        {
          ...group,
          medicationRequests: [
            { ...group.medicationRequests[0], medicationCode: '' },
          ],
        },
      ]),
    ).toThrow(/Each medication needs a code/);
    expect(() =>
      buildCohortGroups([
        {
          ...group,
          medicationRequests: [{ ...group.medicationRequests[0], daysBack: 0 }],
        },
      ]),
    ).toThrow(/positive lookback/);
  });

  it('adds medication criteria on request with RxNorm search, status and lookback controls', () => {
    const { onChange } = renderEditor();
    expect(
      screen.queryByPlaceholderText('Search medication or enter RxNorm code'),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add medication criteria' }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          medicationRequests: [
            { medicationCode: '', status: 'active', daysBack: 180 },
          ],
        }),
      ]),
    );
    expect(
      screen.getByPlaceholderText('Search medication or enter RxNorm code'),
    ).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Order status' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove criterion' }),
    ).toBeTruthy();
  });

  it('searches medications by name and supports direct RxNorm code entry', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([]);
    const { onChange } = renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add medication criteria' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Medication code for group 1, medication 1',
      }),
      { target: { value: 'metoprolol' } },
    );
    await waitFor(
      () =>
        expect(agentBuilderService.searchTerminology).toHaveBeenCalledWith(
          'metoprolol',
          'MedicationRequest',
        ),
      { timeout: 1000 },
    );
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Medication code for group 1, medication 1',
      }),
      { target: { value: '866427' } },
    );
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Medication code for group 1, medication 1',
        }) as HTMLInputElement
      ).value,
    ).toBe('866427');
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        medicationRequests: [
          expect.objectContaining({ medicationCode: '866427' }),
        ],
      }),
    ]);
  });

  it('keeps a selected medication terminology code in its input without reopening results', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([
      {
        displayName: 'Metoprolol',
        codes: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '866427',
            display: 'Metoprolol 50 MG Oral Tablet',
          },
        ],
      },
    ]);
    const { onChange } = renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add medication criteria' }),
    );
    const input = screen.getByRole('textbox', {
      name: 'Medication code for group 1, medication 1',
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'metoprolol' } });
    fireEvent.click(
      await screen.findByRole('option', {
        name: /Metoprolol 50 MG Oral Tablet.*866427/,
      }),
    );
    expect(input.value).toBe('866427');
    expect(
      screen.queryByRole('listbox', {
        name: 'Medication code for group 1, medication 1 search results',
      }),
    ).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        medicationRequests: [
          expect.objectContaining({ medicationCode: '866427' }),
        ],
      }),
    ]);
    expect(agentBuilderService.searchTerminology).toHaveBeenCalledWith(
      'metoprolol',
      'MedicationRequest',
    );
    expect(agentBuilderService.searchTerminology).toHaveBeenCalledTimes(1);
  });

  it('searches conditions and allows adding a code manually if no terminology match exists', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([]);
    const { onChange } = renderEditor();
    const input = screen.getByRole('textbox', {
      name: 'Condition codes for group 1',
    });
    fireEvent.change(input, { target: { value: 'hypert' } });
    expect(await screen.findByRole('status')).toBeTruthy();
    await waitFor(
      () =>
        expect(agentBuilderService.searchTerminology).toHaveBeenCalledWith(
          'hypert',
          'Condition',
        ),
      { timeout: 1000 },
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Use entered code/ }),
    );
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Condition codes for group 1',
        }) as HTMLInputElement
      ).value,
    ).toBe('hypert');
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ conditionCodes: 'hypert' }),
    ]);
  });

  it('uses selected terminology code and display for lab tests', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([
      {
        displayName: 'Hemoglobin A1c',
        codes: [
          {
            system: 'http://loinc.org',
            code: '4548-4',
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
          },
        ],
      },
    ]);
    const { onChange } = renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add lab criterion' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Lab test code for group 1, criterion 1',
      }),
      { target: { value: '4548' } },
    );
    fireEvent.click(
      await screen.findByRole('option', { name: /Hemoglobin A1c.*4548-4/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        observationConstraints: [
          expect.objectContaining({ loincCode: '4548-4' }),
        ],
      }),
    ]);
    expect(agentBuilderService.searchTerminology).toHaveBeenCalledWith(
      '4548',
      'Observation',
    );
  });
});
