// xoxo/config/developerPanel.ts
//
// All content shown by the $developer command.
// Edit these fields to update the panel without touching command logic.

export const developerPanelConfig = {

  // ── Developer identity ───────────────────────────────────────────────────────
  name:       'Reyansh',
  /** Discord user ID — used for the in-panel mention. */
  userId:     '922491166149214218',
  /** Short bio shown under the name. */
  about:      '17 yo stupid programmer (was 16 at the time of making lol).',
  /** Local developer avatar resource used as the section thumbnail. */
  avatarImage: 'developerPanel/thumbnail.jpg',
  /** Optional banner/header image shown at the top of the panel.
   *  Set to '' to skip the image. */
  bannerImage: 'developerPanel/banner.jpg',

  // ── Bot project info ─────────────────────────────────────────────────────────
  project: 'Cassie',
  year:    '2026',
  status:  'Active',
  reason:  'Developer was bored',

  // ── Connect buttons ──────────────────────────────────────────────────────────
  /** Links to the developer's Discord profile (shows Add Friend option). */
  addFriendUrl:     'https://discord.com/users/922491166149214218',

} as const;
