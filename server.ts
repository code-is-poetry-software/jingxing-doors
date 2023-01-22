import dgram from "dgram";
import { Socket as TcpSocket } from "net";
import env from "dotenv";
import Controller, {
  ipToHex,
  parseData,
  parseRemoteServerData,
} from "./controller";
import testCommand from "./utils/testCommand";
import { notifyFuncResponse } from "./controller/funcResponse";

env.config();

const remotePort = +(process.env.REMOTE_PORT || "") || 8000;
const remoteHost = process.env.REMOTE_HOST || "localhost";
const storeId = process.env.STORE_ID;
const reconnectInterval = +(process.env.RECONNECT_INTERVAL || "") || 5000;
const remoteTcpTimeout = +(process.env.REMOTE_TCP_TIMEOUT || "") || 3.65e6;
const debug = !!process.env.DEBUG;

const socket = dgram.createSocket("udp4"); // local network using udp
const client = new TcpSocket(); // remote network using tcp

console.log(`[TCP] Connecting ${remoteHost}:${remotePort}...`);
client.connect(remotePort, remoteHost);
client.setTimeout(1000);

socket.on("error", (err) => {
  console.log(`[UDP] Error:\n${err.stack}.`);
  socket.close();
});

// pass door message to remote server
socket.on("message", (msg, rinfo) => {
  if (debug) {
    console.log(`[UDP] ${rinfo.address}:${rinfo.port}`, msg);
  }
  const message = parseData(msg);
  console.log(
    `[UDP] ${rinfo.address}:`,
    `${message.funcName} (${message.funcCode})`,
    message.text
  );
  notifyFuncResponse(`${rinfo.address}-${message.funcCode}`);
  if (client.writable) {
    const ipData = Buffer.alloc(4);
    const ipHex = ipToHex(rinfo.address);
    ipData.write(ipHex, "hex");
    client.write(Buffer.concat([ipData, msg]), (err) => {
      if (err) {
        console.error(err.message);
        return;
      }
    });
  }
});

client.on("connect", () => {
  const address = client.remoteAddress;
  const port = client.remotePort;
  console.log(
    `[TCP] Connected to ${address}:${port}, local port: ${client.localPort}, timeout ${remoteTcpTimeout}.`
  );
  if (client.writable) {
    client.write(`store ${storeId}\r\n`);
  }
  client.setTimeout(remoteTcpTimeout * 2);
});

client.on("timeout", () => {
  console.log("[TCP] Connection timeout.");
  client.destroy(new Error("timeout"));
});

client.on("close", (isError) => {
  if (!remoteHost || !remotePort) return;
  console.log(
    `[TCP] Closed${isError ? " for transmission error" : ""}, reconnect in ${
      reconnectInterval / 1000
    } seconds.`
  );
  setTimeout(() => {
    client.connect(remotePort, remoteHost);
  }, reconnectInterval);
});

client.on("error", (err) => {
  console.error(`[TCP] Error: ${err.message}.`);
});

// pass remote serve data to door
client.on("data", async (data) => {
  // console.log(`[TCP] got remote data\n`, data);
  if (data.slice(-2).toString() === "\r\n") {
    const str = data.slice(0, -2).toString();
    console.log(`[TCP] Got "${str}"`);
    if (str.match(/^PING /)) {
      const [, nonce, storeCode] = str.split(" ");
      setTimeout(() => {
        client.write(
          `PONG ${nonce} ${storeCode} ${new Date().toLocaleTimeString()}\r\n`
        );
      }, 10);
    }
    return;
  }
  const parsedData = parseRemoteServerData(data);
  const ip = parsedData.ip;

  let controller: Controller;

  controller = new Controller(socket, ip);

  try {
    await controller.localSendData(data.slice(4));
  } catch (err) {
    console.error(
      `[UDP] ${ip} ${parsedData.funcName} (${parsedData.funcCode}) ${err}.`
    );
  }
});
