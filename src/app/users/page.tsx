import { redirect } from 'next/navigation';
import { changeUserStatusAction, removeUserAction } from '@/app/actions';
import { requireLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { getAllUsers } from '../../models/users.js';

export default async function UsersPage() {
  const actor = await requireLinkedUser();
  if (!hasPermission(actor, 'users.manage')) redirect('/feed');
  const users = await getAllUsers();

  return (
    <main className="feed-page">
      <h1>Users</h1>
      <p>{users.length} accounts</p>
      {users.map((person: Record<string, unknown>) => (
        <article className="feed-item" key={String(person.users_id)}>
          <strong>BHID user {String(person.users_id)}</strong>
          {' '}· {String(person.role_name)} · {String(person.app_status)}
          <p>BHID subject: {String(person.bhid_sub)}</p>
          {['ACTIVE', 'RESTRICTED'].includes(String(person.app_status)) && (
            <form action={changeUserStatusAction}>
              <input type="hidden" name="userId" value={String(person.users_id)} />
              <input
                type="hidden"
                name="suspended"
                value={String(person.app_status === 'ACTIVE')}
              />
              <button type="submit">
                {person.app_status === 'RESTRICTED' ? 'Reactivate' : 'Restrict'}
              </button>
            </form>
          )}
          {person.app_status !== 'DEACTIVATED' && (
            <form action={removeUserAction}>
              <input type="hidden" name="userId" value={String(person.users_id)} />
              <button type="submit">Deactivate account</button>
            </form>
          )}
        </article>
      ))}
    </main>
  );
}
