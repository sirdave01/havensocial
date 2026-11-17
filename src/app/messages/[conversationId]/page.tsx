import { notFound } from 'next/navigation';
import { requireLinkedUser } from '@/lib/linked-user';
import {
  getDirectConversationMessages,
  markDirectConversationRead,
} from '@/models/messaging.js';
import ConversationView from '../../components/ConversationView';


export default async function DirectConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await requireLinkedUser();
  const { conversationId } = await params;
  if (!/^[1-9]\d{0,18}$/.test(conversationId)) notFound();

  const data = await getDirectConversationMessages(conversationId, user.users_id, null, 50);
  if (!data) notFound();

  const latestMessageTime = data.messages[data.messages.length - 1]?.created_at ?? null;
  await markDirectConversationRead(conversationId, user.users_id, latestMessageTime);

  return (
    <main className="feed-page">
      <ConversationView
        conversationId={conversationId}
        viewerId={String(user.users_id)}
        participant={data.conversation}
        initialMessages={data.messages}
        initialHasMore={data.hasMore}
      />
    </main>
  );
}
