import { getQueueDisplayItems, recallLastQueuedResponse, type QueuedResponse } from './queueManager';

export type QueueSyncPayload = {
  count: number;
  items: string[];
};

export type QueueRecallPayload = {
  text: string | null;
  count: number;
};

export function buildQueueSyncPayload(queue: QueuedResponse[]): QueueSyncPayload {
  return {
    count: queue.length,
    items: getQueueDisplayItems(queue),
  };
}

export function recallQueuedResponseView(queue: QueuedResponse[]): {
  queue: QueuedResponse[];
  payload: QueueRecallPayload;
} {
  const recallResult = recallLastQueuedResponse(queue);
  return {
    queue: recallResult.queue,
    payload: {
      text: recallResult.recalled ? recallResult.recalled.original : null,
      count: recallResult.queue.length,
    },
  };
}
