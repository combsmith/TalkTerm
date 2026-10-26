export interface IPCMain {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void;
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => void): void;
}

export interface IPCRegistrar {
  register(ipcMain: IPCMain): void;
}

const routerQueues = new WeakMap<object, Promise<void>>();
const routerGenerations = new WeakMap<object, number>();

export function cancelRouterOperations(router: object): void {
  const nextGen = (routerGenerations.get(router) ?? 0) + 1;
  routerGenerations.set(router, nextGen);
  routerQueues.delete(router);
}

export function enqueueRouterOperation(
  router: object,
  task: () => Promise<void> | void,
  options?: { cancellable?: boolean },
): Promise<void> {
  const enqueuedGen = routerGenerations.get(router) ?? 0;
  const previous = routerQueues.get(router);
  const runIfActive = (): Promise<void> | void => {
    if (options?.cancellable === true && (routerGenerations.get(router) ?? 0) !== enqueuedGen) {
      return;
    }
    return task();
  };
  const current =
    previous === undefined ? Promise.resolve(runIfActive()) : previous.then(runIfActive);
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
