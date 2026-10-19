export interface JudgeProvider {
  // Identifies the judge in caches and reports, e.g. "ollama:llama3.1:8b".
  readonly id: string;
  complete(prompt: string): Promise<string>;
}

export interface JudgeConfig {
  provider: 'openai-compatible' | 'anthropic';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  // 0 by default; null omits it, for models that reject sampling parameters
  // (Claude 5.5 models answer 400 to a non-default temperature).
  temperature?: number | null;
  // OpenAI-compatible only: e.g. "none" for GPT-6 Sol, which then accepts a
  // temperature again. Newer OpenAI models take max_completion_tokens.
  reasoningEffort?: string;
  // Anthropic only: thinking.type, e.g. "between_tools" (thinking off on
  // Claude Sonnet 5.5) or "disabled" (Claude Haiku 5.5).
  thinking?: string;
}

const MAX_TOKENS = 64;

// The settings change what the judge answers, so they are part of its id and
// of its cache: verdicts from different settings are never mixed.
function settingsSuffix(config: JudgeConfig): string {
  const parts = [
    config.temperature === null ? 'temperature=default' : undefined,
    config.reasoningEffort ? `reasoning=${config.reasoningEffort}` : undefined,
    config.thinking ? `thinking=${config.thinking}` : undefined,
  ].filter(Boolean);
  return parts.length ? `@${parts.join(',')}` : '';
}

// Any /chat/completions endpoint: Ollama (http://localhost:11434/v1), OpenAI,
// Groq. Temperature 0 so repeated judgments agree as much as possible.
export class OpenAiCompatibleJudge implements JudgeProvider {
  readonly id: string;

  constructor(private readonly config: JudgeConfig) {
    const host = new URL(config.baseUrl ?? 'http://localhost:11434/v1').host;
    this.id = `${host}:${config.model}${settingsSuffix(config)}`;
  }

  requestBody(prompt: string): Record<string, unknown> {
    const temperature = this.config.temperature ?? 0;
    return {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      ...(this.config.temperature !== null && { temperature }),
      ...(this.config.reasoningEffort
        ? {
            reasoning_effort: this.config.reasoningEffort,
            max_completion_tokens: MAX_TOKENS,
          }
        : { max_tokens: MAX_TOKENS }),
    };
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(
      `${this.config.baseUrl ?? 'http://localhost:11434/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify(this.requestBody(prompt)),
      },
    );
    if (!res.ok)
      throw new Error(`Judge HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return body.choices[0]?.message.content ?? '';
  }
}

export class AnthropicJudge implements JudgeProvider {
  readonly id: string;

  constructor(private readonly config: JudgeConfig) {
    this.id = `anthropic:${config.model}${settingsSuffix(config)}`;
  }

  requestBody(prompt: string): Record<string, unknown> {
    const temperature = this.config.temperature ?? 0;
    return {
      model: this.config.model,
      max_tokens: MAX_TOKENS,
      ...(this.config.temperature !== null && { temperature }),
      ...(this.config.thinking && { thinking: { type: this.config.thinking } }),
      messages: [{ role: 'user', content: prompt }],
    };
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(
      `${this.config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(this.requestBody(prompt)),
      },
    );
    if (!res.ok)
      throw new Error(`Judge HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    return body.content.find((c) => c.type === 'text')?.text ?? '';
  }
}

export function createJudge(config: JudgeConfig): JudgeProvider {
  return config.provider === 'anthropic'
    ? new AnthropicJudge(config)
    : new OpenAiCompatibleJudge(config);
}
