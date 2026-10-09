import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentBuilderPage from './AgentBuilderPage';

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
    },
  };
});

afterEach(cleanup);

describe('evaluation navigation', () => {
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
