import { Room, Client } from '@colyseus/core';
import { MyRoomState, IPlayerInfo, IPromptOption } from './schema/MyRoomState';
import { EventKey } from './eventKey';
import { CorePlayer } from './core/Player.core';
import { ICreatePlayerDTO, ISetRoomHostDTO, IUpdateProfileDTO } from './player/dto/createPlayer.DTO';
import { PromptsData } from '../../../src/game/tot/prompts.data';

export class MyRoom extends Room<MyRoomState> {
  maxClients = 40;
  state = new MyRoomState();

  onCreate(options: any) {
    this.onMessage(EventKey.REFRESH_PLAYERS, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ EventKey.REFRESH_PLAYERS:', EventKey.REFRESH_PLAYERS);
    });

    this.onMessage(EventKey.SPIN, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ EventKey.SPIN:', EventKey.SPIN);
    });

    this.onMessage(EventKey.START_GAME, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ EventKey.START_GAME:', EventKey.START_GAME);
      CorePlayer.F_StartGame(this);
    });

    this.onMessage(EventKey.SET_ROOM_HOST, (client, message: ISetRoomHostDTO) => {
      const { roomId, url } = message;
      console.log('🚀 ~ MyRoom ~ onCreate ~ EventKey.SET_ROOM_HOST:', roomId);
      CorePlayer.F_SetRoomHost({
        client: client,
        roomId: roomId,
        state: this.state,
      });
      this.broadcast(EventKey.SET_ROOM_HOST, {
        roomId: roomId,
        url: url,
      });
    });

    this.onMessage(EventKey.UPDATE_PROFILE, (client, message: IUpdateProfileDTO) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ UPDATE_PROFILE:');
      const { name, avatar } = message;
      CorePlayer.F_UpdateProfile({
        client: client,
        players: this.state.players,

        avatar: avatar,
        name: name,
      });
      this.F_UpdateMember();
    });

    this.onMessage(EventKey.TRUTH_PROMPT_SELECTED, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ TRUTH_PROMPT_SELECTED:', client.sessionId);
      this.broadcast(EventKey.TRUTH_PROMPT_SELECTED, {
        playerId: client.sessionId,
          content: PromptsData.F_GetPromptById(this.state.currentPlayerWithPrompts?.truthPromptId, 'truth')?.content,
      });
    });

    this.onMessage(EventKey.TRICK_PROMPT_SELECTED, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ TRICK_PROMPT_SELECTED:', client.sessionId ,message);
      this.broadcast(EventKey.TRICK_PROMPT_SELECTED, {
        playerId: client.sessionId,
        content: PromptsData.F_GetPromptById(this.state.currentPlayerWithPrompts?.trickPromptId, 'trick')?.content,
      });
    });

    this.onMessage(EventKey.END_TURN, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ END_TURN:', client.sessionId);
      CorePlayer.F_EndTurn(this, client.sessionId);
    });

    this.onMessage(EventKey.PLAY_AGAIN, (client, message) => {
      console.log('🚀 ~ MyRoom ~ onCreate ~ PL.PLAY_AGAIN:', client.sessionId);
      CorePlayer.F_PlayAgain(this);
    });
  }

  onJoin(client: Client, options: ICreatePlayerDTO) {
    console.log(client.sessionId, 'joined!');
    const player = CorePlayer.F_CreatePlayer({
      client: client,
      name: options.name ?? 'Player ' + client.sessionId,
      avatar: options.avatar ?? '',
      players: this.state.players,
    });

    this.F_UpdateMember();
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, 'left!');

    CorePlayer.F_RemovePlayer({
      client: client,
      players: this.state.players,
    });
  }

  onDispose() {
    console.log('room', this.roomId, 'disposing...');

    CorePlayer.F_Clear({
      players: this.state.players,
    });
  }

  private F_UpdateMember() {
    this.broadcast(EventKey.UPDATE_MEMBERS, this.state.players);
  }

  public F_StartGame() {
    this.broadcast(EventKey.START_GAME, this.state.state);
  }

  public F_Spin(playerId: string) {
    console.log('🚀 ~ MyRoom ~ F_Spin ~ playerId:', playerId);
    this.broadcast(EventKey.SPIN, { playerId });
  }

  public F_PlayerSelected(player: IPlayerInfo, promptOptions?: { truth?: IPromptOption; trick?: IPromptOption }) {
    console.log('🚀 ~ MyRoom ~ F_PlayerSelected ~ player:', player);
    this.broadcast(EventKey.PLAYER_SELECTED, {
      player: {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        roundState: player.roundState,
        isHost: player.isHost,
      },
      promptOptions: promptOptions,
    });
  }

  public F_EndGame() {
    console.log('🚀 ~ MyRoom ~ F_EndGame ~ F_EndGame:');
    this.broadcast(EventKey.END_GAME, this.state.state);
  }

  public F_PlayAgain() {
    console.log('🚀 ~ MyRoom ~ F_EndGame ~ F_PlayAgain:');
    CorePlayer.F_PlayAgain(this)
  }

  public F_EndTurn() {
    console.log('🚀 ~ MyRoom ~ F_EndGame ~ F_EndTurn:');
    this.broadcast(EventKey.END_TURN, this.state.state);
  }

  public F_NextTurn() {
    console.log('🚀 ~ MyRoom ~ F_EndGame ~ F_NextTurn:');
    this.broadcast(EventKey.NEXT_TURN, this.state.state);
  }

  public F_PickPrompt() {
    console.log('🚀 ~ MyRoom ~ F_PickPrompt ~ F_PickPrompt:');
    this.broadcast(EventKey.PICK_PROMPT);
  }

  public F_HidePlayerSelectedPopup() {
    console.log('🚀 ~ MyRoom ~ F_HidePlayerSelectedPopup ~ F_HidePlayerSelectedPopup:');
    this.broadcast(EventKey.HIDE_PLAYER_SELECTED_POPUP);
  }
}
