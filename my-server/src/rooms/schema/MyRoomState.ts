import { MapSchema, Schema, type } from "@colyseus/schema";


export enum RoomState {
  READY = "READY",
  PLAYING = "PLAYING",
  ENDED = "ENDED"
}

export enum RoundState {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED"
}
export interface IPlayerInfo {
  id: string;
  name: string;
  avatar: string;
  roundState: RoundState;
  isHost: boolean;
}

export class PlayerInfo extends Schema implements IPlayerInfo {
  @type("string") id: string;
  @type("string") name: string;
  @type("string") avatar: string;
  @type(RoundState) roundState: RoundState;
  @type("boolean") isHost: boolean;
}

export class MyRoomState extends Schema {
  @type("string") roomId: string;
  @type(RoomState) state: RoomState = RoomState.READY;
  @type({ map: PlayerInfo }) players = new MapSchema<PlayerInfo>();


  public F_SetroomId(roomId : string){
    this.roomId =roomId
  }
}
