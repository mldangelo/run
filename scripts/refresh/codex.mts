import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from './evidence.mts';
import {
  PARSER_VERSION,
  type Parser,
  PROMPT,
  SCHEMA,
  validateParsed,
} from './parser.mts';

// Keep the invocation contract in the cache identity as well as the shared prompt.
const CONFIG = [
  'approval_policy="never"',
  'web_search="disabled"',
  'project_doc_max_bytes=0',
  'skills.include_instructions=false',
  'model_reasoning_effort="low"',
  ...[
    'shell_tool',
    'apps',
    'plugins',
    'hooks',
    'memories',
    'multi_agent',
    'browser_use',
    'computer_use',
    'image_generation',
    'goals',
  ].map((feature) => `features.${feature}=false`),
];
export const CODEX_PARSER_VERSION = hash(
  JSON.stringify({ parser: PARSER_VERSION, adapter: 1, config: CONFIG }),
);
export interface Invocation {
  args: string[];
  cwd: string;
  input: string;
  env: NodeJS.ProcessEnv;
}
export type Runner = (invocation: Invocation) => Promise<string>;

export const runCodex: Runner = ({ args, cwd, input, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.SOURCE_REFRESH_CODEX_BIN || 'codex', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    let failure = '';
    const stop = (reason: string) => {
      failure ||= reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(
      () => stop('Codex parser timed out after 120 seconds'),
      120_000,
    );
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      if (Buffer.byteLength(output) > 2_000_000)
        stop('Codex parser output exceeded 2 MB');
    });
    child.stdin.on('error', () => {
      /* Early process exit is handled below. */
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new Error(
          'Could not start Codex; install the CLI and run codex login status',
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure || code !== 0)
        reject(
          new Error(
            failure ||
              `Codex parser exited ${code}; check codex --version, codex login status and model access`,
          ),
        );
      else resolve(output);
    });
    child.stdin.end(input);
  });

export function codexParser(model: string, execute: Runner = runCodex): Parser {
  return async (url, evidence) => {
    const directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'run-source-parser-'),
    );
    try {
      const schema = path.join(directory, 'schema.json');
      const instructions = path.join(directory, 'instructions.txt');
      const result = path.join(directory, 'result.json');
      fs.writeFileSync(schema, JSON.stringify(SCHEMA), { mode: 0o600 });
      fs.writeFileSync(instructions, PROMPT, { mode: 0o600 });
      const env = { ...process.env };
      // Let the installed CLI own login and token refresh. Never read/copy auth.json.
      delete env.OPENAI_API_KEY;
      delete env.CODEX_API_KEY;
      delete env.OPENAI_BASE_URL;
      const args = [
        'exec',
        '--ignore-user-config',
        '--strict-config',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--json',
        '--model',
        model,
        '--output-schema',
        schema,
        '--output-last-message',
        result,
        ...CONFIG.flatMap((config) => ['-c', config]),
        '-c',
        `model_instructions_file=${JSON.stringify(instructions)}`,
        '-',
      ];
      const output = await execute({
        args,
        cwd: directory,
        env,
        input: JSON.stringify({ source_url: url, evidence }),
      });
      let completed = false;
      let inputTokens = 0;
      let outputTokens = 0;
      for (const line of output.split('\n').filter(Boolean)) {
        let event: {
          type: string;
          item?: { type?: string };
          usage?: { input_tokens: number; output_tokens: number };
        };
        try {
          event = JSON.parse(line);
          if (!event || typeof event.type !== 'string')
            throw new Error('Invalid event');
        } catch {
          throw new Error('Invalid Codex JSONL response');
        }
        if (event.type === 'turn.failed' || event.type === 'error')
          throw new Error('Codex parser reported a failed turn');
        if (
          event.type?.startsWith('item.') &&
          !['agent_message', 'reasoning'].includes(event.item?.type || '')
        )
          throw new Error('Codex parser attempted a tool or unsupported item');
        if (event.type === 'turn.completed') {
          completed = true;
          const usage = event.usage;
          if (
            !usage ||
            !Number.isSafeInteger(usage.input_tokens) ||
            usage.input_tokens < 0 ||
            !Number.isSafeInteger(usage?.output_tokens) ||
            usage.output_tokens < 0
          )
            throw new Error('Missing or invalid Codex token usage');
          inputTokens += usage.input_tokens;
          outputTokens += usage.output_tokens;
        }
      }
      if (!completed) throw new Error('Codex parser did not complete a turn');
      let facts: unknown;
      try {
        facts = JSON.parse(fs.readFileSync(result, 'utf8'));
      } catch {
        throw new Error('Codex parser did not return JSON');
      }
      validateParsed(facts, evidence);
      return { facts, input_tokens: inputTokens, output_tokens: outputTokens };
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}
