import type { OtpPurpose } from '@finiko/contracts';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface OtpMessage {
  identifier: string;
  channel: 'sms' | 'email';
  code: string;
  purpose: OtpPurpose;
  expiresInSeconds: number;
}

export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}

class ConsoleOtpSender implements OtpSender {
  async send(message: OtpMessage): Promise<void> {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Aucun fournisseur SMS/email configuré : définir SMS_PROVIDER et brancher un adaptateur.',
      );
    }

    logger.info(
      {
        identifier: message.identifier,
        channel: message.channel,
        purpose: message.purpose,
        code: message.code,
        expiresInSeconds: message.expiresInSeconds,
      },
      '[DEV] Code OTP généré',
    );
  }
}

class NoopOtpSender implements OtpSender {
  async send(message: OtpMessage): Promise<void> {
    logger.debug({ identifier: message.identifier }, 'OTP non envoyé (SMS_PROVIDER=noop)');
  }
}

export const otpSender: OtpSender =
  env.SMS_PROVIDER === 'noop' ? new NoopOtpSender() : new ConsoleOtpSender();
