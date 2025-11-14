import { Client } from "colyseus";
import { MyRoomState, PlayerInfo } from "../../schema/MyRoomState";
import { MapSchema, Schema, type } from "@colyseus/schema";

export class CreatePlayerDTO {
    client :  Client<any, any>;
    name: string;
    avatar: string;
    players : MapSchema<PlayerInfo>;
}

export interface ICreatePlayerDTO {
    name?: string;
    avatar?: string;
}

export interface RemovePlayerDTO {
    client: Client<any, any>;
    players: MapSchema<PlayerInfo>;
}

export interface DisposePlayerDTO {
    players: MapSchema<PlayerInfo>;
}

export interface SetRoomHostDTO {
    client: Client<any, any>;
    roomId: string;
    state : MyRoomState
}


export interface ISetRoomHostDTO {
    roomId: string;
    url : string
}