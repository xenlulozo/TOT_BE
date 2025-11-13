import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PromptsData } from './prompts.data';
export const TOT_AUTO_SELECT_DELAY_MS = 3000;
export const TOT_SPIN_DELAY_MS = 5000;
const AUTO_SELECT_DELAY_MS = TOT_AUTO_SELECT_DELAY_MS;
const SPIN_DELAY_MS = TOT_SPIN_DELAY_MS;

export type TotPromptType = 'truth' | 'trick';

export interface TotPlayer {
  id: string;
  name?: string;
  isHost?: boolean;
  [key: string]: unknown;
}

export interface TotPrompt {
  id: string;
  content: string;
  type: TotPromptType;
}

interface PromptDataset {
  truth: TotPrompt[];
  trick: TotPrompt[];
}

// const promptsData = (promptsRaw as { default?: PromptDataset }).default ?? (promptsRaw as PromptDataset);

const prompts: PromptDataset = {
  truth: PromptsData.F_GetTruthPrompts(),
  trick: PromptsData.F_GetTrickPrompts(),
};
const promptLibrary: Record<TotPromptType, TotPrompt[]> = {
  truth: prompts.truth,
  trick: prompts.trick,
};

export interface TotPromptOptions {
  truth?: TotPrompt | null;
  trick?: TotPrompt | null;
}

interface TotGameState {
  players: TotPlayer[];
  remaining: TotPlayer[];
  history: TotPlayer[];
  startedAt: Date;
  hostId: string | null;
  currentPlayer: TotPlayer | null;
  currentPrompt: TotPrompt | null;
  currentChoiceType: TotPromptType | null;
  usedPrompts: Record<TotPromptType, Set<string>>;
  currentPromptOptions: TotPromptOptions;
}

export interface TotGameStartResult {
  firstPlayer: TotPlayer | null;
  remainingCount: number;
  totalPlayers: number;
  startedAt: Date;
  started: boolean;
  autoSelectDelayMs: number | null;
}

export interface TotSelectionResult {
  player: TotPlayer | null;
  remainingCount: number;
  totalPlayers: number;
  exhausted: boolean;
  promptOptions: TotPromptOptions;
}

export interface TotPlayerSelectedEvent {
  roomId: string;
  result: TotSelectionResult;
  source: 'auto';
}

export interface TotSpinningEvent {
  roomId: string;
  durationMs: number;
}

export interface TotChoiceResultSuccess {
  success: true;
  playerId: string;
  type: TotPromptType;
  prompt: TotPrompt;
  remainingPrompts: number;
}

export type TotChoiceResultFailureReason =
  | 'room_inactive'
  | 'not_current_player'
  | 'invalid_type'
  | 'no_prompts_configured'
  | 'no_prompts_available';

export interface TotChoiceResultFailure {
  success: false;
  reason: TotChoiceResultFailureReason;
}

export type TotChoiceResult = TotChoiceResultSuccess | TotChoiceResultFailure;

export interface TotOptionSelectedEvent {
  roomId: string;
  result: TotChoiceResultSuccess;
}

export interface TotFinishResult {
  scheduled: boolean;
  nextInMs: number | null;
  remainingCount: number;
  totalPlayers: number;
}

@Injectable()
export class TotGameCore extends EventEmitter {
  private readonly logger = new Logger(TotGameCore.name);
  private readonly games = new Map<string, TotGameState>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
  }

  startGame(roomId: string, players: TotPlayer[]): TotGameStartResult {
    this.clearTimer(roomId);

    const uniquePlayers = this.normalizePlayers(players);
    const host = uniquePlayers.find((player) => player.isHost) ?? null;
    const participants = uniquePlayers.filter((player) => !player.isHost);
    const startedAt = new Date();

    if (participants.length < 1) {
      this.games.delete(roomId);
      this.logger.warn(`Cannot start TOT game in room ${roomId}: requires at least one non-host player`);
      return {
        firstPlayer: null,
        remainingCount: 0,
        totalPlayers: participants.length,
        startedAt,
        started: false,
        autoSelectDelayMs: null,
      };
    }

    const state: TotGameState = {
      players: participants,
      remaining: [...participants],
      history: [],
      startedAt,
      hostId: host?.id ?? null,
      currentPlayer: null,
      currentPrompt: null,
      currentChoiceType: null,
      usedPrompts: {
        truth: new Set<string>(),
        trick: new Set<string>(),
      },
      currentPromptOptions: {},
    };

    this.games.set(roomId, state);
    this.logger.log(`TOT game started in room ${roomId} with ${participants.length} participants (host excluded)`);

    // First player selection uses 3s delay (no spinning animation)
    this.scheduleAutoDraw(roomId, AUTO_SELECT_DELAY_MS, false);

    return {
      firstPlayer: null,
      remainingCount: state.remaining.length,
      totalPlayers: state.players.length,
      startedAt: state.startedAt,
      started: true,
      autoSelectDelayMs: AUTO_SELECT_DELAY_MS,
    };
  }

  drawNextPlayer(roomId: string): TotSelectionResult {
    this.clearTimer(roomId);

    const state = this.games.get(roomId);
    if (!state) {
      this.logger.warn(`drawNextPlayer called for inactive room ${roomId}`);
      return {
        player: null,
        remainingCount: 0,
        totalPlayers: 0,
        exhausted: true,
        promptOptions: {},
      };
    }

    const player = this.drawNextForState(state);
    const exhausted = player === null || state.remaining.length === 0;
    return {
      player,
      remainingCount: state.remaining.length,
      totalPlayers: state.players.length,
      exhausted,
      promptOptions: { ...state.currentPromptOptions },
    };
  }

  chooseOption(roomId: string, playerId: string, type: TotPromptType): TotChoiceResult {
    const state = this.games.get(roomId);
    if (!state) {
      this.logger.warn(`chooseOption called for inactive room ${roomId}`);
      return { success: false, reason: 'room_inactive' };
    }

    if (!state.currentPlayer || state.currentPlayer.id !== playerId) {
      this.logger.warn(`Player ${playerId} attempted to choose option in room ${roomId} without holding the turn`);
      return { success: false, reason: 'not_current_player' };
    }

    if (!promptLibrary[type] || promptLibrary[type].length === 0) {
      this.logger.error(`No prompts configured for type ${type}`);
      return { success: false, reason: 'no_prompts_configured' };
    }

    const prompt = state.currentPromptOptions?.[type];
    if (!prompt) {
      return { success: false, reason: 'no_prompts_available' };
    }

    if (state.currentChoiceType === type && state.currentPrompt?.id === prompt.id) {
      return {
        success: true,
        playerId,
        type,
        prompt,
        remainingPrompts: this.getRemainingPromptCount(type, state),
      };
    }

    state.currentChoiceType = type;
    state.currentPrompt = prompt;

    const result: TotChoiceResultSuccess = {
      success: true,
      playerId,
      type,
      prompt,
      remainingPrompts: this.getRemainingPromptCount(type, state),
    };

    this.emit('optionSelected', {
      roomId,
      result,
    } as TotOptionSelectedEvent);

    return result;
  }

  finishTurn(roomId: string): TotFinishResult {
    this.clearTimer(roomId);

    const state = this.games.get(roomId);
    if (!state) {
      this.logger.warn(`finishTurn called for inactive room ${roomId}`);
      return {
        scheduled: false,
        nextInMs: null,
        remainingCount: 0,
        totalPlayers: 0,
      };
    }

    if (!state.currentPlayer) {
      this.logger.warn(`finishTurn called but no active player in room ${roomId}`);
    }

    state.currentPlayer = null;
    state.currentChoiceType = null;
    state.currentPrompt = null;
    state.currentPromptOptions = {};

    // After finishTurn, use 5s delay with spinning animation
    this.scheduleAutoDraw(roomId, SPIN_DELAY_MS, true);

    const hasNext = this.timers.has(roomId);
    return {
      scheduled: hasNext,
      nextInMs: hasNext ? SPIN_DELAY_MS : null,
      remainingCount: state.remaining.length,
      totalPlayers: state.players.length,
    };
  }

  reset(roomId: string) {
    this.clearTimer(roomId);
    this.games.delete(roomId);
    this.logger.debug(`TOT game reset for room ${roomId}`);
  }

  private scheduleAutoDraw(roomId: string, delayMs: number = SPIN_DELAY_MS, shouldEmitSpinning: boolean = true) {
    const state = this.games.get(roomId);
    if (!state || !state.remaining.length || state.currentPlayer || this.timers.has(roomId)) {
      return;
    }

    // Emit spinning event immediately if requested (after finishTurn)
    if (shouldEmitSpinning) {
      this.emit('spinning', {
        roomId,
        durationMs: delayMs,
      } as TotSpinningEvent);
    }

    // After delay, select the next player
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      const selection = this.drawNextForState(state);
      const result: TotSelectionResult = {
        player: selection,
        remainingCount: state.remaining.length,
        totalPlayers: state.players.length,
        exhausted: selection === null || state.remaining.length === 0,
        promptOptions: { ...state.currentPromptOptions },
      };

      this.emit('playerSelected', {
        roomId,
        result,
        source: 'auto',
      } as TotPlayerSelectedEvent);
    }, delayMs);

    this.timers.set(roomId, timer);
  }

  private drawNextForState(state: TotGameState): TotPlayer | null {
    if (!state.remaining.length) {
      this.logger.debug('All players have been drawn; no remaining players.');
      state.currentPlayer = null;
      state.currentChoiceType = null;
      state.currentPrompt = null;
      state.currentPromptOptions = {};
      return null;
    }

    const index = Math.floor(Math.random() * state.remaining.length);
    const [selected] = state.remaining.splice(index, 1);
    state.history.push(selected);
    state.currentPlayer = selected;
    state.currentChoiceType = null;
    state.currentPrompt = null;
    state.currentPromptOptions = this.preparePromptOptions(state);
    this.logger.debug(`Selected player ${selected.id} at index ${index} out of ${state.players.length}`);
    return selected;
  }

  private normalizePlayers(players: TotPlayer[]): TotPlayer[] {
    const seen = new Set<string>();
    const normalized: TotPlayer[] = [];

    for (const player of players) {
      if (!player?.id) {
        this.logger.warn('Ignoring TOT player without id');
        continue;
      }
      if (seen.has(player.id)) {
        continue;
      }
      seen.add(player.id);
      normalized.push({ ...player });
    }

    return normalized;
  }

  private clearTimer(roomId: string) {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomId);
    }
  }

  private drawPrompt(type: TotPromptType, state: TotGameState): TotPrompt | null {
    const library = promptLibrary[type];
    if (!library.length) {
      return null;
    }

    const used = state.usedPrompts[type];
    if (used.size >= library.length) {
      used.clear();
    }

    const available = library.filter((prompt) => !used.has(prompt.id));
    if (!available.length) {
      return null;
    }

    const selection = available[Math.floor(Math.random() * available.length)];
    used.add(selection.id);
    return selection;
  }

  private getRemainingPromptCount(type: TotPromptType, state: TotGameState): number {
    const library = promptLibrary[type];
    const used = state.usedPrompts[type];
    return Math.max(library.length - used.size, 0);
  }

  private preparePromptOptions(state: TotGameState): TotPromptOptions {
    const options: TotPromptOptions = {};

    (['truth', 'trick'] as const).forEach((type) => {
      const prompt = this.drawPrompt(type, state);
      options[type] = prompt ?? null;
    });

    return options;
  }
}
