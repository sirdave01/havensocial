import { redirect } from 'next/navigation';
import { changeUserStatusAction, removeUserAction } from '@/app/actions';
import { requireLinkedUser } from '@/lib/linked-user';
import { getAllUsers } from '../../models/users.js';

export default async function UsersPage() {
  const actor = await requireLinkedUser();
  if (!['founder', 'admin'].includes(actor.role_name)) redirect('/feed');
  const users = await getAllUsers();

  return (
    <main className="feed-page">
      <h1>Users</h1>
      <p>{users.length} accounts</p>
      {users.map((person: Record<string, unknown>) => (
        <article className="feed-item" key={String(person.users_id)}>
          <strong>{String(person.display_name || person.username)}</strong>
          {' '}@{String(person.username)} · {String(person.role_name)}
          {' '}· {person.suspended ? 'Suspended' : 'Active'}
          <form action={changeUserStatusAction}>
            <input type="hidden" name="userId" value={String(person.users_id)} />
            <input type="hidden" name="suspended" value={String(!person.suspended)} />
            <button type="submit">{person.suspended ? 'Unsuspend' : 'Suspend'}</button>
          </form>
          <form action={removeUserAction}>
            <input type="hidden" name="userId" value={String(person.users_id)} />
            <button type="submit">Delete account</button>
          </form>
        </article>
      ))}
    </main>
  );
}
