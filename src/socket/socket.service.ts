import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

export enum PlayerStatus {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
}

interface PlayerState {
  id: string;
  data: Record<string, unknown>;
  status: PlayerStatus;
}

interface RoomState {
  players: Map<string, PlayerState>;
  meta: Record<string, unknown>;
  hostId: string | null;
}

export interface PlayerSummary {
  id: string;
  data: Record<string, unknown>;
  isHost: boolean;
  status: PlayerStatus;
}

export interface RoomSnapshot {
  players: PlayerSummary[];
  meta: Record<string, unknown>;
  hostId: string | null;
}

export interface RoomRemovalResult {
  removedPlayerIds: string[];
}

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private readonly rooms = new Map<string, RoomState>();
  private readonly playerRooms = new Map<string, Set<string>>();

  registerPlayer(roomId: string, client: Socket, data: Record<string, unknown> = {}): boolean {
    const room = this.rooms.get(roomId) ?? this.createRoom(roomId);
    room.players.set(client.id, { id: client.id, data, status: PlayerStatus.Pending });

    const membership = this.playerRooms.get(client.id) ?? new Set<string>();
    membership.add(roomId);
    this.playerRooms.set(client.id, membership);

    if (!room.hostId) {
      room.hostId = client.id;
      this.logger.debug(`Player ${client.id} set as host for room ${roomId}`);
      return true;
    }

    this.logger.debug(`Player ${client.id} joined room ${roomId}`);
    return room.hostId === client.id;
  }

  unregisterPlayer(roomId: string, clientId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.players.delete(clientId);
    const membership = this.playerRooms.get(clientId);
    if (membership) {
      membership.delete(roomId);
      this.cleanupMembership(clientId, membership);
    }
    this.logger.debug(`Player ${clientId} left room ${roomId}`);

    if (room.hostId === clientId) {
      const nextHost = room.players.keys().next().value ?? null;
      room.hostId = nextHost ?? null;
      if (room.hostId) {
        this.logger.debug(`Host for room ${roomId} reassigned to ${room.hostId}`);
      } else {
        this.logger.debug(`Room ${roomId} now has no host`);
      }
    }

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      this.logger.debug(`Room ${roomId} removed (empty)`);
    }
  }

  updateMeta(roomId: string, meta: Record<string, unknown>) {
    const room = this.rooms.get(roomId) ?? this.createRoom(roomId);
    room.meta = { ...room.meta, ...meta };
  }

  getRoomSnapshot(roomId: string): RoomSnapshot | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    return {
      players: Array.from(room.players.values(), ({ id, data, status }) => ({
        id,
        data,
        status,
        isHost: id === room.hostId,
      })),
      meta: room.meta,
      hostId: room.hostId,
    };
  }

  getRoomHost(roomId: string): string | null {
    return this.rooms.get(roomId)?.hostId ?? null;
  }

  removeClientFromAllRooms(clientId: string) {
    const membership = this.playerRooms.get(clientId);
    if (!membership) {
      return [];
    }

    const roomIds = Array.from(membership);
    for (const roomId of roomIds) {
      this.unregisterPlayer(roomId, clientId);
      this.logger.debug(`Client ${clientId} removed from room ${roomId} due to disconnect`);
    }

    return roomIds;
  }

  setPlayerStatus(roomId: string, playerId: string, status: PlayerStatus) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return false;
    }

    player.status = status;
    return true;
  }

  resetPlayerStatuses(roomId: string, status: PlayerStatus = PlayerStatus.Pending) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    room.players.forEach((player) => {
      player.status = status;
    });

    return true;
  }

  removeRoom(roomId: string): RoomRemovalResult | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const removedPlayerIds: string[] = [];
    room.players.forEach((_, playerId) => {
      removedPlayerIds.push(playerId);
      const membership = this.playerRooms.get(playerId);
      if (membership) {
        membership.delete(roomId);
        if (membership.size === 0) {
          this.playerRooms.delete(playerId);
        } else {
          this.playerRooms.set(playerId, membership);
        }
      }
    });

    this.rooms.delete(roomId);
    return { removedPlayerIds };
  }

  private createRoom(roomId: string) {
    const room: RoomState = {
      players: new Map<string, PlayerState>(),
      meta: {},
      hostId: null,
    };
    this.rooms.set(roomId, room);
    this.logger.debug(`Room ${roomId} created`);
    return room;
  }

  private cleanupMembership(clientId: string, membership: Set<string>) {
    if (membership.size === 0) {
      this.playerRooms.delete(clientId);
    }
  }
}
