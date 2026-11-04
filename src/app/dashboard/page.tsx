import { redirect } from 'next/navigation';
import { requireLinkedUser } from '@/lib/linked-user';
import { db } from '../../models/db.js';

export default async function DashboardPage() {
  const user = await requireLinkedUser();
  if (!['founder', 'admin'].includes(user.role_name)) redirect('/feed');
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT COUNT(*) FROM tweets WHERE deleted_at IS NULL) AS posts,
       (SELECT COUNT(*) FROM users WHERE verified = TRUE AND deleted_at IS NULL) AS verified_users`,
  );

  return (
    <main className="feed-page">
      <h1>HavenSocial dashboard</h1>
      <p>Users: {result.rows[0].users}</p>
      <p>Posts: {result.rows[0].posts}</p>
      <p>BHID-verified users: {result.rows[0].verified_users}</p>
    </main>
  );
}
