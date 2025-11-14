/**
 * Enum chứa tất cả các event client gửi lên server (SubscribeMessage)
 */
export enum SocketClientEvent {
  JoinRoom = 'joinRoom',
  TotStartGame = 'tot:startGame',
  TotDrawNext = 'tot:drawNext',
  TotChooseOption = 'tot:chooseOption',
  TotTurnOptionSelected = 'tot:turnOptionSelected',
  TotGetGameState = 'tot:getGameState',
  TotFinishTurn = 'tot:finishTurn',
  LeaveRoom = 'leaveRoom',
  UpdateMeta = 'updateMeta',
  PlayerAction = 'playerAction',
  PlayerRename = 'player:rename',
  PlayerAvatarUpdate = 'player:avatarUpdate',
  TotControlGame = 'tot:controlGame',
}

/**
 * Enum chứa tất cả các event server emit xuống client
 */
export enum SocketServerEvent {
  PlayerLeft = 'playerLeft',
  RoomUpdate = 'roomUpdate',
  TotGameStarted = 'tot:gameStarted',
  TotPlayerSelected = 'tot:playerSelected',
  TotPlayerPoolExhausted = 'tot:playerPoolExhausted',
  TotTurnOptionSelected = 'tot:turnOptionSelected',
  TotSpinning = 'tot:spinning',
  TotTurnFinished = 'tot:turnFinished',
  TotGameEnded = 'tot:gameEnded',
  TotGameRestarted = 'tot:gameRestarted',
  PlayerAction = 'playerAction',
  TotGameState = 'tot:gameState',
  PlayerRenamed = 'playerRenamed',
  TotOutOfTurn = 'tot:outOfTurn',
  PlayerAvatarUpdated = 'playerAvatarUpdated',
}

export type PlayerAvatarUpdatedPayload = {
  playerId: string;
  avatar: string;
};

