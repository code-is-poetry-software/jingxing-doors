const funcResponse: Map<
  string /*ip-funcName, eg: 192.168.1.1-0xAA*/,
  Function
> = new Map();

export function watchFuncResponse(
  ip: string,
  func: string,
  callback: Function
) {
  funcResponse.set(`${ip}-${func}`, callback);
}

export function notifyFuncResponse(
  ip: string,
  func: string,
  storeCode?: string
) {
  funcResponse.get(`${storeCode ? `${storeCode}-` : ""}${ip}-${func}`)?.();
}
