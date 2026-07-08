import type Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_PROXY_ENDPOINT = '/api/anthropic/messages';

type StreamFinalMessage = Anthropic.Message;

type StreamEvent = Anthropic.MessageStreamEvent;

class AnthropicProxyStream implements AsyncIterable<StreamEvent> {
  private finalMessagePromise: Promise<StreamFinalMessage>;
  private eventQueue: StreamEvent[] = [];
  private waiters: Array<{ resolve: (result: IteratorResult<StreamEvent>) => void; reject: (error: unknown) => void }> = [];
  private done = false;
  private error: unknown = null;

  constructor(request: Anthropic.MessageCreateParams) {
    this.finalMessagePromise = this.start(request);
  }

  async finalMessage(): Promise<StreamFinalMessage> {
    return this.finalMessagePromise;
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return {
      next: () => {
        if (this.eventQueue.length > 0) {
          return Promise.resolve({ value: this.eventQueue.shift() as StreamEvent, done: false });
        }
        if (this.error) return Promise.reject(this.error);
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<StreamEvent>>((resolve, reject) => this.waiters.push({ resolve, reject }));
      }
    };
  }

  private push(event: StreamEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value: event, done: false });
    else this.eventQueue.push(event);
  }

  private finish(): void {
    this.done = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined, done: true });
    }
  }

  private fail(error: unknown): void {
    this.error = error;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  private async start(request: Anthropic.MessageCreateParams): Promise<StreamFinalMessage> {
    try {
      const response = await fetch(ANTHROPIC_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'stream', request }),
      });

      if (!response.ok || !response.body) {
        throw await buildProxyError(response);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMessage: StreamFinalMessage | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line) as { type: 'event'; event: StreamEvent } | { type: 'final'; message: StreamFinalMessage } | { type: 'error'; message: string; status?: number };
          if (payload.type === 'event') this.push(payload.event);
          else if (payload.type === 'final') finalMessage = payload.message;
          else if (payload.type === 'error') throw createProxyError(payload.message, payload.status);
        }
      }

      if (buffer.trim()) {
        const payload = JSON.parse(buffer) as { type: 'final'; message?: StreamFinalMessage };
        if (payload.type === 'final' && payload.message) finalMessage = payload.message;
      }

      if (!finalMessage) throw new Error('Anthropic proxy stream ended without a final message.');
      this.finish();
      return finalMessage;
    } catch (error) {
      this.fail(error);
      this.finish();
      throw error;
    }
  }
}

async function buildProxyError(response: Response): Promise<Error> {
  let message = `Anthropic proxy request failed (${response.status})`;
  try {
    const payload = await response.json();
    if (payload?.message) message = payload.message;
    else if (payload?.error?.message) message = payload.error.message;
  } catch {
    const text = await response.text().catch(() => '');
    if (text) message = text;
  }
  return createProxyError(message, response.status);
}

function createProxyError(message: string, status?: number): Error {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

export const anthropicProxy = {
  messages: {
    create: async (request: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
      const response = await fetch(ANTHROPIC_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'create', request }),
      });
      if (!response.ok) throw await buildProxyError(response);
      return response.json();
    },
    stream: (request: Anthropic.MessageCreateParams): Anthropic.MessageStream => {
      return new AnthropicProxyStream(request) as unknown as Anthropic.MessageStream;
    },
  },
};
