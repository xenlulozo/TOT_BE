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
      this.server.to(roomId).emit('playerLeft', { clientId: client.id, hostId: snapshot?.hostId });
      this.broadcastRoomSnapshot(roomId, snapshot);
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; data?: Record<string, unknown> },
  ): { event: 'joined'; data: RoomSnapshot | null; isHost: boolean } {
    const { roomId, data = {} } = payload;
    client.join(roomId);
    const isHost = this.socketService.registerPlayer(roomId, client, data);

    const snapshot = this.socketService.getRoomSnapshot(roomId);
    this.broadcastRoomSnapshot(roomId, snapshot);
    return { event: 'joined', data: snapshot, isHost };
  }

  @SubscribeMessage('tot:startGame')
  handleTotStartGame(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roomId: string },
  ): { event: 'tot:startGame:ack'; data: TotGameStartResult } {
    const { roomId } = payload;
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
      this.socketService.resetPlayerStatuses(roomId, PlayerStatus.Pending);
      this.broadcastRoomSnapshot(roomId);
      this.server.to(roomId).emit('tot:gameStarted', {
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

  @SubscribeMessage('tot:drawNext')
  handleTotDrawNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): { event: 'tot:drawNext:ack'; data: TotSelectionResult } {
    const { roomId } = payload;
    const result = this.totGame.drawNextPlayer(roomId);

    this.emitTotPlayerSelection(roomId, result, {
      requestedBy: client.id,
      source: 'manual',
    });

    return { event: 'tot:drawNext:ack', data: result };
  }

  @SubscribeMessage('tot:chooseOption')
  handleTotChooseOption(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; type: TotPromptType },
  ): { event: 'tot:chooseOption:ack'; data: TotChoiceResult } {
    const { roomId, type } = payload;
    const result = this.totGame.chooseOption(roomId, client.id, type);
    if (!result.success) {
      this.logger.warn(`Player ${client.id} failed to choose ${type} in room ${roomId}: ${result.reason}`);
    }

    return { event: 'tot:chooseOption:ack', data: result };
  }

  @SubscribeMessage('tot:finishTurn')
  handleTotFinishTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): { event: 'tot:finishTurn:ack'; data: TotFinishResult & { triggeredBy: string } } {
    const { roomId } = payload;
    const result = this.totGame.finishTurn(roomId);

    this.server.to(roomId).emit('tot:turnFinished', {
      triggeredBy: client.id,
      scheduled: result.scheduled,
      nextInMs: result.nextInMs,
      remainingCount: result.remainingCount,
      totalPlayers: result.totalPlayers,
    });

    if (this.socketService.setPlayerStatus(roomId, client.id, PlayerStatus.Completed)) {
      this.broadcastRoomSnapshot(roomId);
    }

    return {
      event: 'tot:finishTurn:ack',
      data: {
        ...result,
        triggeredBy: client.id,
      },
    };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    client.leave(roomId);
    this.socketService.unregisterPlayer(roomId, client.id);
    const snapshot = this.socketService.getRoomSnapshot(roomId);
    this.server.to(roomId).emit('playerLeft', { clientId: client.id, hostId: snapshot?.hostId });
    this.broadcastRoomSnapshot(roomId, snapshot);
  }

  @SubscribeMessage('updateMeta')
  handleUpdateMeta(
    @MessageBody()
    payload: {
      roomId: string;
      meta: Record<string, unknown>;
    },
  ) {
    const { roomId, meta } = payload;
    this.socketService.updateMeta(roomId, meta);
    this.broadcastRoomSnapshot(roomId);
  }

  @SubscribeMessage('playerAction')
  handlePlayerAction(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { roomId: string; action: string; data?: Record<string, unknown> },
  ) {
    const { roomId, action, data = {} } = payload;
    this.server.to(roomId).emit('playerAction', {
      clientId: client.id,
      action,
      data,
    });
  }

  private readonly handleTotAutoSelected = (payload: TotPlayerSelectedEvent) => {
    const { roomId, result } = payload;
    this.emitTotPlayerSelection(roomId, result, { source: payload.source });
  };

  private readonly handleTotOptionSelected = (payload: TotOptionSelectedEvent) => {
    const { roomId, result } = payload;
    this.server.to(roomId).emit('tot:turnOptionSelected', {
      playerId: result.playerId,
      type: result.type,
      prompt: result.prompt,
      remainingPrompts: result.remainingPrompts,
    });
  };

  private readonly handleTotSpinning = (payload: TotSpinningEvent) => {
    const { roomId, durationMs } = payload;
    this.server.to(roomId).emit('tot:spinning', {
      durationMs,
    });
  };

  @SubscribeMessage('tot:controlGame')
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
    const { roomId, action } = payload;

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
      const removalResult = this.socketService.removeRoom(roomId);
      this.server.to(roomId).emit('tot:gameEnded', {
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
      this.socketService.resetPlayerStatuses(roomId, PlayerStatus.Pending);
      this.broadcastRoomSnapshot(roomId);

      const players: TotPlayer[] = snapshot.players.map((player) => {
        const nameValue = typeof player.data['name'] === 'string' ? (player.data['name'] as string) : undefined;
        return { id: player.id, name: nameValue, data: player.data, isHost: player.isHost };
      });

      const result = this.totGame.startGame(roomId, players);
      if (result.started) {
        this.server.to(roomId).emit('tot:gameRestarted', {
          triggeredBy: client.id,
          firstPlayer: result.firstPlayer,
          remainingCount: result.remainingCount,
          totalPlayers: result.totalPlayers,
          startedAt: result.startedAt,
          autoSelectDelayMs: result.autoSelectDelayMs,
        });
      } else {
        this.logger.warn(`TOT restart failed for room ${roomId}: insufficient participants`);
      }

      return {
        event: 'tot:controlGame:ack',
        data: { success: true, action: 'restart', restartResult: result.started ? result : null },
      };
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
      this.server.to(roomId).emit('tot:playerSelected', {
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
      this.server.to(roomId).emit('tot:playerPoolExhausted', {
        requestedBy: meta.requestedBy,
        source: meta.source,
      });
    }
  }

  private broadcastRoomSnapshot(roomId: string, snapshot?: RoomSnapshot | null) {
    const payload = snapshot ?? this.socketService.getRoomSnapshot(roomId);
    if (payload) {
      this.server.to(roomId).emit('roomUpdate', payload);
    }
  }
}
