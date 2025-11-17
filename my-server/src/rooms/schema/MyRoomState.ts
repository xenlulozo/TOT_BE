import { MapSchema, Schema, SetSchema, type } from '@colyseus/schema';

export enum RoomState {
  READY = 'READY',
  PLAYING = 'PLAYING',
  ENDED = 'ENDED',
}

export enum RoundState {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}
export type ITotPromptType = 'truth' | 'trick';

export type IPromptOption = {
  id: string;
  content: string;
  type: ITotPromptType;
};

export interface IPlayerInfo {
  id: string;
  name: string;
  avatar: string;
  roundState: RoundState;
  isHost: boolean;
  isFake?: boolean;
}

export interface ICurrentPlayerWithPrompts {
  player: PlayerInfo;
  promptOptions?: {
    truth?: IPromptOption;
    trick?: IPromptOption;
  };
}

export class PlayerInfo extends Schema implements IPlayerInfo {
  @type('string') id: string;
  @type('string') name: string;
  @type('string') avatar: string;
  @type(RoundState) roundState: RoundState;
  @type('boolean') isHost: boolean;
}

export class CurrentPlayerWithPrompts extends Schema implements ICurrentPlayerWithPrompts {
  @type(PlayerInfo) player: PlayerInfo;
  @type('string') truthPromptId?: string;
  @type('string') trickPromptId?: string;
}

export class MyRoomState extends Schema {
  @type('string') roomId: string;
  @type(RoomState) state: RoomState = RoomState.READY;
  @type({ map: PlayerInfo }) players = new MapSchema<PlayerInfo>();
  @type(CurrentPlayerWithPrompts) currentPlayerWithPrompts: CurrentPlayerWithPrompts | null = null;
  @type({ set: 'string' }) usedTruthPrompts = new SetSchema<string>();
  @type({ set: 'string' }) usedTrickPrompts = new SetSchema<string>();

  public F_SetRoomId(roomId: string) {
    this.roomId = roomId;
  }

  public F_SetState(state: RoomState) {
    this.state = state;
  }

  public F_SetCurrentPlayerWithPrompts(player: PlayerInfo, truthPromptId?: string, trickPromptId?: string) {
    if (!this.currentPlayerWithPrompts) {
      this.currentPlayerWithPrompts = new CurrentPlayerWithPrompts();
    }
    this.currentPlayerWithPrompts.player = player;
    this.currentPlayerWithPrompts.truthPromptId = truthPromptId;
    this.currentPlayerWithPrompts.trickPromptId = trickPromptId;
  }

  public F_ClearCurrentPlayerWithPrompts() {
    this.currentPlayerWithPrompts = null;
  }

  public F_AddUsedTruthPrompt(promptId: string) {
    this.usedTruthPrompts.add(promptId);
  }

  public F_AddUsedTrickPrompt(promptId: string) {
    this.usedTrickPrompts.add(promptId);
  }

  public F_GetAvailableTruthPrompts(): string[] {
    return Array.from(this.usedTruthPrompts);
  }

  public F_GetAvailableTrickPrompts(): string[] {
    return Array.from(this.usedTrickPrompts);
  }
}
