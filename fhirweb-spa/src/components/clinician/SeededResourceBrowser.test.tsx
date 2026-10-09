import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SeededResourceBrowser from './SeededResourceBrowser';
import { agentBuilderService } from '../../services/agentBuilderService';

vi.mock('../../services/agentBuilderService', () => ({
  agentBuilderService: {
    getSeededPatients: vi.fn(),
    getSeededPatientBundle: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentBuilderService.getSeededPatients).mockResolvedValue({
    seedJobId: 'job-1',
    evalTenantId: 'tenant-1',
    seedStatus: 'COMPLETED',
    patientCount: 2,
    patientIds: ['patient-1', 'patient-2'],
  });
  vi.mocked(agentBuilderService.getSeededPatientBundle).mockResolvedValue({
    resourceType: 'Bundle',
    type: 'collection',
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

describe('SeededResourceBrowser', () => {
  it('loads the selected job and shows only unique resources of the selected type', async () => {
    render(
      <SeededResourceBrowser
        seedJobId="job-1"
        resourceType="Observation"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('1 Observation resources')).toBeTruthy();
    expect(agentBuilderService.getSeededPatients).toHaveBeenCalledWith('job-1');
    expect(agentBuilderService.getSeededPatientBundle).toHaveBeenCalledWith(
      'job-1',
      'patient-1',
    );
    expect(agentBuilderService.getSeededPatientBundle).toHaveBeenCalledWith(
      'job-1',
      'patient-2',
    );
    expect(screen.getAllByText('Observation/observation-1')).toHaveLength(1);
    expect(screen.queryByText('Patient/patient-1')).toBeNull();
  });

  it('allows retry after a bundle request fails', async () => {
    vi.mocked(agentBuilderService.getSeededPatientBundle).mockRejectedValueOnce(
      new Error('Bundle unavailable'),
    );
    render(
      <SeededResourceBrowser
        seedJobId="job-1"
        resourceType="Observation"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('1 Observation resources')).toBeTruthy();
  });

  it('closes the resource inspector', () => {
    const onClose = vi.fn();
    render(
      <SeededResourceBrowser
        seedJobId="job-1"
        resourceType="Patient"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
