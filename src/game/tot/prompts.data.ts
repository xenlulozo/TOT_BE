import type { TotPrompt } from './tot-game.core';

export class PromptsData {
  static truth: TotPrompt[] = [
    {
      id: 'truth-1',
      content: 'What is a secret hobby you haven’t told the group about?',
      type: 'truth',
    },
    {
      id: 'truth-2',
      content: 'Who in the room do you trust the most and why?',
      type: 'truth',
    },
    {
      id: 'truth-3',
      content: 'Share an embarrassing moment that still makes you laugh.',
      type: 'truth',
    },
    {
      id: 'truth-4',
      content: 'What is one goal you’re afraid to say out loud?',
      type: 'truth',
    },
    {
      id: 'truth-5',
      content: 'Tell us about a time you took a big risk.',
      type: 'truth',
    },
  ];
  static trick: TotPrompt[] = [
    {
      id: 'trick-1',
      content: 'Pretend you’re a news anchor and report on the last ridiculous thing you did.',
      type: 'trick',
    },
    {
      id: 'trick-2',
      content: 'Speak only in song lyrics until your next turn.',
      type: 'trick',
    },
  ];

  public static F_GetTruthPrompts(): TotPrompt[] {
    return this.truth;
  }

  public static F_GetTrickPrompts(): TotPrompt[] {
    return this.trick;
  }
}
