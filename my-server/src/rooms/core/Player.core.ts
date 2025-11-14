import { Logger } from "@nestjs/common";
import { CreatePlayerDTO, DisposePlayerDTO, RemovePlayerDTO, SetRoomHostDTO } from "../player/dto/createPlayer.DTO";
import { IPlayerInfo, PlayerInfo, RoundState } from "../schema/MyRoomState";

export class CorePlayer{
    private static readonly logger = new Logger(CorePlayer.name);
 

  public static F_CreatePlayer(payload: CreatePlayerDTO): IPlayerInfo {
   const {client, name, avatar, players} = payload

   const isHost = players.size === 0;

   const player = new PlayerInfo({
    id : client.sessionId,
    name : name,
    avatar : avatar,
    roundState: RoundState.NOT_STARTED,
    isHost: isHost
   });
   players.set(client.sessionId, player);
    return player;
  }

  public static F_RemovePlayer(payload: RemovePlayerDTO): void {
    const {client, players} = payload
    const player = players.get(client.sessionId);
    this.logger.log("🚀 ~ CorePlayer ~ F_RemovePlayer ~ player:", player.id)
    if (player) {
    players.delete(client.sessionId);
   
    }else{
        this.logger.log("🚀 ~ CorePlayer ~ F_RemovePlayer ~ player not found")

    }
  }

  public static F_Clear( payload : DisposePlayerDTO){
    payload.players.clear();

  }

  public static F_SetRoomHost( payload : SetRoomHostDTO){
    const {client, roomId, state} = payload
    const player = state.players.get(client.id);
    if(player && !player.isHost){
        state.F_SetroomId(roomId)
    }
  }
}