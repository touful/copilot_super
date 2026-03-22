export type QueuedResponse = {
  original: string;
  full: string;
};

type RecallQueueResult = {
  queue: QueuedResponse[];
  recalled: QueuedResponse | null;
};

export const MAX_QUEUE_SIZE = 50;

export function enqueueResponse(
  queue: QueuedResponse[],
  item: QueuedResponse
): QueuedResponse[] {
  const nextQueue = [...queue];

  if (nextQueue.length >= MAX_QUEUE_SIZE) {
    nextQueue.shift();
  }

  nextQueue.push(item);
  return nextQueue;
}

export function shiftQueuedResponse(queue: QueuedResponse[]): {
  queue: QueuedResponse[];
  item: QueuedResponse | null;
} {
  if (queue.length === 0) {
    return { queue, item: null };
  }

  const nextQueue = [...queue];
  const item = nextQueue.shift() || null;
  return { queue: nextQueue, item };
}

export function recallLastQueuedResponse(queue: QueuedResponse[]): RecallQueueResult {
  if (queue.length === 0) {
    return { queue, recalled: null };
  }

  const nextQueue = [...queue];
  const recalled = nextQueue.pop() || null;
  return { queue: nextQueue, recalled };
}

export function getQueueDisplayItems(queue: QueuedResponse[]): string[] {
  return queue.map((item) => item.original);
}

export function clearQueuedResponses(): QueuedResponse[] {
  return [];
}
