class AbortError extends Error {
  constructor(message?: string) {
    super(message ?? 'This operation was aborted');
  }
  name = 'AbortError';
}

export const throwIfAborted = (signal?: {
  aborted: boolean;
  reason?: Error;
}) => {
  if (signal?.aborted) {
    throw signal.reason ?? createCancelError();
  }
};

export const createCancelError = (message?: string): AbortError => {
  const controller = new AbortController();
  controller.abort();
  if (message && controller.signal.reason) {
    Object.defineProperty(controller.signal.reason, 'message', {
      get() {
        return message;
      },
      configurable: true,
      enumerable: true,
    });
  }
  // .reason is not supported in all electron versions, so use AbortError as a fallback
  return controller.signal.reason ?? new AbortError(message);
};

export function isCancelError(error: any): error is AbortError {
  return error?.name === 'AbortError';
}

export async function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createCancelError());
  }

  let abortListener;

  // We need a promise that will reject as soon as the operation is aborted.
  const pendingPromise = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(signal.reason ?? createCancelError());
    signal.addEventListener('abort', abortListener, { once: true });
  });

  try {
    return await Promise.race([pendingPromise, promise]);
  } finally {
    if (abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  }
}

/**
 * Returns a promise that waits for a timeout and can be canceled with a signal
 *
 * @param ms Wait time
 * @param signal Abort signal
 */
export async function cancellableWait(ms: number, signal: AbortSignal) {
  await raceWithAbort(
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
    signal
  );
}
