import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentBuilderService } from '../services/agentBuilderService';
import { buildCohortGroups } from '../components/clinician/EvaluationCohortEditor';
import { ScoreExplanation } from '../components/clinician/EvalRunInsights';
import AgentBuilderPage, {
  LifecycleProgress,
  PersonaDrawer,
  qualityScoreToPercent,
  scenarioSeedGroups,
  sessionDisplayName,
} from './AgentBuilderPage';

vi.mock('../services/agentBuilderService', () => {
  const personas = ['First persona', 'Second persona'].map((name, index) => ({
    personaId: `persona-${index}`,
    name,
    version: '1',
    personaType: 'AGENT',
    authoringSource: 'portal',
    lifecycleState: 'UAT_TRAINING',
  }));
  return {
    agentBuilderService: {
      listPersonas: vi.fn(async () => personas),
      listMine: vi.fn(async () => personas),
      fork: vi.fn(async () => ({ newVersion: 'v1-exp-1' })),
      listSessions: vi.fn(async () => []),
      getModels: vi.fn(async () => ({
        provider: 'test',
        defaultModelId: 'test',
        models: [],
      })),
      getPersona: vi.fn(async (id: string) =>
        personas.find((persona) => persona.personaId === id),
      ),
      listScenarios: vi.fn(async () => []),
      listEvalRuns: vi.fn(async () => []),
      listEvalRunsForSeedJob: vi.fn(async () => []),
      getEval: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

const openScenarioDraft = async () => {
  await screen.findByText('First persona');
  fireEvent.click(screen.getAllByRole('button', { name: 'Evaluations' })[0]);
  fireEvent.click(
    screen.getAllByRole('button', {
      name: /Open evaluations & previous data/,
    })[0],
  );
  await screen.findByText('Previous Eval Data');
  fireEvent.click(
    screen.getByRole('button', { name: 'Draft new test scenario' }),
  );
  await waitFor(() =>
    expect(screen.queryByText('Loading agent test settings...')).toBeNull(),
  );
};

describe('evaluation navigation', () => {
  it('resizes the persona description with pointer dragging and keyboard arrows', () => {
    render(
      <PersonaDrawer
        persona={{
          personaId: 'persona-1',
          version: 'v1',
          name: 'Test persona',
          personaType: 'AGENT',
          authoringSource: 'portal',
          lifecycleState: 'UAT_TRAINING',
        }}
        detail={null}
        loading={false}
        busy={false}
        onClose={vi.fn()}
        onAdapt={vi.fn()}
        onFork={vi.fn()}
        onSaveSystemPrompt={vi.fn(async () => undefined)}
        onEvaluate={vi.fn()}
        onLifecycle={vi.fn()}
      />,
    );
    const handle = screen.getByRole('separator', {
      name: 'Resize persona description panel',
    });
    const header = handle.previousElementSibling as HTMLDivElement;
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({
      height: 240,
    } as DOMRect);
    Object.defineProperty(handle, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(handle, 'hasPointerCapture', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(handle, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientY: { value: clientY },
        button: { value: 0 },
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      fireEvent(handle, event);
    };
    pointer('pointerdown', 240);
    pointer('pointermove', 140);
    pointer('pointerup', 140);
    expect(header.style.height).toBe('140px');
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(header.style.height).toBe('164px');
    pointer('pointerdown', 240);
    pointer('pointermove', -500);
    expect(header.style.height).toBe('80px');
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeTruthy();
  });

  it.each([
    ['platform', true],
    ['portal', false],
  ] as const)(
    'disables system prompt editing for %s personas',
    (authoringSource, disabled) => {
      render(
        <PersonaDrawer
          persona={{
            personaId: 'persona-1',
            version: 'v1',
            name: 'Test persona',
            personaType: 'AGENT',
            authoringSource,
            lifecycleState: 'UAT_TRAINING',
          }}
          detail={{
            personaId: 'persona-1',
            version: 'v1',
            name: 'Test persona',
            personaType: 'AGENT',
            authoringSource,
            lifecycleState: 'UAT_TRAINING',
            systemPrompt: 'Example prompt',
          }}
          loading={false}
          busy={false}
          onClose={vi.fn()}
          onAdapt={vi.fn()}
          onFork={vi.fn()}
          onSaveSystemPrompt={vi.fn(async () => undefined)}
          onEvaluate={vi.fn()}
          onLifecycle={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'Edit' }).hasAttribute('disabled'),
      ).toBe(disabled);
    },
  );

  it('shows only the current lifecycle state until expanded', () => {
    render(<LifecycleProgress state="UAT_TRAINING" />);
    const summary = screen.getByText('Current state: Sandbox evaluation');
    const disclosure = summary.closest('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    expect(screen.getByText('1. Author review')).toBeTruthy();
    fireEvent.click(summary);
    expect(disclosure.open).toBe(false);
  });

  it('preserves explanation text and adds query separator wrap opportunities', () => {
    const text =
      'Observation?code=http://loinc.org|4548-4&status=final — fully matched';
    const { container } = render(<ScoreExplanation text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('wbr').length).toBeGreaterThan(0);
    expect(container.querySelector('p')?.className).toContain('break-normal');
    expect(container.querySelector('p')?.className).not.toContain('break-all');
  });

  it.each([
    [45, 75],
    [0, 10],
  ])(
    'round-trips saved numeric age bounds %s to %s when revising a scenario',
    (minAge, maxAge) => {
      const groups = scenarioSeedGroups({
        scenarioId: 'saved-scenario',
        scenarioName: 'Saved cohort',
        scenarioType: 'AGENT',
        seedSpec: {
          cohortGroups: [
            {
              label: 'Age cohort',
              count: 2,
              patientProfile: { minAge, maxAge },
            },
          ],
        },
      });
      expect(groups[0].patientProfile.minAge).toBe(String(minAge));
      expect(groups[0].patientProfile.maxAge).toBe(String(maxAge));
      expect(buildCohortGroups(groups)[0]).toEqual(
        expect.objectContaining({
          patientProfile: { minAge, maxAge },
        }),
      );
      const recoveredGroups = JSON.parse(JSON.stringify(groups));
      recoveredGroups[0].patientProfile.minAge = minAge;
      recoveredGroups[0].patientProfile.maxAge = maxAge;
      expect(buildCohortGroups(recoveredGroups)[0]).toEqual(
        expect.objectContaining({
          patientProfile: { minAge, maxAge },
        }),
      );
    },
  );

  it('keeps the edited draft when browser Back is cancelled', async () => {
    window.history.replaceState({ idx: 1 }, '', '/agentbuilder');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const go = vi
      .spyOn(window.history, 'go')
      .mockImplementation(() => undefined);
    render(
      <BrowserRouter>
        <AgentBuilderPage />
      </BrowserRouter>,
    );
    await openScenarioDraft();
    fireEvent.change(screen.getByLabelText('Evaluation name'), {
      target: { value: 'Keep after Back' },
    });
    window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 0 } }));
    expect(confirm).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith(1);
    expect(
      (screen.getByLabelText('Evaluation name') as HTMLInputElement).value,
    ).toBe('Keep after Back');
  });

  it('offers continue editing or discard before leaving an edited scenario', async () => {
    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    await openScenarioDraft();
    fireEvent.change(screen.getByLabelText('Evaluation name'), {
      target: { value: 'Unsaved cohort test' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluations' })[0]);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(
      (screen.getByLabelText('Evaluation name') as HTMLInputElement).value,
    ).toBe('Unsaved cohort test');
    fireEvent.click(screen.getByRole('button', { name: 'Exit portal' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('New scenario · First persona')).toBeNull();
    expect(
      sessionStorage.getItem('agentbuilder:scenario-draft:default'),
    ).toBeNull();
    expect(
      localStorage.getItem('agentbuilder:scenario-draft:default'),
    ).toBeNull();
  });

  it('warns on reload only after the draft has changed', async () => {
    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    await openScenarioDraft();
    const unchanged = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unchanged);
    expect(unchanged.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText('Evaluation name'), {
      target: { value: 'Keep this test' },
    });
    const changed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(changed);
    expect(changed.defaultPrevented).toBe(true);
  });

  it('recovers unsaved scenario fields after mobile backgrounding and session loss', async () => {
    const first = render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    await openScenarioDraft();
    fireEvent.change(screen.getByLabelText('Evaluation name'), {
      target: { value: 'Recovered cohort test' },
    });
    fireEvent.change(screen.getByLabelText('Test patient population'), {
      target: { value: 'Ten synthetic diabetic patients' },
    });
    fireEvent.change(
      screen.getByLabelText('What should a good response include?'),
      {
        target: { value: 'Identify patients missing HbA1c screening' },
      },
    );
    localStorage.removeItem('agentbuilder:scenario-draft:default');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(
      localStorage.getItem('agentbuilder:scenario-draft:default'),
    ).toBeTruthy();
    window.dispatchEvent(new Event('pagehide'));
    expect(
      localStorage.getItem('agentbuilder:scenario-draft:default'),
    ).toBeTruthy();
    first.unmount();
    sessionStorage.clear();
    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
    await waitFor(() =>
      expect(screen.queryByText('Loading agent test settings...')).toBeNull(),
    );
    expect(
      (screen.getByLabelText('Evaluation name') as HTMLInputElement).value,
    ).toBe('Recovered cohort test');
    expect(
      (screen.getByLabelText('Test patient population') as HTMLTextAreaElement)
        .value,
    ).toBe('Ten synthetic diabetic patients');
    expect(
      (
        screen.getByLabelText(
          'What should a good response include?',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe('Identify patients missing HbA1c screening');
  });

  it('uses the session persona name or derives a title from its description', () => {
    const session = {
      session_id: 'session-1',
      authoring_mode: 'FROM_SCRATCH',
      persona_type: 'AGENT',
      status: 'IN_PROGRESS',
      current_phase: 0,
      created_at: '',
      updated_at: '',
      description:
        'hypertension care management to identify candidate patients and recommend intervention plans',
    };

    expect(sessionDisplayName(session)).toBe('Hypertension care management');
    expect(
      sessionDisplayName({ ...session, persona_name: 'Hypertension Coach' }),
    ).toBe('Hypertension Coach');
    expect(sessionDisplayName({ ...session, description: '  ' })).toBe(
      'Untitled persona',
    );
  });

  it.each([
    [1, 100],
    [0.4, 40],
    [0.125, 12.5],
    [100, 100],
    [undefined, undefined],
  ])('normalizes backend quality score %s to %s percent', (score, expected) => {
    expect(qualityScoreToPercent(score)).toBe(expected);
  });
  it('opens on cards and confines seed history and drafting to selected-persona details', async () => {
    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    await screen.findByText('First persona');
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluations' })[0]);
    expect(screen.queryByText('Previous Eval Data')).toBeNull();
    const cards = screen.getAllByRole('button', {
      name: /Open evaluations & previous data/,
    });
    expect(cards).toHaveLength(2);
    fireEvent.click(cards[0]);
    expect(await screen.findByText('Previous Eval Data')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'First persona' })).toBeTruthy();
    expect(screen.queryByText('New scenario · First persona')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Draft new test scenario' }),
    );
    expect(screen.getByText('New scenario · First persona')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluations' })[0]);
    expect(screen.queryByText('Previous Eval Data')).toBeNull();
    expect(
      screen.getAllByRole('button', {
        name: /Open evaluations & previous data/,
      }),
    ).toHaveLength(2);
  });

  it('shows the forked draft from the owned-persona list after forking', async () => {
    const forkedPersona = {
      personaId: 'persona-0',
      name: 'First persona',
      version: 'v1-exp-1',
      personaType: 'AGENT',
      authoringSource: 'portal',
      lifecycleState: 'DRAFT',
    };
    vi.mocked(agentBuilderService.listMine)
      .mockResolvedValueOnce([
        {
          personaId: 'persona-0',
          name: 'First persona',
          version: '1',
          personaType: 'AGENT',
          authoringSource: 'portal',
          lifecycleState: 'UAT_TRAINING',
        },
      ])
      .mockResolvedValueOnce([forkedPersona]);
    vi.mocked(agentBuilderService.fork).mockResolvedValue({
      newVersion: forkedPersona.version,
    });

    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );

    await screen.findByText('First persona');
    fireEvent.click(screen.getAllByRole('button', { name: /Inspect/ })[0]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Fork version' }),
    );

    expect(
      await screen.findByRole('button', {
        name: /View evaluations & previous data.*v1-exp-1/i,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Portal' })).toBeTruthy();
    expect(agentBuilderService.fork).toHaveBeenCalledWith(
      'persona-0',
      '1',
      expect.any(String),
    );
  });
});
