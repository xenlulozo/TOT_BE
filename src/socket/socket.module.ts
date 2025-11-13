import { Module } from '@nestjs/common';
import { TotGameModule } from '../game/tot/tot-game.module';
import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';

@Module({
  imports: [TotGameModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}

