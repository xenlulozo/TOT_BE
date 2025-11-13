import { Module } from '@nestjs/common';
import { TotGameCore } from './tot-game.core';

@Module({
  providers: [TotGameCore],
  exports: [TotGameCore],
})
export class TotGameModule {}

