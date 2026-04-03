import { createEventsQueue, type Queue } from "@re/queue";
import type { ProcessEventJobData } from "@re/queue";

let _queue: Queue<ProcessEventJobData> | null | undefined;

/** `null` = Redis não configurado ou erro ao criar fila. */
export function getEventsQueue(): Queue<ProcessEventJobData> | null {
  if (_queue === undefined) {
    try {
      _queue = createEventsQueue();
    } catch {
      _queue = null;
    }
  }
  return _queue;
}
