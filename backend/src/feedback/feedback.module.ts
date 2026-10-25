import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
  exports: [],
})
export class FeedbackModule {}
