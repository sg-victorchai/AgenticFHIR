import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BusinessRuleManager from './BusinessRuleManager';
import { createBusinessRule } from '../../services/configuredAssetsService';

vi.mock('../../services/configuredAssetsService', () => ({
  createBusinessRule: vi.fn(),
  replaceBusinessRule: vi.fn(),
  deleteBusinessRule: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BusinessRuleManager', () => {
  it('creates a cross-resource rule from the plugin-specific form', async () => {
    vi.mocked(createBusinessRule).mockResolvedValue({} as never);
    const onChanged = vi.fn();
    render(
      <BusinessRuleManager
        resourceType="Encounter"
        rules={[]}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Rule/ }));
    const form = screen.getByRole('form', { name: 'Add business rule' });
    fireEvent.change(within(form).getByLabelText('Plugin type'), {
      target: { value: 'cross-resource-check' },
    });
    fireEvent.change(within(form).getByLabelText('Search query 1'), {
      target: { value: 'Patient?_id={subject.idPart}&active=true' },
    });
    fireEvent.change(within(form).getByLabelText('Check message 1'), {
      target: { value: 'Patient must be active' },
    });
    fireEvent.change(within(form).getByLabelText('Description'), {
      target: { value: 'Require an active patient' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Rule' }));
    await waitFor(() => expect(createBusinessRule).toHaveBeenCalledOnce());
    expect(createBusinessRule).toHaveBeenCalledWith(
      expect.objectContaining({
        targetResourceType: 'Encounter',
        pluginId: 'cross-resource-check',
        properties: {
          checks: [
            {
              query: 'Patient?_id={subject.idPart}&active=true',
              'min-count': 1,
              message: 'Patient must be active',
            },
          ],
        },
      }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
