import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const commandsDir = join(root, 'dior', 'commands');
const slashCommandsDir = join(root, 'dior', 'slashCommands');
const roleplayFile = join(root, 'dior', 'helpers', 'roleplay.ts');
const siteFile = join(root, 'Cassie-Web', 'src', 'config', 'site.ts');

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function stringValue(node) {
  node = unwrap(node);
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function propertyName(node, sourceFile) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return node.getText(sourceFile);
}

function objectProperties(node, sourceFile) {
  node = unwrap(node);
  if (!ts.isObjectLiteralExpression(node)) return new Map();
  return new Map(
    node.properties
      .filter(ts.isPropertyAssignment)
      .map((property) => [propertyName(property.name, sourceFile), property.initializer]),
  );
}

function readCommandOptions(file) {
  const text = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = [];

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'options') {
      const properties = objectProperties(node.initializer, sourceFile);
      const name = stringValue(properties.get('name'));
      if (name) {
        found.push({
          name,
          ownerOnly: unwrap(properties.get('owner'))?.kind === ts.SyntaxKind.TrueKeyword,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function readRoleplayActionNames() {
  const text = readFileSync(roleplayFile, 'utf8');
  const sourceFile = ts.createSourceFile(roleplayFile, text, ts.ScriptTarget.Latest, true);
  const names = new Set();
  const phraseTables = new Set(['pairPhrases', 'singlePhrases']);

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      phraseTables.has(node.name.text)
    ) {
      const table = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(table)) {
        for (const property of table.properties) {
          if (ts.isPropertyAssignment(property)) {
            names.add(propertyName(property.name, sourceFile));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return names;
}

function readSlashCommandNames() {
  const names = new Set();

  for (const file of sourceFiles(slashCommandsDir)) {
    const text = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'data') {
        let expression = unwrap(node.initializer);
        while (ts.isCallExpression(expression)) {
          const callee = expression.expression;
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === 'setName' &&
            expression.arguments.length > 0
          ) {
            const name = stringValue(expression.arguments[0]);
            if (name) names.add(name);
            break;
          }
          if (!ts.isPropertyAccessExpression(callee)) break;
          expression = callee.expression;
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return names;
}

function readWebsiteCatalog() {
  const text = readFileSync(siteFile, 'utf8');
  const sourceFile = ts.createSourceFile(siteFile, text, ts.ScriptTarget.Latest, true);
  const commands = new Set();
  const roleplay = new Set();

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'roleplayCommandNames') {
      const values = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(values)) {
        for (const item of values.elements) {
          const name = stringValue(item);
          if (name) roleplay.add(name);
        }
      }
    }

    if (ts.isPropertyAssignment(node) && propertyName(node.name, sourceFile) === 'commandCategories') {
      const categories = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(categories)) {
        for (const category of categories.elements) {
          const properties = objectProperties(category, sourceFile);
          const entries = unwrap(properties.get('commands'));
          if (!ts.isArrayLiteralExpression(entries)) continue;

          for (const entry of entries.elements) {
            const name = stringValue(objectProperties(entry, sourceFile).get('name'));
            if (name) commands.add(name.replace(/^\$/, '').trim().split(/\s+/)[0]);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { commands, roleplay };
}

function normalize(name) {
  return name.toLowerCase().replace(/^\/+/, '');
}

const publicCommands = new Set();
for (const file of sourceFiles(commandsDir)) {
  for (const command of readCommandOptions(file)) {
    if (!command.ownerOnly) publicCommands.add(normalize(command.name));
  }
}

const website = readWebsiteCatalog();
const slashCommands = readSlashCommandNames();
const roleplayActions = readRoleplayActionNames();
const documentedCommands = new Set([...website.commands].map(normalize));

const missing = [...publicCommands].filter((name) => !documentedCommands.has(name));
const undocumented = [...documentedCommands].filter(
  (name) => !publicCommands.has(name) && !slashCommands.has(name),
);
const missingRoleplay = [...roleplayActions].filter((name) => !website.roleplay.has(name));
const staleRoleplay = [...website.roleplay].filter((name) => !roleplayActions.has(name));

if (missing.length || undocumented.length || missingRoleplay.length || staleRoleplay.length) {
  if (missing.length) console.error(`Missing from website catalog: ${missing.join(', ')}`);
  if (undocumented.length) console.error(`Not available as a public bot command: ${undocumented.join(', ')}`);
  if (missingRoleplay.length) console.error(`Missing roleplay commands: ${missingRoleplay.join(', ')}`);
  if (staleRoleplay.length) console.error(`Stale roleplay commands: ${staleRoleplay.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Command parity OK: ${publicCommands.size} public prefix commands, ` +
      `${slashCommands.size} slash command names, and ${roleplayActions.size} roleplay commands checked.`,
  );
}
