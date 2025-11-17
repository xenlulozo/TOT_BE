import { IPlayerInfo } from '../schema/MyRoomState';

export type ITotPromptType = 'truth' | 'trick';

export type IPromptOption = {
  id: string;
  content: string;
  type: ITotPromptType;
};
export type IPromptOptions = {
  truth?: IPromptOption;
  trick?: IPromptOption;
};

export type IPlayerSelectedPayload = {
  player: IPlayerInfo;
  promptOptions?: IPromptOptions;
};
