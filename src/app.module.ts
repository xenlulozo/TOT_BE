import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketModule } from './socket/socket.module';
import { TotGameModule } from './game/tot/tot-game.module';

@Module({
  imports: [SocketModule, TotGameModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
