export const descriptions = {
  help: {
    compact: '**Built for your server.**',
    default:
      'Ascend above the noise. A quiet vanguard of precision and grace, shaping an effortless, elevated sanctuary for your community.',
  },
  voicemaster: {
    description:
      'Your private sphere, crafted in real time. Dictate who enters, mask your presence, and curate an unfiltered space.',
    deleteBlocked: (prefix: string) =>
      `Deleting the VoiceMaster panel is not allowed. Use \`${prefix}voicemaster reset\` to disable VoiceMaster.`,
  },
  customise: {
    descriptionText:
      '**Profile:** Sculpt this server\'s version of the bot: tweak its display name, craft its bio, and swap the avatar or banner to match your community perfectly.\n\n' +
      '**Namestyle:** Shape how the bot\'s name is rendered here; choose from fonts, layered color effects, and rich palettes for a fully bespoke look.\n\n' +
      '**Reset profile:** Wipe every server-specific customisation and restore the bot\'s global defaults.',
    resetConfirm: (botDisplayName: string) =>
      `Are you sure you want to reset **${botDisplayName}**'s server profile to global defaults?\n` +
      '-# This will clear the server nickname, avatar, banner, and bio.',
  },
};
