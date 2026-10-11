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
    listEvalRunsForSeedJob: vi.fn(),
    getScenario: vi.fn(),
    getEval: vi.fn(),
    getSeededPatients: vi.fn(),
    getSeededPatientBundle: vi.fn(),
    seedScenario: vi.fn(),
    teardown: vi.fn(),
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
  vi.mocked(agentBuilderService.listEvalRunsForSeedJob).mockResolvedValue([]);
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
  vi.mocked(agentBuilderService.getEval).mockImplementation(async (runId) => ({
    runId,
    personaId: 'persona-1',
    personaVersion: '1',
    runStatus: 'COMPLETED',
    evalTenantId: 'saved-tenant',
    qualityScore: 1,
    personaResponse: 'Created two care plans.',
    simulatedQuestion: 'Review this patient.',
  }));
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
    vi.mocked(agentBuilderService.listEvalRunsForSeedJob).mockResolvedValue([
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

  it('loads seed-scoped run history and opens the full run detail', async () => {
    vi.mocked(agentBuilderService.listEvalRunsForSeedJob).mockResolvedValue([
      {
        runId: 'run-new',
        personaId: 'persona-1',
        personaVersion: '1',
        runStatus: 'COMPLETED',
        evalTenantId: 'saved-tenant',
        qualityScore: 1,
        createdAt: '2026-10-11T12:00:00Z',
      },
      {
        runId: 'run-old',
        personaId: 'persona-1',
        personaVersion: '1',
        runStatus: 'FAILED',
        evalTenantId: 'saved-tenant',
        qualityScore: 0.4,
        createdAt: '2026-10-10T12:00:00Z',
      },
    ]);
    vi.mocked(agentBuilderService.getEval).mockResolvedValue({
      runId: 'run-new',
      personaId: 'persona-1',
      personaVersion: '1',
      runStatus: 'COMPLETED',
      evalTenantId: 'saved-tenant',
      qualityScore: 1,
      personaResponse: 'Created two care plans.',
      simulatedQuestion: 'Review this patient.',
    });
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(await screen.findByText('Run History')).toBeTruthy();
    expect(agentBuilderService.listEvalRunsForSeedJob).toHaveBeenCalledWith(
      'completed-job',
    );
    expect(screen.getByText('100/100')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);
    expect(await screen.findByText('Created two care plans.')).toBeTruthy();
    expect(screen.getByText('Review this patient.')).toBeTruthy();
    expect(
      screen
        .getByTestId('seed-run-row-run-new')
        .contains(screen.getByText('Evaluation run details')),
    ).toBe(true);
    expect(
      screen
        .getByTestId('seed-run-row-run-new')
        .contains(
          screen.getByText('Evaluation run details').closest('section'),
        ),
    ).toBe(true);
  });

  it('loads scenario scoring and cohort details on request', async () => {
    vi.mocked(agentBuilderService.getScenario).mockResolvedValue({
      ...scenario,
      seedSpec: {
        description: 'Hypertension cohort',
        cohortGroups: [{ label: 'Uncontrolled', count: 5 }],
      },
      conversationScript: [{ role: 'user', content: 'Review the patient.' }],
      responseCriteria: ['States the latest blood pressure'],
      expectedQueryPatterns: [
        { resourceType: 'Observation', expectedParams: { code: '8480-6' } },
      ],
    });
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'View scenario details' }),
    );
    expect(await screen.findByText('Scenario definition')).toBeTruthy();
    expect(screen.getByText('Seed specification')).toBeTruthy();
    expect(screen.getByText('Conversation script')).toBeTruthy();
    expect(screen.getByText('Response criteria')).toBeTruthy();
    expect(screen.getByText('Expected query patterns')).toBeTruthy();
  });

  it('requires viewing a completed run before teardown and marks the job torn down', async () => {
    vi.mocked(agentBuilderService.listEvalRunsForSeedJob).mockResolvedValue([
      {
        runId: 'run-new',
        personaId: 'persona-1',
        personaVersion: '1',
        runStatus: 'COMPLETED',
        evalTenantId: 'saved-tenant',
        qualityScore: 0.8,
      },
    ]);
    vi.mocked(agentBuilderService.getEval).mockResolvedValue({
      runId: 'run-new',
      personaId: 'persona-1',
      personaVersion: '1',
      runStatus: 'COMPLETED',
      evalTenantId: 'saved-tenant',
      qualityScore: 0.8,
    });
    render(
      <PreviousEvalData
        personaId="persona-1"
        refreshKey=""
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      (
        (await screen.findByRole('button', {
          name: 'Tear down sandbox',
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await screen.findByText('Evaluation run details');
    fireEvent.click(screen.getByRole('button', { name: 'Tear down sandbox' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('alertdialog').querySelector('button:last-child')!,
    );
    await waitFor(() =>
      expect(agentBuilderService.teardown).toHaveBeenCalledWith('saved-tenant'),
    );
    expect(screen.getByText('Sandbox data removed')).toBeTruthy();
  });
});
