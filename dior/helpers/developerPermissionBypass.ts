const developerPermissions = {
  has: () => true,
  missing: (): string[] => [],
  any: () => true,
  serialize: () => 'administrator',
};

export function isBotDeveloper(client: { config: { developers: [string, string][] } }, userId: string): boolean {
  return client.config.developers.some(([, id]) => id === userId);
}

function wrapMember(member: any): any {
  if (!member || typeof member !== 'object') return member;

  return new Proxy(member, {
    get(target, property, receiver) {
      if (property === 'permissions') return developerPermissions;
      if (property === 'roles') {
        const roles = Reflect.get(target, property, receiver);
        if (!roles || typeof roles !== 'object') return roles;
        return new Proxy(roles, {
          get(roleTarget, roleProperty, roleReceiver) {
            if (roleProperty === 'highest') {
              const highest = Reflect.get(roleTarget, roleProperty, roleReceiver);
              if (!highest) return highest;
              return new Proxy(highest, {
                get(role, highestProperty, highestReceiver) {
                  if (highestProperty === 'position') return Number.MAX_SAFE_INTEGER;
                  return Reflect.get(role, highestProperty, highestReceiver);
                },
              });
            }
            return Reflect.get(roleTarget, roleProperty, roleReceiver);
          },
        });
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export function withDeveloperPermissionBypass<T extends object>(context: T, isDeveloper: boolean): T {
  if (!isDeveloper || !context || typeof context !== 'object') return context;

  const originalMember = Reflect.get(context, 'member');
  const developerMember = wrapMember(originalMember);

  return new Proxy(context, {
    get(target, property, receiver) {
      if (property === 'member') return developerMember;
      if (property === 'memberPermissions') return developerPermissions;

      if (property === 'channel') {
        const channel = Reflect.get(target, property, receiver);
        if (!channel || typeof channel !== 'object') return channel;

        return new Proxy(channel, {
          get(channelTarget, channelProperty, channelReceiver) {
            if (channelProperty === 'permissionsFor') {
              return (member: any) =>
                member === originalMember || member === developerMember
                  ? developerPermissions
                  : (channelTarget as any).permissionsFor?.(member);
            }
            return Reflect.get(channelTarget, channelProperty, channelReceiver);
          },
        });
      }

      return Reflect.get(target, property, receiver);
    },
  });
}
