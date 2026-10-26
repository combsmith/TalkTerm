export interface IPCMain {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void;
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
}

export interface IPCRegistrar {
  register(ipcMain: IPCMain): void;
}

const routerQueues = new WeakMap<object, Promise<void>>();

export function enqueueRouterOperation(
  router: object,
  task: () => Promise<void> | void,
): Promise<void> {
  const previous = routerQueues.get(router);
  const current = previous === undefined ? Promise.resolve(task()) : previous.then(() => task());
  const tracked = current
    .catch(() => undefined)
    .finally(() => {
      if (routerQueues.get(router) === tracked) {
        routerQueues.delete(router);
      }
    });
  routerQueues.set(router, tracked);
  return tracked;
}
