import dgram from "dgram";
import { Socket as TcpSocket, AddressInfo } from "net";
import env from "dotenv";
import Controller, {
  ipToHex,
  parseData,
  parseRemoteServerData,
} from "./controller";
import testCommand from "./utils/testCommand";

env.config();

const remotePort = +(process.env.REMOTE_PORT || "") || 8000;
const remoteHost = process.env.REMOTE_HOST || "localhost";
const storeId = process.env.STORE_ID;
const reconnectInterval = +(process.env.RECONNECT_INTERVAL || "") || 5000;
const remoteTcpTimeout = +(process.env.REMOTE_TCP_TIMEOUT || "") || 3.65e6;

let controllerBySerial: { [serial: number]: Controller } = {};

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
  console.log(`[UDP] Got message from ${rinfo.address}:${rinfo.port}.`, msg);
  const message = parseData(msg);
  console.log(
    `[UDP] Parsed message from ${rinfo.address}:${rinfo.port}.`,
    JSON.stringify(message)
  );
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
    `[TCP] Connected to ${address}:${port}, local port: ${client.localPort}.`
  );
  if (client.writable) {
    client.write(`store ${storeId}\r\n`);
  }
  client.setTimeout(remoteTcpTimeout);
});

client.on("timeout", () => {
  console.log("[TCP] Connection timeout.");
  client.destroy(new Error("timeout"));
});

client.on("close", () => {
  if (!remoteHost || !remotePort) return;
  console.log(
    `[TCP] Closed, reconnect in ${reconnectInterval / 1000} seconds.`
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
    console.log(`[TCP] String: "${data.slice(0, -2).toString()}"`);
    return;
  }
  const parsedData = parseRemoteServerData(data);
  const ip = parsedData.ip;

  let controller: Controller;

  controller = new Controller(socket, ip);

  controller.localSendData(data.slice(4));
});
