import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentBuilderPage from './AgentBuilderPage';
import { agentBuilderService } from '../services/agentBuilderService';

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
      getEval: vi.fn(),
    },
  };
});

afterEach(cleanup);

describe('evaluation navigation', () => {
  it('sorts runs newest-first and expands and collapses their results inside the row', async () => {
    const oldRun = {
      runId: 'older-run',
      personaId: 'persona-0',
      personaVersion: '1',
      runStatus: 'COMPLETED',
      createdAt: '2026-10-08T10:00:00Z',
      qualityScore: 0.1,
    };
    const newRun = {
      ...oldRun,
      runId: 'newer-run',
      createdAt: '2026-10-09T10:00:00Z',
      qualityScore: 0.2,
    };
    vi.mocked(agentBuilderService.listEvalRuns).mockResolvedValue([
      oldRun,
      newRun,
    ]);
    vi.mocked(agentBuilderService.getEval).mockResolvedValue(newRun);
    render(
      <MemoryRouter>
        <AgentBuilderPage />
      </MemoryRouter>,
    );
    await screen.findByText('First persona');
    fireEvent.click(screen.getAllByRole('button', { name: 'Evaluations' })[0]);
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /Open evaluations & previous data/,
      })[0],
    );
    await screen.findByText(/newer-ru/);
    const rows = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'));
    expect(rows[0].textContent).toContain('newer-ru');
    expect(rows[1].textContent).toContain('older-ru');
    expect(screen.queryByText('Evaluation result')).toBeNull();
    fireEvent.click(rows[0]);
    expect(await screen.findByText('Evaluation result')).toBeTruthy();
    expect(rows[0].getAttribute('aria-expanded')).toBe('true');
    const result = document.getElementById('evaluation-result-newer-run');
    expect(result?.className).toContain('w-full');
    expect(result?.parentElement?.contains(rows[0])).toBe(true);
    fireEvent.click(rows[0]);
    expect(screen.queryByText('Evaluation result')).toBeNull();
    expect(rows[0].getAttribute('aria-expanded')).toBe('false');
    vi.mocked(agentBuilderService.listEvalRuns).mockResolvedValue([]);
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
});
