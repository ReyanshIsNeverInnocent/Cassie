import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import { basename, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import { inspect } from 'node:util';
import type { CassieClient } from '../structures/CassieClient.js';

const execFile = promisify(execFileCallback);
const WORKSPACE_ROOT = realpathSync(process.cwd());
const MAX_OUTPUT = 5_500;
const MAX_SOURCE = 8_000;
const EXEC_TIMEOUT = 15_000;
const EVAL_TIMEOUT = 1_000;

export function rawCommandInput(message: any, args: string[]): string {
  if (typeof message.commandRawArgs === 'string') {
    return message.commandRawArgs.trim();
  }
  return args.join(' ').trim();
}

export function limitOutput(value: unknown, max = MAX_OUTPUT): string {
  const text = typeof value === 'string'
    ? value
    : inspect(value, { depth: 4, maxArrayLength: 50, breakLength: 100 });
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [output truncated]`;
}

export async function evaluateCode(
  message: any,
  code: string,
  args: string[],
  client: CassieClient,
): Promise<string> {
  if (!code) return 'Usage: `$eval <javascript>`';

  const logs: string[] = [];
  const sandboxConsole = {
    log: (...values: unknown[]) => logs.push(values.map((v) => inspect(v, { depth: 3 })).join(' ')),
    info: (...values: unknown[]) => logs.push(values.map((v) => inspect(v, { depth: 3 })).join(' ')),
    warn: (...values: unknown[]) => logs.push(`WARN: ${values.map((v) => inspect(v, { depth: 3 })).join(' ')}`),
    error: (...values: unknown[]) => logs.push(`ERROR: ${values.map((v) => inspect(v, { depth: 3 })).join(' ')}`),
  };

  const sandbox = {
    client,
    message,
    guild: message.guild ?? null,
    channel: message.channel ?? null,
    args,
    console: sandboxConsole,
  };

  let result: unknown;
  try {
    // Expression mode makes `$eval 1 + 1` and object literals convenient.
    result = vm.runInNewContext(`(${code})`, sandbox, { timeout: EVAL_TIMEOUT });
  } catch (expressionError) {
    try {
      result = vm.runInNewContext(`(async () => (${code}\n))()`, sandbox, {
        timeout: EVAL_TIMEOUT,
      });
    } catch (asyncExpressionError) {
      try {
        // Statement mode supports snippets with declarations and explicit returns.
        result = vm.runInNewContext(`(async () => { ${code}\n})()`, sandbox, {
          timeout: EVAL_TIMEOUT,
        });
      } catch (statementError) {
        const statementMessage = statementError instanceof Error ? statementError.message : String(statementError);
        const asyncMessage = asyncExpressionError instanceof Error ? asyncExpressionError.message : String(asyncExpressionError);
        const expressionMessage = expressionError instanceof Error ? expressionError.message : String(expressionError);
        throw new Error(`Could not evaluate snippet: ${statementMessage}\nAsync expression attempt: ${asyncMessage}\nExpression attempt: ${expressionMessage}`);
      }
    }
  }

  if (result && typeof (result as Promise<unknown>).then === 'function') {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        result as Promise<unknown>,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Async evaluation timed out after 5 seconds.')), 5_000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  const output = [
    logs.length ? `Console:\n${logs.join('\n')}` : '',
    `Result:\n${limitOutput(result)}`,
  ].filter(Boolean).join('\n\n');
  return limitOutput(output);
}

function isBlockedSourcePath(path: string): boolean {
  return path.split(/[\\/]+/).some((part) =>
    part.toLowerCase() === '.env' ||
    part.toLowerCase().startsWith('.env.') ||
    part.toLowerCase() === 'node_modules' ||
    part.toLowerCase() === 'dist',
  );
}

export function readSource(requestedPath: string): { output: string; success: boolean } {
  const requested = requestedPath.trim();
  if (!requested) return { output: 'Usage: `source <workspace-relative-file>`', success: false };
  if (requested.includes('\0')) return { output: 'Invalid path.', success: false };

  const normalized = normalize(requested);
  const fullPath = resolve(WORKSPACE_ROOT, normalized);
  const rel = relative(WORKSPACE_ROOT, fullPath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${normalize('/')}`) || isBlockedSourcePath(rel)) {
    return { output: 'That path is outside the allowed source tree or is blocked.', success: false };
  }

  try {
    const resolvedPath = realpathSync(fullPath);
    const resolvedRel = relative(WORKSPACE_ROOT, resolvedPath);
    if (!resolvedRel || resolvedRel.startsWith('..') || resolvedRel.includes(`..${normalize('/')}`) || isBlockedSourcePath(resolvedRel)) {
      return { output: 'That path resolves outside the allowed source tree or is blocked.', success: false };
    }
    if (!statSync(resolvedPath).isFile()) {
      return { output: `Not a file: \`${requested}\``, success: false };
    }

    return {
      output: `File: \`${resolvedRel}\`\n\n${limitOutput(readFileSync(resolvedPath, 'utf8'), MAX_SOURCE)}`,
      success: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { output: `Could not read \`${requested}\`: ${message}`, success: false };
  }
}

type SafeExec = { command: string; args: string[]; label: string };

function parseSafeExec(input: string): SafeExec | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const [command, ...args] = tokens;
  if (command === 'pwd' && args.length === 0) return { command, args, label: 'pwd' };
  if (command === 'ls' && args.length <= 1 && args.every((arg) => !arg.startsWith('-') && !arg.includes('..'))) {
    return { command, args, label: `ls ${args.join(' ')}`.trim() };
  }
  if (command === 'git' && (
    (args.length === 1 && (args[0] === 'status' || args[0] === 'branch')) ||
    (args[0] === 'log' && args.length <= 2 && (
      args.length === 1 ||
      /^-\d{1,2}$/.test(args[1]!) ||
      args[1] === '--oneline'
    )) ||
    (args.length === 2 && args[0] === 'diff' && args[1] === '--stat')
  )) {
    return { command, args, label: `git ${args.join(' ')}` };
  }
  if (command === 'node' && args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    return { command, args, label: 'node --version' };
  }
  if (command === 'npm' && args.length === 2 && args[0] === 'run' && (
    args[1] === 'build' || args[1] === 'check:command-parity'
  )) {
    return { command, args, label: `npm run ${args[1]}` };
  }
  return null;
}

export async function executeSafeCommand(input: string): Promise<{ output: string; success: boolean }> {
  const parsed = parseSafeExec(input);
  if (!parsed) {
    return {
      output: 'Allowed commands: `pwd`, `ls [workspace-relative-directory]`, `git status`, `git branch`, `git log`, `git diff --stat`, `node --version`, `npm run build`, `npm run check:command-parity`.',
      success: false,
    };
  }

  try {
    let command = parsed.command;
    let args = parsed.args;

    if (command === 'pwd') {
      return { output: WORKSPACE_ROOT, success: true };
    }
    if (command === 'ls') {
      const requestedPath = args[0] ?? '.';
      const fullPath = resolve(WORKSPACE_ROOT, requestedPath);
      let actualPath: string;
      try {
        actualPath = realpathSync(fullPath);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        return { output: `Could not list that path: ${detail}`, success: false };
      }
      const rel = relative(WORKSPACE_ROOT, actualPath);
      if (rel.startsWith('..') || rel.includes(`..${normalize('/')}`)) {
        return { output: 'The path must stay inside the project workspace.', success: false };
      }
      const entries = readdirSync(actualPath, { withFileTypes: true })
        .map((entry) => `${entry.isDirectory() ? '[dir] ' : ''}${entry.name}`);
      return { output: entries.join('\n') || '(empty directory)', success: true };
    }

    if (command === 'npm' && process.platform === 'win32') {
      command = process.env['ComSpec'] || 'cmd.exe';
      args = ['/d', '/s', '/c', `npm.cmd ${parsed.args.join(' ')}`];
    }

    const result = await execFile(command, args, {
      cwd: WORKSPACE_ROOT,
      timeout: EXEC_TIMEOUT,
      maxBuffer: 512 * 1024,
      shell: false,
    });
    return {
      output: `${parsed.label}\n\n${limitOutput([result.stdout, result.stderr].filter(Boolean).join('\n')) || '(no output)'}`,
      success: true,
    };
  } catch (error: unknown) {
    const stdout = typeof error === 'object' && error !== null && 'stdout' in error && typeof error.stdout === 'string'
      ? error.stdout
      : '';
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : '';
    const message = error instanceof Error ? error.message : String(error);
    const output = [stdout, stderr, message]
      .filter(Boolean)
      .join('\n');
    return { output: `${parsed.label}\n\n${limitOutput(output)}`, success: false };
  }
}

function findCommandFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findCommandFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

export async function reloadPrefixCommand(
  client: CassieClient,
  requestedName: string,
): Promise<{ output: string; success: boolean }> {
  const requested = requestedName.toLowerCase().replace(/^\$/, '');
  if (!requested) return { output: 'Usage: `reload <command>`', success: false };

  const commandDir = join(WORKSPACE_ROOT, 'dist', 'dior', 'commands');
  const files = findCommandFiles(commandDir);
  let targetPath: string | null = null;
  let targetName = requested;

  try {
    for (const file of files) {
      const raw = await import(pathToFileURL(file).href);
      const exported = raw.default ?? raw;
      const modules = Array.isArray(exported.commands) ? exported.commands : [exported];
      for (const mod of modules) {
        const name = mod.options?.name?.toLowerCase();
        const aliases = (mod.options?.aliases ?? []).map((alias: string) => alias.toLowerCase());
        if (name === requested || aliases.includes(requested)) {
          targetPath = file;
          targetName = name;
          break;
        }
      }
      if (targetPath) break;
    }

    if (!targetPath) return { output: `Command not found in compiled commands: \`${requested}\``, success: false };

    const fresh = await import(`${pathToFileURL(targetPath).href}?reload=${Date.now()}`);
    const exported = fresh.default ?? fresh;
    const modules = Array.isArray(exported.commands) ? exported.commands : [exported];
    const mod = modules.find((candidate: any) => candidate.options?.name?.toLowerCase() === targetName);
    if (!mod) return { output: `\`${targetName}\` was not exported by its command module after reload.`, success: false };
    if (typeof mod.prefixExecute !== 'function') {
      return { output: `\`${targetName}\` has no prefix handler.`, success: false };
    }

    client.commands.set(targetName, mod);
    for (const [alias, commandName] of client.aliases) {
      if (commandName === targetName) client.aliases.delete(alias);
    }
    for (const alias of mod.options?.aliases ?? []) {
      client.aliases.set(alias.toLowerCase(), targetName);
    }

    return {
      output: `Reloaded prefix command \`${targetName}\` from \`${relative(WORKSPACE_ROOT, targetPath)}\`.`,
      success: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { output: `Could not reload \`${requested}\`: ${message}`, success: false };
  }
}