import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useRealtimeSpeechToText } from '../../hooks/useRealtimeSpeechToText';
import { useSttConfig } from '../../hooks/useSttConfig';
import type { AgentEndpointConfig } from '../../types/agent';
import { AgentConversationModal } from './AgentConversationModal';

vi.mock('../../hooks/useSttConfig', () => ({ useSttConfig: vi.fn() }));
vi.mock('../../hooks/useRealtimeSpeechToText', () => ({
  useRealtimeSpeechToText: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));
vi.mock('../../services/fhir/client', () => ({
  fhirApi: { util: { invalidateTags: vi.fn() } },
}));
vi.mock('../../hooks/useSSESubscription', () => ({
  useSSESubscription: vi.fn(),
}));
vi.mock('../common/AgentResponseFormatter', () => ({ default: () => null }));
vi.mock('../../services/auth/oidc', () => ({
  getAuthenticatedHeaders: vi.fn(),
}));

const agentConfig: AgentEndpointConfig = {
  endpoint: '/api/agent/AgentPersona/digital-twin/AgentMission',
  personaId: 'digital-twin',
};
const props = {
  isOpen: true,
  onClose: vi.fn(),
  agentConfig,
  patientId: 'patient-1',
  tenantId: 'tenant-1',
  accessToken: 'test-token',
};
const configMock = vi.mocked(useSttConfig);
const realtimeMock = vi.mocked(useRealtimeSpeechToText);
let config: ReturnType<typeof useSttConfig>;
let realtime: ReturnType<typeof useRealtimeSpeechToText>;
const recognition = {
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  lang: '',
  continuous: false,
  interimResults: false,
};
const Recognition = vi.fn(function () {
  return recognition;
});
const fetchMock = vi.fn();
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  config = {
    provider: 'browser',
    language: 'en-GB',
    loading: false,
    error: null,
    retry: vi.fn(),
  };
  realtime = { start: vi.fn(), stop: vi.fn(), isListening: false, error: null };
  configMock.mockImplementation(() => config);
  realtimeMock.mockImplementation(() => realtime);
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AgentConversationModal STT integration', () => {
  it.each(['SpeechRecognition', 'webkitSpeechRecognition'])(
    'starts native %s for the browser provider',
    (api) => {
      vi.stubGlobal(api, Recognition);
      render(<AgentConversationModal {...props} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Start voice input' }),
      );

      expect(Recognition).toHaveBeenCalledOnce();
      expect(recognition.start).toHaveBeenCalledOnce();
      expect(recognition.lang).toBe('en-GB');
      expect(recognition.interimResults).toBe(true);
      expect(realtime.start).not.toHaveBeenCalled();
      expect(realtimeMock.mock.lastCall?.[0]).toBe(false);
      expect(
        screen
          .getByRole('button', { name: 'End voice mode' })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    },
  );

  it('starts realtime with typed text without native SpeechRecognition', () => {
    config.provider = 'realtime-api';
    render(<AgentConversationModal {...props} />);
    const microphone = screen.getByRole('button', {
      name: 'Start voice input',
    });

    expect(microphone.hasAttribute('disabled')).toBe(false);
    expect(realtimeMock.mock.lastCall?.[0]).toBe(true);
    expect(realtimeMock.mock.lastCall?.[2]).toBe('tenant-1');
    expect(realtimeMock.mock.lastCall?.[3]).toBe('test-token');
    expect(configMock).toHaveBeenCalledWith(true, 'tenant-1', 'test-token');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'My typed question' },
    });
    fireEvent.click(microphone);

    expect(realtime.start).toHaveBeenCalledExactlyOnceWith('My typed question');
    expect(Recognition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops realtime from the microphone while recording', () => {
    config.provider = 'realtime-api';
    realtime.isListening = true;
    render(<AgentConversationModal {...props} />);
    const microphone = screen.getByRole('button', { name: 'Stop voice input' });

    expect(microphone.hasAttribute('disabled')).toBe(false);
    expect(microphone.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
    fireEvent.click(microphone);

    expect(realtime.stop).toHaveBeenCalledOnce();
    expect(realtime.start).not.toHaveBeenCalled();
  });

  it.each(['browser', 'realtime-api'] as const)(
    'disables the %s microphone while configuration loads',
    (provider) => {
      config.provider = provider;
      config.loading = true;
      vi.stubGlobal('SpeechRecognition', Recognition);
      render(<AgentConversationModal {...props} />);
      const microphone = screen.getByRole('button', {
        name: 'Start voice input',
      });

      expect(microphone.hasAttribute('disabled')).toBe(true);
      fireEvent.click(microphone);

      expect(recognition.start).not.toHaveBeenCalled();
      expect(realtime.start).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Retry voice configuration' }),
      ).toBeNull();
    },
  );

  it.each(['browser', 'realtime-api'] as const)(
    'disables the %s microphone on configuration error and offers retry',
    (provider) => {
      config.provider = provider;
      config.error = 'Voice configuration unavailable (503).';
      vi.stubGlobal('SpeechRecognition', Recognition);
      render(<AgentConversationModal {...props} />);
      const microphone = screen.getByRole('button', {
        name: 'Start voice input',
      });

      expect(microphone.hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('alert').textContent).toContain(config.error);
      fireEvent.click(microphone);
      expect(recognition.start).not.toHaveBeenCalled();
      expect(realtime.start).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole('button', { name: 'Retry voice configuration' }),
      );
      expect(config.retry).toHaveBeenCalledOnce();
    },
  );

  it('puts realtime transcripts in the input without auto-sending browser voice commands', () => {
    vi.useFakeTimers();
    config.provider = 'realtime-api';
    render(<AgentConversationModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    const onText = realtimeMock.mock.lastCall![1];

    act(() => {
      onText('Please review my medication, Nova, over to you');
      vi.advanceTimersByTime(1000);
    });

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Please review my medication, Nova, over to you',
    );
    expect(
      screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(realtime.stop).not.toHaveBeenCalled();
  });
});
