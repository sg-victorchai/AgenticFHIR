import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventTriggerManager from './EventTriggerManager';
import {
  createEventTrigger,
  listEventTriggers,
} from '../../services/configuredAssetsService';

vi.mock('../../services/configuredAssetsService', () => ({
  createEventTrigger: vi.fn(),
  deleteEventTrigger: vi.fn(),
  listEventTriggers: vi.fn(),
  replaceEventTrigger: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EventTriggerManager', () => {
  it('creates a persona-mission trigger using the global trigger endpoint contract', async () => {
    vi.mocked(listEventTriggers).mockResolvedValue([]);
    vi.mocked(createEventTrigger).mockResolvedValue({} as never);
    const onChanged = vi.fn();
    render(
      <EventTriggerManager resourceType="Encounter" onChanged={onChanged} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Add Trigger/ }));
    const form = screen.getByRole('form', { name: 'Add event trigger' });
    fireEvent.change(within(form).getByLabelText('Trigger ID'), {
      target: { value: 'encounter-care-review' },
    });
    fireEvent.change(within(form).getByLabelText('Persona ID'), {
      target: { value: 'care-coordinator' },
    });
    fireEvent.change(within(form).getByLabelText('Goal template'), {
      target: { value: 'Review {{scopeRef}} from {{topicId}}' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Trigger' }));
    await waitFor(() => expect(createEventTrigger).toHaveBeenCalledOnce());
    expect(createEventTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerId: 'encounter-care-review',
        topicRef: 'encounter-arrived',
        resourceType: 'Encounter',
        actionType: 'persona-mission',
        actionConfig: {
          personaId: 'care-coordinator',
          goalTemplate: 'Review {{scopeRef}} from {{topicId}}',
        },
      }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
