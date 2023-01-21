const funcResponse: Map<
  string /*ip-funcName, eg: 192.168.1.1-0xAA*/,
  Function
> = new Map();

export function watchFuncResponse(key: string, callback: Function) {
  funcResponse.set(key, callback);
}

export function notifyFuncResponse(key: string) {
  funcResponse.get(key)?.();
}
