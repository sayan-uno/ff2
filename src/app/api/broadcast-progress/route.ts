
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { isAdminAuthenticated } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events endpoint for streaming broadcast push notification progress.
 * The admin UI connects to this to see real-time progress. Polls until the
 * broadcast is completed or failed — no timeout.
 * 
 * GET /api/broadcast-progress?id=<broadcastId>
 */
export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated();
  if (!isAdmin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const broadcastId = req.nextUrl.searchParams.get('id');
  if (!broadcastId) {
    return new Response('Missing broadcast ID', { status: 400 });
  }

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(broadcastId);
  } catch {
    return new Response('Invalid broadcast ID', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const db = await connectToDatabase();

      const sendEvent = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream already closed by client
        }
      };

      const poll = async (): Promise<void> => {
        try {
          const broadcast = await db.collection('broadcast_notifications').findOne({ _id: objectId });

          if (!broadcast) {
            sendEvent({ error: 'Broadcast not found', done: true });
            controller.close();
            return;
          }

          const isDone = broadcast.status === 'completed' || broadcast.status === 'failed';

          sendEvent({
            pushSent: broadcast.pushSent || 0,
            pushFailed: broadcast.pushFailed || 0,
            pushTotal: broadcast.pushTotal || 0,
            totalUsers: broadcast.totalUsers || 0,
            status: broadcast.status,
            done: isDone,
          });

          if (isDone) {
            controller.close();
            return;
          }

          // Wait 2 seconds before next poll
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await poll();
        } catch (error) {
          console.error('[Broadcast Progress SSE] Error:', error);
          try {
            sendEvent({ error: 'Internal error', done: true });
            controller.close();
          } catch {
            // Stream already closed
          }
        }
      };

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
