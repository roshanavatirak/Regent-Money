import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmailAccountsService } from './email-accounts.service';

/** Account deletion steps on the website (Play Store data-safety link). */
export const DELETE_ACCOUNT_URL =
  'https://raodevstudios.in/regent-money/delete-account';

/**
 * Public contact details for the app: support, privacy and grievance addresses and the legal
 * links. No sign-in needed, since the Privacy Policy is readable before an account exists.
 * Edited from the admin console (core.email_settings), so the app never hardcodes them.
 */
@Controller('app')
export class AppContactController {
  constructor(private readonly accounts: EmailAccountsService) {}

  @Get('contact')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'public, max-age=300')
  async getContact() {
    const [contacts, links] = await Promise.all([
      this.accounts.getContactEmails(),
      this.accounts.getLegalLinks(),
    ]);
    return {
      ...contacts,
      termsUrl: links.termsUrl,
      privacyUrl: links.privacyUrl,
      deleteAccountUrl: DELETE_ACCOUNT_URL,
    };
  }
}
