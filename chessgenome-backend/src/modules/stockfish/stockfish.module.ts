import { Module } from '@nestjs/common';
import { StockfishService } from './stockfish.service';
import { StockfishController } from './stockfish.controller';

@Module({
  controllers: [StockfishController],
  providers: [StockfishService],
  exports: [StockfishService],
})
export class StockfishModule {}
