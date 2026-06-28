import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process('sendPush')
  async handleSendPush(
    job: Job<{ token: string; title: string; body: string; payload?: any }>,
  ) {
    const { token, title, body, payload } = job.data;
    this.logger.log(`Processing push job ${job.id} targeting token: ${token}`);

    if (!token.startsWith('ExponentPushToken[')) {
      this.logger.warn(`Invalid Expo Push Token: "${token}". Aborting send.`);
      return;
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: title,
          body: body,
          data: payload || {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Expo Push API returned status ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      // Expo response contains ticket receipts. Let's inspect errors if any.
      const statusData = result.data;
      if (Array.isArray(statusData)) {
        for (const ticket of statusData) {
          if (ticket.status === 'error') {
            this.logger.error(`Expo delivery error: ${ticket.message} (Details: ${JSON.stringify(ticket.details)})`);
          } else {
            this.logger.log(`Expo push delivered successfully, ticket ID: ${ticket.id}`);
          }
        }
      } else if (result.errors) {
        throw new Error(`Expo API top-level error: ${JSON.stringify(result.errors)}`);
      } else {
        this.logger.log('Expo push notification ticket generated successfully.');
      }
    } catch (err: any) {
      this.logger.error(`Failed to dispatch push notification via Expo: ${err.message}`);
      throw err; // Cause Bull to retry or fail the job
    }
  }
}
