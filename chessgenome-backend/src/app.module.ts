import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { GenomeModule } from './modules/genome/genome.module';
import { PositionsModule } from './modules/positions/positions.module';
import { RedisModule } from './modules/redis/redis.module';
import { DietriChessModule } from './modules/dietrichess/dietrichess.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { StockfishModule } from './modules/stockfish/stockfish.module';
import { NeuralModule } from './modules/neural/neural.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { UsersModule } from './modules/users/users.module';
import { CommentsModule } from './modules/comments/comments.module';
import { PgnsModule } from './modules/pgns/pgns.module';
import { ExportModule } from './modules/export/export.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/chessgenome',
    ),
    RedisModule,
    DietriChessModule,
    GenomeModule,
    PositionsModule,
    AnalysisModule,
    StockfishModule,
    NeuralModule,
    AuthorsModule,
    UsersModule,
    CommentsModule,
    PgnsModule,
    ExportModule,
  ],
})
export class AppModule {}
