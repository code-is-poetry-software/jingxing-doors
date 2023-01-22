import { Socket as UdpSocket } from "dgram";
import { Socket as TcpSocket } from "net";
import { buildBcdDate, ipToHex, parseData } from "./utils";
import { crc16xmodem } from "crc";
import { watchFuncResponse } from "./funcResponse";

const { COMMAND_TIMEOUT } = process.env;

const config = { commandTimeout: COMMAND_TIMEOUT ? +COMMAND_TIMEOUT : 30 };

export default class Controller {
  ip: string;
  port: number;
  serial?: number;
  localSocket?: UdpSocket;
  remoteSocket?: TcpSocket;
  serverIp?: string;
  serverPort?: number;

  constructor(socket: TcpSocket | UdpSocket, ip = "", port = 6767) {
    this.ip = ip;
    this.port = port;
    if (socket instanceof UdpSocket) {
      this.localSocket = socket;
    } else {
      this.remoteSocket = socket;
      if (this.serverIp || this.serverPort) {
        throw new Error("Server ip and port only available for local mode.");
      }
    }
  }

  protected packData(funcCode: number, payload?: Buffer) {
    const funcCodeHex = funcCode.toString(16).padStart(2, "0");
    const funcCodeStr = "0x" + funcCodeHex.toUpperCase();

    const head = Buffer.from(`80ffff0000${funcCodeHex}aa0000`, "hex");

    let body = payload || Buffer.alloc(0);

    const crc = Buffer.from(
      crc16xmodem(Buffer.concat([head, body])).toString(16),
      "hex"
    );

    // console.log(
    //   `[CTL] Func: ${funcNames[funcCodeStr]}(${funcCodeStr}), controller ${
    //     this.ip || "all"
    //   }, payload to send:`,
    //   payload
    // );

    const data = Buffer.concat([head, body, crc]);

    // console.log(`[CTL] Data packed`, data);

    return data;
  }

  async sendData(funcCode: number, payload?: Buffer) {
    const data = this.packData(funcCode, payload);
    try {
      if (this.remoteSocket) {
        return await this.remoteSendData(data);
      } else {
        return await this.localSendData(data);
      }
    } catch (e) {
      console.error(`[CTL] ${e}.`);
      return;
    }
  }

  protected async remoteSendData(data: Buffer) {
    if (!this.remoteSocket) return;
    const ipData = Buffer.alloc(4);
    const ipHex = ipToHex(this.ip);
    ipData.write(ipHex, "hex");

    const parsedData = parseData(data);
    const target = `${this.remoteSocket.remoteAddress?.replace(
      /^::ffff:/,
      ""
    )} ${this.ip} ${parsedData.funcName} (${parsedData.funcCode})`;
    const key = `${this.remoteSocket.remoteAddress?.replace(/^::ffff:/, "")}-${
      this.ip
    }-${parsedData.funcCode}`;
    console.log(`[CTL] => ${target}`);

    return new Promise((resolve, reject) => {
      this.remoteSocket?.write(Buffer.concat([ipData, data]), (err) => {
        if (err) {
          reject(`${target} ${err.message}`);
        }
      });
      watchFuncResponse(key, resolve);
      setTimeout(() => {
        reject(`${target} timeout after ${config.commandTimeout} seconds`);
      }, config.commandTimeout * 1e3);
    });
  }

  async localSendData(data: Buffer) {
    if (!this.localSocket) return;
    if (!this.ip) {
      this.localSocket.setBroadcast(true);
    }
    const parsedData = parseData(data);
    const target = `${this.ip} ${parsedData.funcName} (${parsedData.funcCode})`;
    const key = `${this.ip}-${parsedData.funcCode}`;
    if (process.env.DEBUG) {
      console.log(`[UDP] => ${this.ip}`, data);
    }
    console.log(`[UDP] => ${target}`);
    this.localSocket.send(
      data,
      0,
      data.byteLength,
      this.port,
      this.ip || "255.255.255.255",
      (err) => {
        if (err) {
          console.error(err);
          if (!this.ip && this.localSocket) {
            this.localSocket.setBroadcast(false);
          }
        }
      }
    );

    if (!this.ip) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      watchFuncResponse(key, resolve);
      setTimeout(() => {
        reject(`timeout after ${config.commandTimeout} seconds`);
      }, config.commandTimeout * 1e3);
    });
  }

  async openDoor(door: number, autoClose = true) {
    await this.sendData(0x80, Buffer.from([door, autoClose ? 0 : 1]));
  }

  async registerCard(cardNo: number, date: string) {
    const payload = Buffer.alloc(24);
    payload.writeUInt32LE(cardNo, 3);
    payload.write(date.replace(/-/g, "").slice(2), 0, "hex");
    payload.write("ffffffff", 20, "hex");
    await this.sendData(0x63, payload);
  }

  async deleteCard(cardNo: number) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(cardNo, 0);
    await this.sendData(0x64, payload);
  }

  async init() {
    const payload = Buffer.from("55aae11e", "hex");
    await this.sendData(0x07, payload);
  }

  async enableRealtime() {
    await this.sendData(0x85);
  }

  async disableRealtime() {
    await this.sendData(0x86);
  }

  async readTime() {
    await this.sendData(0x04);
  }

  async setTime() {
    await this.sendData(0x05, buildBcdDate(new Date()));
  }
}
