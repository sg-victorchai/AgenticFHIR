import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreviousEvalData from './PreviousEvalData';
import { agentBuilderService } from '../../services/agentBuilderService';

vi.mock('../../services/agentBuilderService', () => ({
  agentBuilderService: {
    listScenarios: vi.fn(),
    listSeedJobs: vi.fn(),
    listEvalRuns: vi.fn(),
    getScenario: vi.fn(),
    getSeededPatients: vi.fn(),
    getSeededPatientBundle: vi.fn(),
    seedScenario: vi.fn(),
  },
}));

const scenario = {
  scenarioId: 'scenario-1',
  personaId: 'persona-1',
  scenarioName: 'Care cohort',
  scenarioType: 'AGENT',
};
const completed = {
  seedJobId: 'completed-job',
  evalTenantId: 'saved-tenant',
  seedStatus: 'COMPLETED',
  patientCount: 2,
  seededCounts: { Patient: 2, Observation: 1 },
  createdAt: '2026-10-01T12:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentBuilderService.listScenarios).mockResolvedValue([scenario]);
  vi.mocked(agentBuilderService.listEvalRuns).mockResolvedValue([]);
  vi.mocked(agentBuilderService.listSeedJobs).mockResolvedValue([
    {
      ...completed,
      seedJobId: 'failed-job',
      seedStatus: 'FAILED',
      createdAt: '2026-10-02T12:00:00Z',
    },
    completed,
  ]);
  vi.mocked(agentBuilderService.getScenario).mockResolvedValue(scenario);
  vi.mocked(agentBuilderService.getSeededPatients).mockResolvedValue({
    ...completed,
    patientIds: ['patient-1', 'patient-2'],
  });
  vi.mocked(agentBuilderService.getSeededPatientBundle).mockResolvedValue({
    resourceType: 'Bundle',
    type: 'collection',
    total: 2,
    entry: [
      { resource: { resourceType: 'Patient', id: 'patient-1' } },
      {
        resource: {
          resourceType: 'Observation',
          id: 'observation-1',
          valueQuantity: { value: 7.5 },
        },
      },
    ],
  });
});
afterEach(cleanup);

describe('PreviousEvalData', () => {
  it('keeps evaluated data browsable while disabling another submission', async () => {
    vi.mocked(agentBuilderService.listEvalRuns).mockResolvedValue([
      {
        runId: 'existing-run',
        personaId: 'persona-1',
        personaVersion: '1',
        runStatus: 'COMPLETED',
        evalTenantId: 'saved-tenant',
      },
    ]);
    const onSubmit = vi.fn();
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    const submit = await screen.findByRole('button', {
      name: 'Already evaluated',
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Browse Patients',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('chooses the latest completed job and submits its existing tenant without reseeding', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    await waitFor(() =>
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(
        'completed-job',
      ),
    );
    expect(screen.getByText('saved-tenant')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Eval' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(scenario, completed),
    );
    expect(agentBuilderService.seedScenario).not.toHaveBeenCalled();
  });

  it('browses patients and groups their bundle resources by type', async () => {
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    await screen.findByRole('button', { name: 'Browse Patients' });
    fireEvent.click(screen.getByRole('button', { name: 'Browse Patients' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'View patient patient-1' }),
    );
    expect(await screen.findByText('Observation (1)')).toBeTruthy();
    expect(agentBuilderService.getSeededPatients).toHaveBeenCalledWith(
      'completed-job',
    );
    expect(agentBuilderService.getSeededPatientBundle).toHaveBeenCalledWith(
      'completed-job',
      'patient-1',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Patient List' }),
    );
    expect(
      screen.getByRole('button', { name: 'View patient patient-2' }),
    ).toBeTruthy();
  });

  it('disables browse and evaluation actions for failed jobs', async () => {
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'failed-job' },
    });
    expect(
      (screen.getByRole('button', { name: 'Submit Eval' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Browse Patients',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('shows load failures and allows retry', async () => {
    vi.mocked(agentBuilderService.listSeedJobs).mockRejectedValueOnce(
      new Error('History unavailable'),
    );
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh seed jobs' }));
    expect(await screen.findByRole('combobox')).toBeTruthy();
  });
});
