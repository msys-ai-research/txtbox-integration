import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  apiKey: string;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithApiKey<T>(apiKey: string, fn: () => T): T {
  return store.run({ apiKey }, fn);
}

export function getRequestApiKey(): string | undefined {
  return store.getStore()?.apiKey;
}
