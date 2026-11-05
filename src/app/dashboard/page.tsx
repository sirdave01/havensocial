import { redirect } from 'next/navigation';
import { requireLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { db } from '../../models/db.js';

export default async function DashboardPage() {
  const user = await requireLinkedUser();
  if (!hasPermission(user, 'dashboard.view')) redirect('/feed');
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE app_status = 'ACTIVE') AS users,
       (SELECT COUNT(*) FROM tweets WHERE is_deleted = FALSE) AS posts`,
  );

  return (
    <main className="feed-page">
      <h1>HavenSocial dashboard</h1>
      <p>Users: {result.rows[0].users}</p>
      <p>Posts: {result.rows[0].posts}</p>
    </main>
  );
}
