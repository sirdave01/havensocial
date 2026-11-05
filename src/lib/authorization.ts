export type AppPermission =
  | 'dashboard.view'
  | 'users.manage'
  | 'content.moderate'
  | 'posts.create'
  | 'profile.manage';

type RoleName = 'founder' | 'admin' | 'moderator' | 'user';

const rolePermissions: Record<RoleName, readonly AppPermission[]> = {
  founder: ['dashboard.view', 'users.manage', 'content.moderate', 'posts.create', 'profile.manage'],
  admin: ['dashboard.view', 'users.manage', 'content.moderate', 'posts.create', 'profile.manage'],
  moderator: ['content.moderate', 'posts.create', 'profile.manage'],
  user: ['posts.create', 'profile.manage'],
};

export function hasPermission(
  user: { role_name: string } | null | undefined,
  permission: AppPermission,
) {
  if (!user || !Object.hasOwn(rolePermissions, user.role_name)) return false;
  return rolePermissions[user.role_name as RoleName].includes(permission);
}
