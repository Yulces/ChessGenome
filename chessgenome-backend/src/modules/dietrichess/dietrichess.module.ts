import { Global, Module } from '@nestjs/common';
import { DietriChessService } from './dietrichess.service';

@Global()
@Module({
  providers: [DietriChessService],
  exports: [DietriChessService],
})
export class DietriChessModule {}
