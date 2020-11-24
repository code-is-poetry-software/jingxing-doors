import dgram from "dgram";
import { Socket as TcpSocket, AddressInfo } from "net";
import getLocalIp from "./utils/getLocalIp";
import env from "dotenv";
import Controller from "./controller";
import { parseData } from "./controller";
import testCommand from "./utils/testCommand";

env.config();

export type { Controller as JxCtl };
export { parseData };

const localIp = getLocalIp();
console.log(`[DMN] Local ip address is ${localIp}.`);

const localPort = +(process.env.LOCAL_PORT || 6000);
const remotePort = +(process.env.REMOTE_PORT || 8000);
const remoteHost = process.env.REMOTE_HOST;
const storeId = process.env.STORE_ID;
const reconnectInterval = +(process.env.RECONNECT_INTERVAL || "") || 5000;

let controllerBySerial: { [serial: number]: Controller } = {};

const socket = dgram.createSocket("udp4"); // local network using udp
const client = new TcpSocket(); // remote network using tcp

socket.on("error", (err) => {
  console.log(`[UDP] Error:\n${err.stack}.`);
  socket.close();
});

socket.on("message", (msg, rinfo) => {
  console.log(`[UDP] Got message from ${rinfo.address}:${rinfo.port}.`, msg);
  const message = parseData(msg);
  console.log(
    `[UDP] Parsed message from ${rinfo.address}:${rinfo.port}.`,
    JSON.stringify(message)
  );
  if (client.writable) {
    client.write(msg, (err) => {
      if (err) {
        console.error(err.message);
        return;
      }
    });
  }
});

socket.on("listening", async () => {
  const address = socket.address() as AddressInfo;
  console.log(`[UDP] Listening ${address.address}:${address.port}.`);
  if (!remoteHost || !remotePort) return;
  console.log(`[TCP] Connecting ${remoteHost}:${remotePort}...`);
  client.connect(remotePort, remoteHost);
  client.setTimeout(1000);
});

socket.bind(localPort);

// testCommand(socket);

client.on("connect", () => {
  const address = client.remoteAddress;
  const port = client.remotePort;
  console.log(
    `[TCP] Connected to ${address}:${port}, local port: ${client.localPort}.`
  );
  if (client.writable) {
    client.write(`store ${storeId}\r\n`);
  }
  client.setTimeout(360000);
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

client.on("data", async (data) => {
  // console.log(`[TCP] got remote data\n`, data);
  if (data.length !== 64) {
    console.log("[TCP] Data:", data.toString());
    return;
  }
  const parsedData = parseData(data);
  const serial = parsedData.serial;

  let controller: Controller;

  if (!serial) {
    controller = new Controller(socket);
  } else if (controllerBySerial[serial]) {
    controller = controllerBySerial[serial];
  } else {
    console.error(`[DMN] Controller ${serial} not found。`);
    return;
  }

  controller.sendData(
    data.readUInt8(1),
    Buffer.from(
      data
        .slice(8)
        .toString("hex")
        .replace(/(00)*$/, ""),
      "hex"
    )
  );
});
