'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLinkedUser } from '@/lib/linked-user';
import { hasPermission } from '@/lib/authorization';
import { likeTweet, unlikeTweet } from '../models/like.js';
import { followUser, unfollowUser } from '../models/follow.js';
import { deleteTweet } from '../models/tweets.js';
import { deleteUser, logAuditAction, toggleSuspendUser } from '../models/users.js';

export async function toggleLikeAction(formData: FormData) {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  const tweetId = Number(formData.get('tweetId'));
  const action = String(formData.get('action') || '');
  if (!Number.isSafeInteger(tweetId) || tweetId < 1 || !['like', 'unlike'].includes(action)) {
    redirect('/feed?error=invalid_action');
  }
  if (action === 'like') {
    await likeTweet(user.users_id, tweetId);
  } else {
    await unlikeTweet(user.users_id, tweetId);
  }
  revalidatePath('/feed');
  revalidatePath(`/tweet/${tweetId}`);
}

export async function toggleFollowAction(formData: FormData) {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  const followeeId = Number(formData.get('followeeId'));
  const action = String(formData.get('action') || '');
  if (
    !Number.isSafeInteger(followeeId) ||
    followeeId < 1 ||
    followeeId === Number(user.users_id) ||
    !['follow', 'unfollow'].includes(action)
  ) {
    redirect('/feed?error=invalid_action');
  }
  if (action === 'follow') await followUser(user.users_id, followeeId);
  else await unfollowUser(user.users_id, followeeId);
  revalidatePath('/feed');
}

export async function deleteTweetAction(formData: FormData) {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  const tweetId = Number(formData.get('tweetId'));
  if (!Number.isSafeInteger(tweetId) || tweetId < 1) redirect('/feed?error=invalid_action');
  const deleted = await deleteTweet(tweetId, user.users_id);
  if (!deleted) redirect('/feed?error=not_found');
  revalidatePath('/feed');
}

async function requireAdmin() {
  const user = await getLinkedUser();
  if (!user) redirect('/login');
  if (!hasPermission(user, 'users.manage')) redirect('/feed?error=forbidden');
  return user;
}

export async function changeUserStatusAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = Number(formData.get('userId'));
  const suspended = String(formData.get('suspended')) === 'true';
  if (!Number.isSafeInteger(userId) || userId < 1 || userId === Number(actor.users_id)) {
    redirect('/users?error=invalid_action');
  }
  const updatedUser = await toggleSuspendUser(userId, suspended);
  if (!updatedUser) redirect('/users?error=not_found');
  await logAuditAction(
    actor.users_id,
    suspended ? 'suspend_user' : 'unsuspend_user',
    userId,
    'user',
  );
  revalidatePath('/users');
}

export async function removeUserAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = Number(formData.get('userId'));
  if (!Number.isSafeInteger(userId) || userId < 1 || userId === Number(actor.users_id)) {
    redirect('/users?error=invalid_action');
  }
  const deletedUser = await deleteUser(userId);
  if (!deletedUser) redirect('/users?error=not_found');
  await logAuditAction(actor.users_id, 'delete_user', userId, 'user');
  revalidatePath('/users');
}
