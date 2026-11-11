import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Mail adapter (PH1-T02). Local development uses the console adapter: the
 * message is logged instead of sent. A provider adapter (EMAIL_API_KEY)
 * plugs in here when credentials exist; until then console is the default
 * and is never used silently in production.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(message: MailMessage): Promise<void> {
    if (this.env.NODE_ENV === 'production' && !this.env.EMAIL_API_KEY) {
      // Never silently drop mail in production.
      this.logger.error(`EMAIL_API_KEY missing; cannot deliver mail to ${message.to}`);
      return;
    }
    // Console adapter (local/dev and until a provider is configured).
    this.logger.log(`[mail:console] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}
