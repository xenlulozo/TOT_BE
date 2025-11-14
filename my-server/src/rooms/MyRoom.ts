import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { EventKey } from "./eventKey";
import { CorePlayer } from "./core/Player.core";
import { ICreatePlayerDTO, ISetRoomHostDTO } from "./player/dto/createPlayer.DTO";

export class MyRoom extends Room<MyRoomState> {
  maxClients = 40;
  state = new MyRoomState();

  onCreate (options: any) {

    this.onMessage(EventKey.REFRESH_PLAYERS, (client, message) => {
      console.log("🚀 ~ MyRoom ~ onCreate ~ EventKey.REFRESH_PLAYERS:", EventKey.REFRESH_PLAYERS)

    });

    this.onMessage(EventKey.SPIN, (client, message) => {
      console.log("🚀 ~ MyRoom ~ onCreate ~ EventKey.SPIN:", EventKey.SPIN)
  
    });

    this.onMessage(EventKey.START_GAME, (client, message) => {
      console.log("🚀 ~ MyRoom ~ onCreate ~ EventKey.START_GAME:", EventKey.START_GAME)
      // this.state.startGame();
    });

    this.onMessage(EventKey.SET_ROOM_HOST, (client, message : ISetRoomHostDTO) => {
      const {roomId , url} = message
      console.log("🚀 ~ MyRoom ~ onCreate ~ EventKey.SET_ROOM_HOST:", roomId)
      CorePlayer.F_SetRoomHost({
        client: client,
        roomId: roomId,
        state: this.state
      });
      this.broadcast(EventKey.SET_ROOM_HOST, {
        roomId: roomId,
        url: url
      });
    });
  }

  onJoin (client: Client, options: ICreatePlayerDTO) {
    console.log(client.sessionId, "joined!" );
  const player =   CorePlayer.F_CreatePlayer({
      client: client,
      name: options.name ?? "Player " + client.sessionId,
      avatar: options.avatar ?? "",
      players: this.state.players
    });

    // this.broadcast(EventKey.START_GAME , player)
  }

  onLeave (client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");

    CorePlayer.F_RemovePlayer({
      client: client,
      players: this.state.players
    });
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");

    CorePlayer.F_Clear({
      players: this.state.players
    });
  }

}
