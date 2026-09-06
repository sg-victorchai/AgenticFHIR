/**
 * Fetch with configurable timeout support
 * Wraps native fetch with AbortController to enforce request timeouts
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (can include custom timeout via fetchWithTimeoutOptions)
 * @returns Promise resolving to Response
 * @throws Error if timeout is exceeded
 */

interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number; // Timeout in milliseconds
}

export async function fetchWithTimeout(
  url: string | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options; // Default 30 second timeout

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Request timeout after ${timeout}ms. The backend took too long to respond. Please try again.`,
      );
    }

    throw error;
  }
}
