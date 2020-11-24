import { Socket } from "dgram";
import YbCtl from "../controller";

export default function testCommand(socket: Socket) {
  const ctl = new YbCtl(socket, "192.168.3.250");
  // ctl.registerCard(1234567891, "2020-11-24");
  // ctl.deleteCard(1234567890);
  ctl.init();
  // ctl.setServer();
}
