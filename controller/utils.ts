import moment from "moment";
import "moment-timezone";
import funcNames from "./funcNames";

export function parseData(data: Buffer) {
  const funcCode = "0x" + data.slice(5, 6).toString("hex").toUpperCase();

  const payload = data.slice(9, -2);
  return { funcCode, ...payloadParser(funcCode, payload) };
}

export function payloadParser(funcCode: string, payload: Buffer) {
  const funcName = funcNames[funcCode] || `Unknown (${funcCode})`;
  const data: Record<string, any> = { funcName, text: "" };
  switch (funcCode) {
    case "0x04":
      Object.assign(data, {
        time: parseBcdDate(payload),
      });
      data.text = data.time;
      break;
    case "0x84":
      const allow = payload.readUInt8(7);
      const door = payload.readUInt8(8);
      const cardNo = payload.readUInt32LE(9);
      const time = payload.slice(1, 6);
      Object.assign(data, {
        allow: !allow,
        door,
        cardNo,
        time: parseBcdDate(time),
      });
      data.text = `${cardNo} ${
        allow ? "pass" : "reject"
      } by ${door} at ${time}.`;
      break;
    default:
      Object.assign(data, {
        data: payload,
      });
  }
  return data as {
    funcName: string;
    text: string;
  };
}

export function parseRemoteServerData(data: Buffer) {
  const ip = hexToIp(data.slice(0, 4).toString("hex"));
  const parsed = { ip, ...parseData(data.slice(4)) };
  // console.log(`[UTL] Parsed remote server data:`, JSON.stringify(parsed));
  return parsed;
}

export function parseBcdDate(bcd: Buffer): Date {
  // console.log("BCD Date:", bcd);
  return moment
    .tz(bcd.toString("hex"), "YYMMDDHHmmss", "Asia/Shanghai")
    .toDate();
}

export function buildBcdDate(date: Date): Buffer {
  const str = moment(date).tz("Asia/Shanghai").format("YYYYMMDDHHmmss");
  return Buffer.from(str, "hex");
}

export function hexStringToDecArray(hexString: string) {
  const matches = hexString.match(/.{1,2}/g);
  if (!matches) {
    return [];
  }
  return matches.map((byteString) => parseInt(byteString, 16));
}

export function decArrayToHexString(decArray: number[]): string {
  const hex = decArray.map((d) => d.toString(16).padStart(2, "0")).join("");
  return hex;
}

export function ipToHex(ip: string): string {
  return decArrayToHexString(ip.split(".").map((d) => +d));
}

export function hexToIp(hex: string): string {
  return hexStringToDecArray(hex).join(".");
}
