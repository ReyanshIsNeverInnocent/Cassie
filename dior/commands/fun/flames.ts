import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { parseUserInputs } from '../../helpers/massModeration.js';
import { escapeFormatting } from '../../utils/formatting.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

export const options = {
  name: 'flames',
  aliases: [] as string[],
  description: 'Find the FLAMES result for two names.',
  usage: 'flames <name> <name>\nflames "name with spaces" "another name"\nflames @user1 @user2',
  category: 'fun',
  owner: false,
  cooldown: 3,
};

const OUTCOMES = [
  { letter: 'F', name: 'Friends' },
  { letter: 'L', name: 'Love' },
  { letter: 'A', name: 'Affection' },
  { letter: 'M', name: 'Marriage' },
  { letter: 'E', name: 'Enemies' },
  { letter: 'S', name: 'Siblings' },
];

function normalizeName(name: string): string {
  return name.normalize('NFKD').toLocaleLowerCase().replace(/[\p{M}\p{P}\p{Z}\p{S}]/gu, '');
}

function calculateFlames(firstName: string, secondName: string) {
  const first = normalizeName(firstName);
  const second = normalizeName(secondName);
  if (!first || !second) return null;

  const firstChars = [...first];
  const remaining = [...second];

  for (const char of firstChars) {
    const match = remaining.indexOf(char);
    if (match !== -1) {
      firstChars[firstChars.indexOf(char)] = '';
      remaining.splice(match, 1);
    }
  }

  const count = firstChars.filter(Boolean).length + remaining.length;
  let letters = OUTCOMES.map(({ letter }) => letter);
  if (!count) {
    letters = ['L'];
  } else {
    while (letters.length > 1) {
      letters.splice((count - 1) % letters.length, 1);
    }
  }
  const result = OUTCOMES.find(({ letter }) => letter === letters[0]);
  if (!result) return null;
  const remainingLetters = new Set(letters);
  const displayLetters = OUTCOMES
    .map(({ letter }) => remainingLetters.has(letter) ? `**${letter}**` : `~~${letter}~~`)
    .join(' ');
  return { count, result, displayLetters };
}

async function getName(
  input: string,
  guild: any,
  client: CassieClient,
): Promise<string> {
  const user = await resolveUser(client, guild, input);
  if (!user) return input;
  const member = guild
    ? await guild.members.fetch(user.id).catch((): null => null)
    : null;
  return member?.displayName ?? user.globalName ?? user.username ?? input;
}

async function sendResult(
  ctx: { message?: any; interaction?: any },
  inputs: string[],
  guild: any,
  client: CassieClient,
): Promise<any> {
  if (inputs.length !== 2 || inputs.some((input) => !input.trim())) {
    return sendError(ctx, `Provide exactly two names. Usage: \`${options.usage}\``);
  }

  const [firstName, secondName] = await Promise.all([
    getName(inputs[0], guild, client),
    getName(inputs[1], guild, client),
  ]);
  const calculation = calculateFlames(firstName, secondName);
  if (!calculation) return sendError(ctx, 'Both names must contain at least one letter or number.');

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emojis.pinkHeartsWithSparkles} FLAMES`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${escapeFormatting(firstName)} + ${escapeFormatting(secondName)}**: n = ${calculation.count}\n` +
        `${calculation.displayLetters} - **${calculation.result.letter} (${calculation.result.name})**`,
      ),
    );
  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as ('everyone' | 'users' | 'roles')[] },
  };
  if (ctx.interaction) return ctx.interaction.editReply(payload);
  return ctx.message.reply(payload);
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const rawArgs = message.commandRawArgs ?? args.join(' ');
  return sendResult({ message }, parseUserInputs(rawArgs), message.guild, client);
}

export async function slashExecute(
  interaction: any,
  client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const inputs = [
    interaction.options.getString('first', true),
    interaction.options.getString('second', true),
  ];
  return sendResult({ interaction }, inputs, interaction.guild, client);
}
