import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import {
  AdminHomeCardsController,
  HomeCardsController,
} from './home-cards.controller';
import { HomeCardsService } from './home-cards.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [HomeCardsController, AdminHomeCardsController],
  providers: [HomeCardsService],
  exports: [HomeCardsService],
})
export class HomeCardsModule {}
