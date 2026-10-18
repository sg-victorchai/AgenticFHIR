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

const renderEditor = (initialGroup = newCohortGroup()) => {
  const onChange = vi.fn();
  const StatefulEditor = () => {
    const [groups, setGroups] = React.useState([initialGroup]);
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

  it('serializes optional patient demographics and omits an empty profile', () => {
    const baseGroup = {
      ...newCohortGroup(),
      label: 'Older female patients',
      count: 4,
    };
    expect(buildCohortGroups([baseGroup])[0]).not.toHaveProperty(
      'patientProfile',
    );

    expect(
      buildCohortGroups([
        {
          ...baseGroup,
          patientProfile: {
            ...baseGroup.patientProfile,
            minAge: '65',
            gender: 'female',
            city: 'Singapore',
            country: 'SG',
          },
        },
      ])[0],
    ).toMatchObject({
      patientProfile: {
        minAge: 65,
        gender: 'female',
        city: 'Singapore',
        country: 'SG',
      },
    });
  });

  it('validates demographic age bounds', () => {
    const group = {
      ...newCohortGroup(),
      label: 'Invalid ages',
      patientProfile: {
        ...newCohortGroup().patientProfile,
        minAge: '70',
        maxAge: '60',
      },
    };
    expect(() => buildCohortGroups([group])).toThrow(
      /Maximum patient age must be at least the minimum age/,
    );
  });

  it('serializes decimal and percent observation results as numeric values with units', () => {
    const group = {
      ...newCohortGroup(),
      label: 'HbA1c results',
      observationConstraints: [
        {
          loincCode: '4548-4',
          daysBack: 180,
          comparator: 'gt',
          value: '5.7%',
          unit: '',
        },
        {
          loincCode: '718-7',
          daysBack: 90,
          comparator: 'le',
          value: '12.25',
          unit: 'g/dL',
        },
      ],
    };

    expect(buildCohortGroups([group])[0]).toMatchObject({
      observationConstraints: [
        {
          loincCode: '4548-4',
          daysBack: 180,
          comparator: 'gt',
          value: 5.7,
          unit: '%',
        },
        {
          loincCode: '718-7',
          daysBack: 90,
          comparator: 'le',
          value: 12.25,
          unit: 'g/dL',
        },
      ],
    });
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
    const option = await screen.findByRole('option', {
      name: /Metoprolol 50 MG Oral Tablet.*866427/,
    });
    const pointerDown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(option, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireEvent.click(option);
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
    const manualOption = await screen.findByRole('button', {
      name: /Use entered code/,
    });
    const pointerDown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(manualOption, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireEvent.click(manualOption);
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Condition codes for group 1',
        }) as HTMLInputElement
      ).value,
    ).toBe('');
    expect(
      screen.getByRole('button', { name: 'Remove condition code hypert' }),
    ).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ conditionCodes: 'hypert' }),
    ]);
  });

  it('preserves focus on touch pointer-down and selects a condition result', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([
      {
        displayName: 'Diabetes',
        codes: [
          {
            system: 'http://snomed.info/sct',
            code: '73211009',
            display: 'Diabetes mellitus',
          },
        ],
      },
    ]);
    const { onChange } = renderEditor();
    const input = screen.getByRole('textbox', {
      name: 'Condition codes for group 1',
    });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'diabetes' } });
    const option = await screen.findByRole('option', {
      name: /Diabetes mellitus.*73211009/,
    });
    const pointerDown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(option, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireEvent.click(option);
    expect(
      screen.getByRole('button', { name: 'Remove condition code 73211009' }),
    ).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ conditionCodes: '73211009' }),
    ]);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('adds another condition without enclosing chip or option buttons in a label', async () => {
    vi.mocked(agentBuilderService.searchTerminology).mockResolvedValue([
      {
        codes: [
          {
            system: 'http://snomed.info/sct',
            code: '38341003',
            display: 'Hypertension',
          },
        ],
      },
    ]);
    const { onChange } = renderEditor({
      ...newCohortGroup(),
      conditionCodes: '73211009',
    });
    const input = screen.getByRole('textbox', {
      name: 'Condition codes for group 1',
    });
    expect(input.closest('label')).toBeNull();
    fireEvent.change(input, { target: { value: 'hypertension' } });
    const option = await screen.findByRole('option', {
      name: /Hypertension.*38341003/,
    });
    expect(option.closest('label')).toBeNull();
    fireEvent.pointerDown(option, { pointerType: 'touch' });
    fireEvent.click(option);
    expect(
      screen.getByRole('button', { name: 'Remove condition code 73211009' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove condition code 38341003' }),
    ).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ conditionCodes: '73211009, 38341003' }),
    ]);
  });

  it.each([
    [
      'lab',
      '+ Add lab criterion',
      'Lab test code for group 1, criterion 1',
      '4548-4',
    ],
    [
      'medication',
      '+ Add medication criteria',
      'Medication code for group 1, medication 1',
      '866427',
    ],
  ])(
    'keeps the %s code visible after blur and refocus and permits editing',
    (_kind, addLabel, inputLabel, code) => {
      renderEditor();
      fireEvent.click(screen.getByRole('button', { name: addLabel }));
      const input = screen.getByRole('textbox', {
        name: inputLabel,
      }) as HTMLInputElement;
      expect(input.closest('label')).toBeNull();
      fireEvent.change(input, { target: { value: code } });
      fireEvent.blur(input);
      expect(input.value).toBe(code);
      fireEvent.focus(input);
      expect(input.value).toBe(code);
      fireEvent.change(input, { target: { value: 'replacement' } });
      fireEvent.blur(input);
      fireEvent.focus(input);
      expect(input.value).toBe('replacement');
    },
  );

  it('removes one selected condition code without clearing the others', () => {
    const { onChange } = renderEditor({
      ...newCohortGroup(),
      conditionCodes: '73211009, 254637007',
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove condition code 73211009',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ conditionCodes: '254637007' }),
    ]);
    expect(
      screen.queryByRole('button', {
        name: 'Remove condition code 73211009',
      }),
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Remove condition code 254637007',
      }),
    ).toBeTruthy();
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
    const option = await screen.findByRole('option', {
      name: /Hemoglobin A1c.*4548-4/,
    });
    const pointerDown = new Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
    fireEvent(option, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);
    fireEvent.click(option);
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Lab test code for group 1, criterion 1',
        }) as HTMLInputElement
      ).value,
    ).toBe('4548-4');
    expect(screen.queryByRole('listbox')).toBeNull();
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

  it('opens tenant code entry in a labeled dialog that can be dismissed', () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add tenant Condition code' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Add tenant code' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('System URI')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close terminology form' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
