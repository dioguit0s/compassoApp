import type { Usuario } from './db/repositorios';

export function serializarUsuario(u: Usuario) {
  return {
    id: u.id,
    displayName: u.displayName,
    avatarKind: u.avatarKind,
    avatarPath: u.avatarPath,
    accentColor: u.accentColor,
    defaultReminderMinutes: u.defaultReminderMinutes,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
