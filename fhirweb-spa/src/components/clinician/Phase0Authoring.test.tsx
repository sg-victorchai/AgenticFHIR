import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Phase0Authoring, {
  Phase0Progress,
  normalizeProxyReply,
} from './Phase0Authoring';
import { AuthoringStep } from '../../services/agentBuilderService';

afterEach(cleanup);
const questions = Array.from(
  { length: 7 },
  (_, index) => `${index + 1}. Question text ${index + 1}?`,
).join('\n');
const show = (step: NonNullable<AuthoringStep>, busy = false) => {
  const onSubmit = vi.fn(async (_message: string) => {});
  render(
    <Phase0Authoring
      step={step}
      description="Initial outcome"
      lastAssistantMessage={questions}
      busy={busy}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
};

describe('guided intake widgets', () => {
  it('prefills and submits the plain outcome without wrapping it', () => {
    const submit = show('P0_OUTCOME_INTAKE');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Initial outcome',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(submit).toHaveBeenCalledWith('Initial outcome');
  });

  it('accepts one multiline reply and submits it without changing its answers', () => {
    const submit = show('P0_PROXY_QUESTIONS');
    const reply =
      '1. Ask for outcome\n2. Provide a goal\n3. No\n4. Yes\n5. Yes\n6. No\n7. Free form text';
    fireEvent.change(screen.getByRole('textbox'), { target: { value: reply } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit reply' }));
    expect(submit).toHaveBeenCalledWith(reply);
  });

  it('normalizes inline numbered answers and leaves multiline replies intact', () => {
    expect(
      normalizeProxyReply(
        '1. Outcome 2. Goal 3. No 4. Yes 5. Yes 6. No 7. Free form',
      ),
    ).toBe('1. Outcome\n2. Goal\n3. No\n4. Yes\n5. Yes\n6. No\n7. Free form');
    expect(normalizeProxyReply('1. Outcome\n2. Goal\n7. Free form')).toBe(
      '1. Outcome\n2. Goal\n7. Free form',
    );
  });

  it('offers a single free-form textarea instead of individual answer fields', () => {
    show('P0_PROXY_QUESTIONS');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(
      screen.getByText(/Reply in one line or across multiple lines/),
    ).toBeTruthy();
  });

  it('applies the Ocean theme to the guided input and progress indicator', () => {
    render(
      <>
        <Phase0Progress step="P0_PROXY_QUESTIONS" theme="ocean" />
        <Phase0Authoring
          step="P0_PROXY_QUESTIONS"
          description=""
          lastAssistantMessage={questions}
          busy={false}
          theme="ocean"
          onSubmit={vi.fn()}
        />
      </>,
    );
    expect(screen.getByRole('textbox').className).toContain('bg-[#f6eddd]');
    expect(screen.getByLabelText('Guided intake progress').className).toContain(
      'bg-[#ead9bb]',
    );
  });

  it('applies the Savanna palette to guided progress and input controls', () => {
    render(
      <>
        <Phase0Progress step="P0_PROXY_QUESTIONS" theme="savanna" />
        <Phase0Authoring
          step="P0_PROXY_QUESTIONS"
          description=""
          lastAssistantMessage={questions}
          busy={false}
          theme="savanna"
          onSubmit={vi.fn()}
        />
      </>,
    );
    expect(screen.getByRole('textbox').className).toContain('bg-[#f0f4e5]');
    expect(screen.getByLabelText('Guided intake progress').className).toContain(
      'bg-[#e5efda]',
    );
  });

  it('sends exact accept and override commands', () => {
    const submit = show('P0_TYPE_DECISION');
    fireEvent.click(
      screen.getByRole('button', { name: 'Accept recommendation' }),
    );
    expect(submit).toHaveBeenCalledWith('accept');
    fireEvent.click(screen.getByRole('button', { name: 'Override' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'DATA_PIPELINE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm override' }));
    expect(submit).toHaveBeenCalledWith('override:DATA_PIPELINE');
  });

  it('sends yes and no without advancing locally', () => {
    const submit = show('P0_COHORT_CHECK');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(submit.mock.calls.map((call) => call[0])).toEqual(['yes', 'no']);
  });

  it.each([
    ['Fixed workflow', 'fixed-workflow'],
    ['Parameterized', 'parameterized'],
    ['Dynamic agent', 'dynamic-agent'],
  ])('requires a selection and submits %s as %s', (label, value) => {
    const submit = show('P0_AUTHORING_MODE');
    const button = screen.getByRole('button', {
      name: 'Start Authoring',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(`^${label}`) }),
    );
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledWith(value);
  });

  it('uses a four-row cohort textarea and submits plain English', () => {
    const submit = show('P0_COHORT_RECIPE');
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(input.rows).toBe(4);
    fireEvent.change(input, { target: { value: 'Patients aged 45 or older' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(submit).toHaveBeenCalledWith('Patients aged 45 or older');
  });

  it('keeps the typed reply while a retry response streams', () => {
    const props = {
      step: 'P0_PROXY_QUESTIONS' as const,
      description: '',
      busy: false,
      onSubmit: vi.fn(async (_message: string) => {}),
    };
    const { rerender } = render(
      <Phase0Authoring {...props} lastAssistantMessage={questions} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Keep this answer' },
    });
    rerender(
      <Phase0Authoring
        {...props}
        busy
        lastAssistantMessage="Partial response"
      />,
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Keep this answer',
    );
  });

  it('prevents submission while streaming', () => {
    const submit = show('P0_COHORT_CHECK', true);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(submit).not.toHaveBeenCalled();
  });
});
