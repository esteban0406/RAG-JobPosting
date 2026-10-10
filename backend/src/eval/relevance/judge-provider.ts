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
}

// Any /chat/completions endpoint: Ollama (http://localhost:11434/v1), OpenAI,
// Groq. Temperature 0 so repeated judgments agree as much as possible.
export class OpenAiCompatibleJudge implements JudgeProvider {
  readonly id: string;

  constructor(private readonly config: JudgeConfig) {
    const host = new URL(config.baseUrl ?? 'http://localhost:11434/v1').host;
    this.id = `${host}:${config.model}`;
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
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 64,
        }),
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
    this.id = `anthropic:${config.model}`;
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
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 64,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
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
