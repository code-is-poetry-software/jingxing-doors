import { Socket as UdpSocket } from "dgram";
import { Socket as TcpSocket } from "net";
import { buildBcdDate, ipToHex } from "./utils";
import funcNames from "./funcNames";
import { crc16xmodem } from "crc";

const { CTL_HIDE_LOG, CTL_ECHO_1, CTL_ECHO_2, CTL_ECHO_3 } = process.env;

const config = {
  hideLog: !!CTL_HIDE_LOG,
  echo1: CTL_ECHO_1 ? +CTL_ECHO_1 : 0,
  echo2: CTL_ECHO_2 ? +CTL_ECHO_2 : 0,
  echo3: CTL_ECHO_3 ? +CTL_ECHO_3 : 0,
};

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
    const head = Buffer.from(
      `80ffff0000${funcCode.toString(16).padStart(2, "0")}aa0000`,
      "hex"
    );
    let body = payload || Buffer.alloc(0);

    const crc = Buffer.from(
      crc16xmodem(Buffer.concat([head, body])).toString(16),
      "hex"
    );

    const funcCodeStr = `0x${funcCode.toString(16).toUpperCase()}`;

    if (!config.hideLog) {
      console.log(
        `[CTL] Func ${funcNames[funcCodeStr]}, controller ${
          this.ip || "all"
        }, payload to send:`,
        payload
      );
    }

    const data = Buffer.concat([head, body, crc]);

    console.log(`[CTL] Data packed`, data);

    return data;
  }

  sendData(funcCode: number, payload?: Buffer) {
    const data = this.packData(funcCode, payload);
    if (this.remoteSocket) {
      return this.remoteSendData(data);
    } else {
      return this.localSendData(data);
    }
  }

  protected remoteSendData(data: Buffer) {
    if (!this.remoteSocket) return;
    const ipData = Buffer.alloc(4);
    const ipHex = ipToHex(this.ip);
    ipData.write(ipHex, "hex");
    this.remoteSocket.write(Buffer.concat([ipData, data]), (err) => {
      if (err) {
        console.error(err);
      }
    });
  }

  localSendData(data: Buffer, isEcho = false) {
    if (!this.localSocket) return;
    if (!this.ip) {
      this.localSocket.setBroadcast(true);
    }
    if (!CTL_HIDE_LOG) {
      console.log(
        `[CTL] Sending local data to ${this.ip || "255.255.255.255"}.`
      );
    }
    this.localSocket.send(
      data,
      0,
      data.byteLength,
      this.port,
      this.ip || "255.255.255.255",
      (err, result) => {
        if (err) {
          console.error(err);
          if (!this.ip && this.localSocket) {
            this.localSocket.setBroadcast(false);
          }
        }
      }
    );

    if (!isEcho && config.echo1) {
      setTimeout(() => {
        this.localSendData(data, true);
        if (config.echo2) {
          setTimeout(() => {
            this.localSendData(data, true);
            if (config.echo3) {
              setTimeout(() => {
                this.localSendData(data, true);
              }, +config.echo3);
            }
          }, +config.echo2);
        }
      }, +config.echo1);
    }
  }

  openDoor(door: number, autoClose = true) {
    this.sendData(0x80, Buffer.from([door, autoClose ? 0 : 1]));
  }

  getDate() {
    this.sendData(0x32);
  }

  setDate(date?: Date) {
    this.sendData(0x30, buildBcdDate(date || new Date()));
  }

  registerCard(cardNo: number, date: string) {
    const payload = Buffer.alloc(12);
    payload.writeUInt32LE(cardNo, 3);
    payload.write(date.replace(/-/g, "").slice(2), 0, "hex");
    this.sendData(0x63, payload);
  }

  deleteCard(cardNo: number) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x64, payload);
  }

  getAuth(cardNo: number) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x5a, payload);
  }

  init() {
    const payload = Buffer.from("55aae11e", "hex");
    this.sendData(0x07, payload);
  }

  setServer() {
    this.sendData(0x85);
  }
}
