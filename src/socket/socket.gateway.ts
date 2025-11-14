import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlayerStatus, RoomSnapshot, RoomRemovalResult, SocketService } from './socket.service';
import { PlayerAvatarUpdatedPayload, SocketClientEvent, SocketServerEvent } from './socker.enum';
import {
  TotChoiceResult,
  TotFinishResult,
  TotGameCore,
  TotGameStartResult,
  TotPlayer,
  TotPlayerSelectedEvent,
  TotOptionSelectedEvent,
  TotSelectionResult,
  TotSpinningEvent,
  TotPromptType,
} from '../game/tot/tot-game.core';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(SocketGateway.name);
  private readonly outOfTurnTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly socketService: SocketService,
    private readonly totGame: TotGameCore,
  ) {
    this.totGame.on('playerSelected', this.handleTotAutoSelected);
    this.totGame.on('optionSelected', this.handleTotOptionSelected);
    this.totGame.on('spinning', this.handleTotSpinning);
  }

  onModuleDestroy() {
    this.totGame.off('playerSelected', this.handleTotAutoSelected);
    this.totGame.off('optionSelected', this.handleTotOptionSelected);
    this.totGame.off('spinning', this.handleTotSpinning);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const rooms = this.socketService.removeClientFromAllRooms(client.id);
    for (const roomId of rooms) {
      const snapshot = this.socketService.getRoomSnapshot(roomId);
      this.server.to(roomId).emit(SocketServerEvent.PlayerLeft, { clientId: client.id, hostId: snapshot?.hostId });
      this.broadcastRoomSnapshot(roomId, snapshot);
    }
  }

  @SubscribeMessage(SocketClientEvent.JoinRoom)
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; data?: Record<string, unknown> },
  ): { event: 'joined'; data: RoomSnapshot | null; isHost: boolean } {
    const { roomId, data = {} } = payload;

    const normalizedRoomId = this.F_ParseRooom(roomId);
    client.join(normalizedRoomId);
    const isHost = this.socketService.registerPlayer(normalizedRoomId, client, data);

    const snapshot = this.socketService.getRoomSnapshot(normalizedRoomId);
    this.broadcastRoomSnapshot(normalizedRoomId, snapshot);
    return { event: 'joined', data: snapshot, isHost };
  }
F_ParseRooom(roomId : any){
return String(roomId);

}
  @SubscribeMessage(SocketClientEvent.TotStartGame)
  handleTotStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roomId: string },
  ): { event: 'tot:startGame:ack'; data: TotGameStartResult } {
    console.log("🚀 ~ SocketGateway ~ handleTotStartGame ~ payload:", payload)
    const { roomId : roomIdString } = payload;
    const roomId = this.F_ParseRooom(roomIdString);
    const snapshot = this.socketService.getRoomSnapshot(roomId);
    const players: TotPlayer[] =
      snapshot?.players.map((player) => {
        const nameValue = typeof player.data['name'] === 'string' ? (player.data['name'] as string) : undefined;

        return {
          id: player.id,
          name: nameValue,
          data: player.data,
          isHost: player.isHost,
        };
      }) ?? [];

    const result = this.totGame.startGame(roomId, players);

    if (result.started) {
      this.clearOutOfTurnTimer(roomId);
      this.socketService.resetPlayerStatuses(roomId, PlayerStatus.Pending);
      this.broadcastRoomSnapshot(roomId);
      this.server.to(roomId).emit(SocketServerEvent.TotGameStarted, {
        startedBy: client.id,
        firstPlayer: result.firstPlayer,
        remainingCount: result.remainingCount,
        totalPlayers: result.totalPlayers,
        startedAt: result.startedAt,
        autoSelectDelayMs: result.autoSelectDelayMs,
      });
    } else {
      this.logger.warn(`TOT game start rejected in room ${roomId}: insufficient participants`);
    }

    return { event: 'tot:startGame:ack', data: result };
  }

  @SubscribeMessage(SocketClientEvent.TotDrawNext)
  handleTotDrawNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): { event: 'tot:drawNext:ack'; data: TotSelectionResult } {
    const { roomId : roomIdString } = payload;
    const roomId = this.F_ParseRooom(roomIdString);
    this.clearOutOfTurnTimer(roomId);
    const result = this.totGame.drawNextPlayer(roomId);

    this.emitTotPlayerSelection(roomId, result, {
      requestedBy: client.id,
      source: 'manual',
    });

    return { event: 'tot:drawNext:ack', data: result };
  }

  @SubscribeMessage(SocketClientEvent.TotChooseOption)
  handleTotChooseOption(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; type: TotPromptType },
  ): { event: 'tot:chooseOption:ack'; data: TotChoiceResult } {
    const { type } = payload;
    const { roomId : roomIdString } = payload;
    const roomId = this.F_ParseRooom(roomIdString);
    const result = this.totGame.chooseOption(roomId, client.id, type);
    if (!result.success) {
      this.logger.warn(`Player ${client.id} failed to choose ${type} in room ${roomId}: ${result.reason}`);
    }

    return { event: 'tot:chooseOption:ack', data: result };
  }

  @SubscribeMessage(SocketClientEvent.TotFinishTurn)
  handleTotFinishTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): { event: 'tot:finishTurn:ack'; data: TotFinishResult & { triggeredBy: string } } {
    const { roomId : roomIdString } = payload;
    const roomId = this.F_ParseRooom(roomIdString);
    const result = this.totGame.finishTurn(roomId);

    this.server.to(roomId).emit(SocketServerEvent.TotTurnFinished, {
      triggeredBy: client.id,
      scheduled: result.scheduled,
      nextInMs: result.nextInMs,
      remainingCount: result.remainingCount,
      totalPlayers: result.totalPlayers,
    });

    this.server.to(roomId).emit(SocketServerEvent.TotSpinning, {
      durationMs: 5000,
    });

    if (this.socketService.setPlayerStatus(roomId, client.id, PlayerStatus.Completed)) {
      this.broadcastRoomSnapshot(roomId);
    }

    if (result.remainingCount === 0) {
      this.clearOutOfTurnTimer(roomId);
      const timer = setTimeout(() => {
        this.server.to(roomId).emit(SocketServerEvent.TotOutOfTurn, {
          triggeredBy: client.id,
        });
        this.clearOutOfTurnTimer(roomId);
      }, 5000);
      this.outOfTurnTimers.set(roomId, timer);
    }

    return {
      event: 'tot:finishTurn:ack',
      data: {
        ...result,
        triggeredBy: client.id,
      },
    };
  }

  @SubscribeMessage(SocketClientEvent.LeaveRoom)
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const normalizedRoomId = this.F_ParseRooom(roomId);
    client.leave(normalizedRoomId);
    this.socketService.unregisterPlayer(normalizedRoomId, client.id);
    const snapshot = this.socketService.getRoomSnapshot(normalizedRoomId);
    this.server.to(roomId).emit(SocketServerEvent.PlayerLeft, { clientId: client.id, hostId: snapshot?.hostId });
    this.broadcastRoomSnapshot(roomId, snapshot);
  }

  @SubscribeMessage(SocketClientEvent.UpdateMeta)
  handleUpdateMeta(
    @MessageBody()
    payload: {
      roomId: string;
      meta: Record<string, unknown>;
    },
  ) {
    console.log("🚀 ~ SocketGateway ~ handleUpdateMeta ~ payload:", payload)
    const { roomId, meta } = payload;
    const normalizedRoomId = this.F_ParseRooom(roomId);
    this.socketService.updateMeta(normalizedRoomId, meta);
    this.broadcastRoomSnapshot(normalizedRoomId);
  }

  @SubscribeMessage(SocketClientEvent.PlayerAction)
  handlePlayerAction(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roomId: string; action: string; data?: Record<string, unknown> },
  ) {
    console.log("🚀 ~ SocketGateway ~ handlePlayerAction ~ payload:", payload)
    const { roomId, action, data = {} } = payload;
    const normalizedRoomId = this.F_ParseRooom(roomId);
    this.server.to(normalizedRoomId).emit(SocketServerEvent.PlayerAction, {
      clientId: client.id,
      action,
      data,
    });
  }

  @SubscribeMessage(SocketClientEvent.PlayerAvatarUpdate)
  handlePlayerAvatarUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; avatar: string },
  ): {
    event: 'player:avatarUpdate:ack';
    data:
      | ({ success: true } & PlayerAvatarUpdatedPayload)
      | { success: false; reason: 'room_id_required' | 'avatar_required' | 'player_not_found' };
  } {
    const { roomId, avatar } = payload;

    if (!roomId) {
      return {
        event: 'player:avatarUpdate:ack',
        data: { success: false, reason: 'room_id_required' },
      };
    }

    const normalizedAvatar = typeof avatar === 'string' ? avatar.trim() : '';
    if (!normalizedAvatar) {
      return {
        event: 'player:avatarUpdate:ack',
        data: { success: false, reason: 'avatar_required' },
      };
    }

    const updated = this.socketService.updatePlayerAvatar(roomId, client.id, normalizedAvatar);
    if (!updated) {
      return {
        event: 'player:avatarUpdate:ack',
        data: { success: false, reason: 'player_not_found' },
      };
    }

    const response: PlayerAvatarUpdatedPayload & { success: true } = {
      success: true,
      playerId: client.id,
      avatar: normalizedAvatar,
    };

    this.broadcastRoomSnapshot(roomId);
    this.server.to(roomId).emit(SocketServerEvent.PlayerAvatarUpdated, {
      playerId: response.playerId,
      avatar: response.avatar,
    });

    return {
      event: 'player:avatarUpdate:ack',
      data: response,
    };
  }

  @SubscribeMessage(SocketClientEvent.PlayerRename)
  handlePlayerRename(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; name: string },
  ): {
    event: 'player:rename:ack';
    data:
      | { success: true; name: string }
      | { success: false; reason: 'room_id_required' | 'name_required' | 'player_not_found' };
  } {
    const { roomId, name } = payload;
    if (!roomId) {
      return {
        event: 'player:rename:ack',
        data: { success: false, reason: 'room_id_required' },
      };
    }

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return {
        event: 'player:rename:ack',
        data: { success: false, reason: 'name_required' },
      };
    }

    const updated = this.socketService.updatePlayerData(roomId, client.id, { name: normalizedName });
    if (!updated) {
      return {
        event: 'player:rename:ack',
        data: { success: false, reason: 'player_not_found' },
      };
    }

    this.broadcastRoomSnapshot(roomId);
    this.server.to(roomId).emit(SocketServerEvent.PlayerRenamed, {
      playerId: client.id,
      name: normalizedName,
    });

    return {
      event: 'player:rename:ack',
      data: { success: true, name: normalizedName },
    };
  }

  @SubscribeMessage(SocketClientEvent.TotTurnOptionSelected)
  handleTotTurnOptionSelected(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; type: TotPromptType  ,content: string},
  ) {
    console.log("🚀 ~ SocketGateway ~ handleTotTurnOptionSelected ~ payload:", payload)
    const { roomId : roomIdString, type  , content} = payload;
    const normalizedRoomId = this.F_ParseRooom(roomIdString);
    this.server.to(normalizedRoomId).emit(SocketServerEvent.TotTurnOptionSelected, {
      clientId: client.id,
      type,
      content
    });
  }

  @SubscribeMessage(SocketClientEvent.TotGetGameState)
  handleTotGetGameState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): {
    event: 'tot:gameState:ack';
    data: {
      roomId: string;
      playerCount: number;
      snapshot: RoomSnapshot | null;
    };
  } {
    const { roomId } = payload;
    const snapshot = this.socketService.getRoomSnapshot(roomId);
    const response = {
      roomId,
      playerCount: snapshot?.players.length ?? 0,
      snapshot,
    };

    this.server.to(roomId).emit(SocketServerEvent.TotGameState, response);

    return {
      event: 'tot:gameState:ack',
      data: response,
    };
  }

  private readonly handleTotAutoSelected = (payload: TotPlayerSelectedEvent) => {
    const { roomId, result } = payload;
    this.emitTotPlayerSelection(roomId, result, { source: payload.source });
  };

  private readonly handleTotOptionSelected = (payload: TotOptionSelectedEvent) => {
    const { roomId, result } = payload;
    this.server.to(roomId).emit(SocketServerEvent.TotTurnOptionSelected, {
      playerId: result.playerId,
      type: result.type,
      prompt: result.prompt,
      remainingPrompts: result.remainingPrompts,
    });
  };

  private readonly handleTotSpinning = (payload: TotSpinningEvent) => {
    const { roomId, durationMs } = payload;
    this.server.to(roomId).emit(SocketServerEvent.TotSpinning, {
      durationMs,
    });
  };

  @SubscribeMessage(SocketClientEvent.TotControlGame)
  handleTotControlGame(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roomId: string; action: 'end' | 'restart' },
  ): {
    event: 'tot:controlGame:ack';
    data:
      | { success: true; action: 'end'; removed: RoomRemovalResult | null }
      | {
          success: true;
          action: 'restart';
          restartResult: TotGameStartResult | null;
        }
      | { success: false; reason: string };
  } {
    const { roomId : roomIdString, action } = payload;
    const roomId = this.F_ParseRooom(roomIdString);

    if (!roomId) {
      return {
        event: 'tot:controlGame:ack',
        data: { success: false, reason: 'room_id_required' },
      };
    }

    const snapshot = this.socketService.getRoomSnapshot(roomId);
    if (!snapshot) {
      return {
        event: 'tot:controlGame:ack',
        data: { success: false, reason: 'room_not_found' },
      };
    }

    if (action === 'end') {
      this.totGame.reset(roomId);
      this.clearOutOfTurnTimer(roomId);
      const removalResult = this.socketService.removeRoom(roomId);
      this.server.to(roomId).emit(SocketServerEvent.TotGameEnded, {
        triggeredBy: client.id,
      });
      this.server.in(roomId).socketsLeave(roomId);
      return {
        event: 'tot:controlGame:ack',
        data: { success: true, action: 'end', removed: removalResult },
      };
    }

    if (action === 'restart') {
      this.totGame.reset(roomId);
      this.clearOutOfTurnTimer(roomId);
      this.socketService.resetPlayerStatuses(roomId, PlayerStatus.Pending);
      this.broadcastRoomSnapshot(roomId);

      const players: TotPlayer[] = snapshot.players.map((player) => {
        const nameValue = typeof player.data['name'] === 'string' ? (player.data['name'] as string) : undefined;
        return { id: player.id, name: nameValue, data: player.data, isHost: player.isHost };
      });

    //   const result = this.totGame.startGame(roomId, players);
    //   if (result.started) {
    //     this.server.to(roomId).emit(SocketServerEvent.TotGameRestarted, {
    //       triggeredBy: client.id,
    //       firstPlayer: result.firstPlayer,
    //       remainingCount: result.remainingCount,
    //       totalPlayers: result.totalPlayers,
    //       startedAt: result.startedAt,
    //       autoSelectDelayMs: result.autoSelectDelayMs,
    //     });
    //   } else {
    //     this.logger.warn(`TOT restart failed for room ${roomId}: insufficient participants`);
    //   }

    //   return {
    //     event: 'tot:controlGame:ack',
    //     data: { success: true, action: 'restart', restartResult: result.started ? result : null },
    //   };
    }

    return {
      event: 'tot:controlGame:ack',
      data: { success: false, reason: 'invalid_action' },
    };
  }

  private emitTotPlayerSelection(roomId: string, result: TotSelectionResult, meta: { requestedBy?: string; source: 'auto' | 'manual' }) {
    if (result.player) {
      if (this.socketService.setPlayerStatus(roomId, result.player.id, PlayerStatus.Active)) {
        this.broadcastRoomSnapshot(roomId);
      }
      this.server.to(roomId).emit(SocketServerEvent.TotPlayerSelected, {
        player: result.player,
        remainingCount: result.remainingCount,
        totalPlayers: result.totalPlayers,
        exhausted: result.exhausted,
        requestedBy: meta.requestedBy,
        source: meta.source,
        promptOptions: result.promptOptions,
        nextAutoSelectionInMs: null,
      });
    } else {
      this.server.to(roomId).emit(SocketServerEvent.TotPlayerPoolExhausted, {
        requestedBy: meta.requestedBy,
        source: meta.source,
      });
    }
  }

  private broadcastRoomSnapshot(roomId: string, snapshot?: RoomSnapshot | null) {
    const payload = snapshot ?? this.socketService.getRoomSnapshot(roomId);
    if (payload) {
      this.server.to(roomId).emit(SocketServerEvent.RoomUpdate, payload);
    }
  }

  private clearOutOfTurnTimer(roomId: string) {
    const t = this.outOfTurnTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      this.outOfTurnTimers.delete(roomId);
    }
  }
}
