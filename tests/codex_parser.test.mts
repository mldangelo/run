import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  codexParser,
  type Invocation,
  runCodex,
} from '../scripts/refresh/codex.mts';
import { PROMPT, SCHEMA } from '../scripts/refresh/parser.mts';
import { main } from '../scripts/refresh_sources.mts';

const facts = {
  page_status: 'usable',
  records: [
    {
      kind: 'club_event',
      title: 'Morning run',
      claims: [
        { field: 'location', value: 'Ferry Building', quote: 'Ferry Building' },
      ],
    },
  ],
  warnings: [],
};
const completed = {
  type: 'turn.completed',
  usage: { input_tokens: 400, output_tokens: 100 },
};
const resultPath = (invocation: Invocation) =>
  invocation.args[invocation.args.indexOf('--output-last-message') + 1];

test('Codex parser uses saved CLI auth, isolated stdin evidence and the shared schema; removes scratch files', async () => {
  let directory = '';
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldCodex = process.env.CODEX_API_KEY;
  process.env.OPENAI_API_KEY = 'test-api-override';
  process.env.CODEX_API_KEY = 'test-codex-override';
  try {
    const parser = codexParser('test-model', async (invocation) => {
      directory = invocation.cwd;
      assert.equal(invocation.env.OPENAI_API_KEY, undefined);
      assert.equal(invocation.env.CODEX_API_KEY, undefined);
      assert.equal(invocation.env.CODEX_HOME, process.env.CODEX_HOME);
      assert.deepEqual(JSON.parse(invocation.input), {
        source_url: 'https://example.com/event',
        evidence: 'Meet at the Ferry Building.',
      });
      assert.ok(invocation.args.includes('--ignore-user-config'));
      assert.ok(invocation.args.includes('--ephemeral'));
      assert.equal(
        invocation.args[invocation.args.indexOf('--sandbox') + 1],
        'read-only',
      );
      for (const config of [
        'approval_policy="never"',
        'features.shell_tool=false',
        'features.apps=false',
        'features.plugins=false',
        'features.multi_agent=false',
        'web_search="disabled"',
      ])
        assert.ok(invocation.args.includes(config));
      assert.deepEqual(
        JSON.parse(
          fs.readFileSync(
            invocation.args[invocation.args.indexOf('--output-schema') + 1],
            'utf8',
          ),
        ),
        SCHEMA,
      );
      assert.equal(
        fs.readFileSync(`${directory}/instructions.txt`, 'utf8'),
        PROMPT,
      );
      fs.writeFileSync(resultPath(invocation), JSON.stringify(facts));
      return [
        { type: 'thread.started', thread_id: 'not-saved' },
        {
          type: 'item.completed',
          item: { type: 'reasoning', text: 'not-saved' },
        },
        completed,
      ]
        .map((event) => JSON.stringify(event))
        .join('\n');
    });
    assert.deepEqual(
      await parser('https://example.com/event', 'Meet at the Ferry Building.'),
      { facts, input_tokens: 400, output_tokens: 100 },
    );
    assert.equal(fs.existsSync(directory), false);
  } finally {
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldCodex === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = oldCodex;
  }
});

test('failed, incomplete, malformed and tool-using Codex turns cannot produce a cached success', async () => {
  for (const output of [
    'not json',
    'null',
    JSON.stringify({ type: 'turn.failed' }),
    JSON.stringify({ type: 'thread.started' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: '400', output_tokens: 10 },
    }),
    [
      JSON.stringify({
        type: 'item.started',
        item: { type: 'command_execution' },
      }),
      JSON.stringify(completed),
    ].join('\n'),
  ]) {
    let directory = '';
    const parser = codexParser('test-model', async (invocation) => {
      directory = invocation.cwd;
      fs.writeFileSync(resultPath(invocation), JSON.stringify(facts));
      return output;
    });
    await assert.rejects(
      parser('https://example.com/', 'Ferry Building'),
      /Codex/,
    );
    assert.equal(fs.existsSync(directory), false);
  }
  await assert.rejects(
    codexParser('test-model', async (invocation) => {
      fs.writeFileSync(resultPath(invocation), JSON.stringify(facts));
      return JSON.stringify(completed);
    })('https://example.com/', 'Different source'),
    /unsupported evidence quote/,
  );
});

test('Codex process errors are bounded diagnostics and do not expose child stderr', async () => {
  const original = process.env.SOURCE_REFRESH_CODEX_BIN;
  process.env.SOURCE_REFRESH_CODEX_BIN = process.execPath;
  const invocation = {
    args: ['-e', 'process.stderr.write("private diagnostic");process.exit(7)'],
    cwd: process.cwd(),
    input: '{}',
    env: process.env,
  };
  try {
    await assert.rejects(runCodex(invocation), (error: Error) => {
      assert.match(error.message, /exited 7/);
      assert.doesNotMatch(error.message, /private diagnostic/);
      return true;
    });
    process.env.SOURCE_REFRESH_CODEX_BIN = '/nonexistent/codex';
    await assert.rejects(runCodex(invocation), /Could not start Codex/);
  } finally {
    if (original === undefined) delete process.env.SOURCE_REFRESH_CODEX_BIN;
    else process.env.SOURCE_REFRESH_CODEX_BIN = original;
  }
});

test('CLI requires a known parser and explicit model for Codex cache identity', async () => {
  await assert.rejects(
    main(['--parser', 'unknown']),
    /must be openai or codex/,
  );
  await assert.rejects(main(['--parser', 'codex']), /requires --model/);
});
