import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SeededResourceBrowser from './SeededResourceBrowser';
import { agentBuilderService } from '../../services/agentBuilderService';

vi.mock('../../services/agentBuilderService', () => ({
  agentBuilderService: {
    getSeededResources: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentBuilderService.getSeededResources).mockResolvedValue({
    resourceType: 'Bundle',
    type: 'collection',
    total: 1,
    _meta: {
      evalTenantId: 'tenant-1',
      resourceType: 'Observation',
      page: 0,
      pageSize: 50,
      totalPages: 1,
      hasNextPage: false,
    },
    entry: [
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
  it('loads the selected resource type directly for the first page', async () => {
    render(
      <SeededResourceBrowser
        seedJobId="job-1"
        resourceType="Observation"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('1 Observation resources')).toBeTruthy();
    expect(
      agentBuilderService.getSeededResources,
    ).toHaveBeenCalledExactlyOnceWith('job-1', 'Observation', 0, 50);
    expect(screen.getAllByText('Observation/observation-1')).toHaveLength(1);
    expect(screen.queryByText('Patient/patient-1')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('allows retry after a bundle request fails', async () => {
    vi.mocked(agentBuilderService.getSeededResources).mockRejectedValueOnce(
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

  it('uses metadata to navigate pages and displays the overall resource total', async () => {
    vi.mocked(agentBuilderService.getSeededResources).mockImplementation(
      async (_job, _type, page = 0) => ({
        resourceType: 'Bundle',
        type: 'collection',
        total: 100,
        _meta: {
          evalTenantId: 'tenant-1',
          resourceType: 'Observation',
          page,
          pageSize: 50,
          totalPages: 2,
          hasNextPage: page === 0,
        },
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              id: `observation-page-${page}`,
            },
          },
        ],
      }),
    );
    render(
      <SeededResourceBrowser
        seedJobId="job-1"
        resourceType="Observation"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('100 Observation resources')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText('Observation/observation-page-1'),
    ).toBeTruthy();
    expect(agentBuilderService.getSeededResources).toHaveBeenLastCalledWith(
      'job-1',
      'Observation',
      1,
      50,
    );
    expect(screen.queryByText('Observation/observation-page-0')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(
      await screen.findByText('Observation/observation-page-0'),
    ).toBeTruthy();
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
