import { Logger } from '@nestjs/common';
import { CreatePlayerDTO, DisposePlayerDTO, IUpdateProfileDTO, RemovePlayerDTO, SetRoomHostDTO } from '../player/dto/createPlayer.DTO';
import { IPlayerInfo, PlayerInfo, RoomState, RoundState, MyRoomState, IPromptOption, ITotPromptType } from '../schema/MyRoomState';
import { MyRoom } from '../MyRoom';
import { PromptsData } from '../../../../src/game/tot/prompts.data';

export class CorePlayer {
  private static readonly logger = new Logger(CorePlayer.name);
  private static readonly _TIME_DELAY_SPIN = 7000;
  private static readonly _TIME_DELAY_PLAYER_SELECTED = 7000;
  private static readonly _TIME_DELAY_PICK_PROMPT = 5000;
  private static readonly _TIME_DELAY_GAME_START = 10000;

  public static F_CreatePlayer(payload: CreatePlayerDTO): IPlayerInfo {
    const { client, name, avatar, players } = payload;

    const isHost = players.size === 0;

    const player = new PlayerInfo({
      id: client.sessionId,
      name: name,
      avatar: avatar,
      roundState: RoundState.NOT_STARTED,
      isHost: isHost,
    });
    players.set(client.sessionId, player);
    return player;
  }

  public static F_RemovePlayer(payload: RemovePlayerDTO): void {
    const { client, players } = payload;
    const player = players.get(client.sessionId);
    this.logger.log('🚀 ~ CorePlayer ~ F_RemovePlayer ~ player:', player.id);
    if (player) {
      players.delete(client.sessionId);
    } else {
      this.logger.log('🚀 ~ CorePlayer ~ F_RemovePlayer ~ player not found');
    }
  }

  public static F_Clear(payload: DisposePlayerDTO) {
    payload.players.clear();
  }

  public static F_SetRoomHost(payload: SetRoomHostDTO) {
    const { client, roomId, state } = payload;
    const player = state.players.get(client.id);
    if (player && !player.isHost) {
      state.F_SetRoomId(roomId);
    }
  }
  public static F_UpdateProfile(payload: IUpdateProfileDTO) {
    const { client, name, avatar, players } = payload;
    const player = players.get(client.id);
    if (player) {
      player.name = name;
      player.avatar = avatar;
      players.set(client.id, player);
    }
  }

  public static F_StartGame(room: MyRoom) {
    const { state } = room;

    state.F_SetState(RoomState.PLAYING);

    room.F_StartGame();

    // Sau _TIME_DELAY_SPIN giây, gửi event SPIN với player id
    setTimeout(() => {
      const selectedPlayer = this.F_SelectRandomPlayer(state);
      if (selectedPlayer) {
        // Cập nhật roundState của người chơi được chọn
        selectedPlayer.roundState = RoundState.IN_PROGRESS;

        // Tạo prompt options cho player và lưu vào state
        const promptOptions = this.F_GeneratePromptOptions(state);

        // Lưu current player với prompts vào state
        state.F_SetCurrentPlayerWithPrompts(selectedPlayer, promptOptions.truth?.id, promptOptions.trick?.id);

        room.F_Spin(selectedPlayer.id);

        // Sau _TIME_DELAY_PLAYER_SELECTED giây, gửi event PLAYER_SELECTED với đầy đủ thông tin
        setTimeout(() => {
          room.F_PlayerSelected(selectedPlayer, promptOptions);

          // Sau 2 giây để popup hiện với animation, gửi event đóng popup
          setTimeout(() => {
            room.F_HidePlayerSelectedPopup();

            // Sau _TIME_DELAY_PICK_PROMPT giây nữa (từ lúc đóng popup), gửi event PICK_PROMPT để client show pick UI
            setTimeout(() => {
              room.F_PickPrompt();
            }, this._TIME_DELAY_PICK_PROMPT);
          }, 2000);
        }, this._TIME_DELAY_PLAYER_SELECTED);
      } else {
        // Không còn người chơi nào, gửi event END_GAME
        this.logger.log('No more players available, ending game');
        state.F_SetState(RoomState.ENDED);
        room.F_EndGame();
      }
    }, this._TIME_DELAY_SPIN);
  }

  /**
   * Chọn ngẫu nhiên một người chơi chưa tham gia (roundState === NOT_STARTED, không bao gồm host)
   */
  public static F_SelectRandomPlayer(state: MyRoomState): PlayerInfo | null {
    // Lấy những người chơi chưa tham gia (NOT_STARTED) và không phải host
    const availablePlayers = Array.from(state.players.values()).filter(
      (player) => !player.isHost && player.roundState === RoundState.NOT_STARTED,
    );

    if (availablePlayers.length === 0) {
      this.logger.warn('No players available to select (all players have participated or excluding host)');
      return null;
    }

    const randomIndex = Math.floor(Math.random() * availablePlayers.length);
    const selectedPlayer = availablePlayers[randomIndex];

    this.logger.log(`Selected player: ${selectedPlayer.id} (${selectedPlayer.name})`);
    return selectedPlayer;
  }

  /**
   * Tạo prompt options ngẫu nhiên (truth và trick) chưa được sử dụng
   */
  public static F_GeneratePromptOptions(state: MyRoomState): { truth?: IPromptOption; trick?: IPromptOption } {
    const options: { truth?: IPromptOption; trick?: IPromptOption } = {};

    // Lấy danh sách prompts có sẵn
    const truthPrompts = PromptsData.F_GetTruthPrompts();
    const trickPrompts = PromptsData.F_GetTrickPrompts();

    // Chọn truth prompt chưa sử dụng
    const availableTruthPrompts = truthPrompts.filter((prompt: any) => !state.usedTruthPrompts.has(prompt.id));
    if (availableTruthPrompts.length > 0) {
      const randomTruthIndex = Math.floor(Math.random() * availableTruthPrompts.length);
      const selectedTruth = availableTruthPrompts[randomTruthIndex];
      options.truth = {
        id: selectedTruth.id,
        content: selectedTruth.content,
        type: selectedTruth.type,
      };
      state.F_AddUsedTruthPrompt(selectedTruth.id);
    }

    // Chọn trick prompt chưa sử dụng
    const availableTrickPrompts = trickPrompts.filter((prompt: any) => !state.usedTrickPrompts.has(prompt.id));
    if (availableTrickPrompts.length > 0) {
      const randomTrickIndex = Math.floor(Math.random() * availableTrickPrompts.length);
      const selectedTrick = availableTrickPrompts[randomTrickIndex];
      options.trick = {
        id: selectedTrick.id,
        content: selectedTrick.content,
        type: selectedTrick.type,
      };
      state.F_AddUsedTrickPrompt(selectedTrick.id);
    }

    return options;
  }

  /**
   * Kết thúc lượt của người chơi
   */
  public static F_EndTurn(room: MyRoom, playerId: string) {
    const player = room.state.players.get(playerId);
    if (!player) {
      this.logger.warn(`Player ${playerId} not found when trying to end turn`);
      return;
    }

    // Cập nhật trạng thái người chơi thành COMPLETED
    player.roundState = RoundState.COMPLETED;

    // Kiểm tra xem còn người nào có thể chơi không
    const availablePlayers = Array.from(room.state.players.values()).filter((p) => !p.isHost && p.roundState === RoundState.NOT_STARTED);
    room.F_EndTurn();

    if (availablePlayers.length === 0) {
      // Hết người chơi, kết thúc game

      this.logger.log('All players have completed their turns, ending game');
      room.state.F_SetState(RoomState.ENDED);
      room.F_EndGame();
    } else {
      // Còn người chơi, sau 5s bắt đầu lại chu trình xoay bánh xe
      setTimeout(() => {
        this.F_NextTurn(room);
      }, 2000);

      setTimeout(() => {
        this.F_StartNewRound(room);
      }, 5000);
    }
  }

  public static F_NextTurn(room: MyRoom) {
    room.F_NextTurn();
  }

  public static F_PlayAgain(room: MyRoom) {
    room.state.F_SetState(RoomState.READY);

    // Reset roundState của tất cả players về NOT_STARTED (trừ host)
    for (const player of room.state.players.values()) {
      if (!player.isHost) {
        player.roundState = RoundState.NOT_STARTED;
      }
    }

    // Clear current player with prompts
    room.state.F_ClearCurrentPlayerWithPrompts();

    // Reset used prompts để có thể sử dụng lại
    room.state.usedTruthPrompts.clear();
    room.state.usedTrickPrompts.clear();

    this.F_StartGame(room);
  }

  /**
   * Bắt đầu vòng chơi mới với người chơi tiếp theo
   */
  public static F_StartNewRound(room: MyRoom) {
    const selectedPlayer = this.F_SelectRandomPlayer(room.state);
    if (selectedPlayer) {
      // Cập nhật roundState của người chơi được chọn
      selectedPlayer.roundState = RoundState.IN_PROGRESS;

      // Tạo prompt options cho player và lưu vào state
      const promptOptions = this.F_GeneratePromptOptions(room.state);

      // Lưu current player với prompts vào state
      room.state.F_SetCurrentPlayerWithPrompts(selectedPlayer, promptOptions.truth?.id, promptOptions.trick?.id);

      room.F_Spin(selectedPlayer.id);

      // Sau _TIME_DELAY_PLAYER_SELECTED giây, gửi event PLAYER_SELECTED với đầy đủ thông tin
      setTimeout(() => {
        room.F_PlayerSelected(selectedPlayer, promptOptions);

        // Sau 2 giây để popup hiện với animation, gửi event đóng popup
        setTimeout(() => {
          room.F_HidePlayerSelectedPopup();

          // Sau _TIME_DELAY_PICK_PROMPT giây nữa (từ lúc đóng popup), gửi event PICK_PROMPT để client show pick UI
          setTimeout(() => {
            room.F_PickPrompt();
          }, this._TIME_DELAY_PICK_PROMPT);
        }, 2000);
      }, this._TIME_DELAY_PLAYER_SELECTED);
    } else {
      // Trường hợp này không nên xảy ra vì đã kiểm tra ở F_EndTurn
      this.logger.warn('No players available in F_StartNewRound');
      room.state.F_SetState(RoomState.ENDED);
      room.F_EndGame();
    }
  }
}
