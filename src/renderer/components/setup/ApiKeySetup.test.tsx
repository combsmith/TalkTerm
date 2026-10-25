// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ApiKeySetup } from './ApiKeySetup';

const defaultProps = {
  onValidated: vi.fn(),
  onSubscriptionSelected: vi.fn(),
};

describe('ApiKeySetup', () => {
  describe('auth method choice screen', () => {
    it('renders heading', () => {
      render(<ApiKeySetup {...defaultProps} />);
      expect(screen.getByText('Get Started')).toBeInTheDocument();
    });

    it('shows Claude Pro/Max subscription option', () => {
      render(<ApiKeySetup {...defaultProps} />);
      expect(screen.getByText(/Claude Pro \/ Max Subscription/)).toBeInTheDocument();
    });

    it('shows API key option', () => {
      render(<ApiKeySetup {...defaultProps} />);
      expect(screen.getByText(/Anthropic API Key/)).toBeInTheDocument();
    });

    it('calls onSubscriptionSelected when subscription is chosen', async () => {
      const onSubscriptionSelected = vi.fn();
      const user = userEvent.setup();
      render(<ApiKeySetup {...defaultProps} onSubscriptionSelected={onSubscriptionSelected} />);
      await user.click(screen.getByText(/Claude Pro \/ Max Subscription/));
      expect(onSubscriptionSelected).toHaveBeenCalledTimes(1);
    });

    it('navigates to API key entry when API key is chosen', async () => {
      const user = userEvent.setup();
      render(<ApiKeySetup {...defaultProps} />);
      await user.click(screen.getByText(/Anthropic API Key/));
      expect(screen.getByPlaceholderText('sk-ant-api03-...')).toBeInTheDocument();
    });
  });

  describe('API key entry screen', () => {
    async function navigateToApiKeyEntry(): Promise<ReturnType<typeof userEvent.setup>> {
      const user = userEvent.setup();
      await user.click(screen.getByText(/Anthropic API Key/));
      return user;
    }

    it('auto-focuses the input', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      await navigateToApiKeyEntry();
      expect(screen.getByPlaceholderText('sk-ant-api03-...')).toHaveFocus();
    });

    it('shows Validate API Key button disabled initially', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      await navigateToApiKeyEntry();
      const btn = screen.getByRole('button', { name: /validate api key/i });
      expect(btn).toBeDisabled();
    });

    it('enables button when input is provided', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      const user = await navigateToApiKeyEntry();
      await user.type(screen.getByPlaceholderText('sk-ant-api03-...'), 'some-key');
      expect(screen.getByRole('button', { name: /validate api key/i })).toBeEnabled();
    });

    it('validates and auto-advances with valid key on Enter', async () => {
      const onValidated = vi.fn();
      render(<ApiKeySetup {...defaultProps} onValidated={onValidated} />);
      const user = await navigateToApiKeyEntry();

      await user.type(
        screen.getByPlaceholderText('sk-ant-api03-...'),
        'sk-ant-api03-test-key{Enter}',
      );

      await waitFor(
        () => {
          expect(screen.getByText(/key verified/i)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
      await waitFor(
        () => {
          expect(onValidated).toHaveBeenCalledWith('sk-ant-api03-test-key');
        },
        { timeout: 3000 },
      );
    }, 10000);

    it('shows error for invalid keys', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      const user = await navigateToApiKeyEntry();

      await user.type(screen.getByPlaceholderText('sk-ant-api03-...'), 'invalid-key');
      await user.click(screen.getByRole('button', { name: /validate api key/i }));

      await waitFor(
        () => {
          expect(screen.getByText(/didn't work/i)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
      expect(defaultProps.onValidated).not.toHaveBeenCalled();
    }, 10000);

    it('suggests subscription option for OAuth tokens', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      const user = await navigateToApiKeyEntry();

      await user.type(screen.getByPlaceholderText('sk-ant-api03-...'), 'sk-ant-oat-test');
      await user.click(screen.getByRole('button', { name: /validate api key/i }));

      await waitFor(
        () => {
          expect(screen.getByText(/Claude Pro\/Max/i)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    }, 10000);

    it('has a Back button to return to choice screen', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      const user = await navigateToApiKeyEntry();

      await user.click(screen.getByText('Back'));
      expect(screen.getByText(/How would you like to connect/)).toBeInTheDocument();
    });

    it('shows link to create API key', async () => {
      render(<ApiKeySetup {...defaultProps} />);
      await navigateToApiKeyEntry();
      expect(screen.getByText(/create a free api key/i)).toBeInTheDocument();
    });

    it('surfaces main-process validateApiKey rejection error message', async () => {
      const validateApiKey = vi.fn().mockResolvedValueOnce({
        valid: false,
        message: 'API key rejected by Anthropic (HTTP 401).',
      });
      Object.defineProperty(window, 'electronAPI', {
        value: { validateApiKey },
        writable: true,
        configurable: true,
      });

      render(<ApiKeySetup {...defaultProps} />);
      const user = await navigateToApiKeyEntry();

      await user.type(
        screen.getByPlaceholderText('sk-ant-api03-...'),
        'sk-ant-api03-revoked-key{Enter}',
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/API key rejected by Anthropic \(HTTP 401\)/i),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      delete (window as { electronAPI?: unknown }).electronAPI;
    }, 10000);
  });

  describe('env key detected', () => {
    it('shows env key detected screen', () => {
      render(<ApiKeySetup {...defaultProps} detectedEnvKey={true} />);
      expect(screen.getByText(/found an existing api key/i)).toBeInTheDocument();
    });

    it('calls onValidated with ENV_KEY when using detected key', async () => {
      const onValidated = vi.fn();
      const user = userEvent.setup();
      render(<ApiKeySetup {...defaultProps} onValidated={onValidated} detectedEnvKey={true} />);
      await user.click(screen.getByRole('button', { name: /use existing key/i }));
      expect(onValidated).toHaveBeenCalledWith('ENV_KEY');
    });

    it('calls onValidated with ENV_KEY on Enter', async () => {
      const onValidated = vi.fn();
      const user = userEvent.setup();
      render(<ApiKeySetup {...defaultProps} onValidated={onValidated} detectedEnvKey={true} />);
      await user.keyboard('{Enter}');
      expect(onValidated).toHaveBeenCalledWith('ENV_KEY');
    });

    it('clicking "Enter a different key instead" clears any error state', async () => {
      const user = userEvent.setup();
      render(<ApiKeySetup {...defaultProps} detectedEnvKey={true} />);
      const differentKeyBtn = screen.getByRole('button', {
        name: /enter a different key instead/i,
      });
      expect(differentKeyBtn).toBeInTheDocument();
      await user.click(differentKeyBtn);
      expect(screen.getByText(/found an existing api key/i)).toBeInTheDocument();
    });
  });

  describe('expired state', () => {
    it('shows expired message and goes directly to API key entry', async () => {
      render(<ApiKeySetup {...defaultProps} initialState="expired" />);
      const user = userEvent.setup();
      await user.click(screen.getByText(/Anthropic API Key/));
      expect(screen.getByText(/expired or been revoked/i)).toBeInTheDocument();
    });
  });
});
