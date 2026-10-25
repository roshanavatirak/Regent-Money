import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';

export const statementVaultService = {
  getServiceKey(bankProfileId: string): string {
    return `regent_stmt_vault_${bankProfileId}`;
  },

  async getSavedPassword(bankProfileId: string): Promise<string | null> {
    if (!bankProfileId) return null;
    if (Platform.OS === 'web') {
      try {
        return sessionStorage.getItem(`stmt_vault_${bankProfileId}`);
      } catch {
        return null;
      }
    }

    try {
      const service = this.getServiceKey(bankProfileId);
      const credentials = await Keychain.getGenericPassword({ service });
      if (credentials && credentials.password) {
        return credentials.password;
      }
      return null;
    } catch {
      return null;
    }
  },

  async savePassword(bankProfileId: string, password: string): Promise<void> {
    if (!bankProfileId || !password) return;
    if (Platform.OS === 'web') {
      try {
        sessionStorage.setItem(`stmt_vault_${bankProfileId}`, password);
      } catch {
        // ignore
      }
      return;
    }

    try {
      const service = this.getServiceKey(bankProfileId);
      await Keychain.setGenericPassword('bank_statement_vault', password, {
        service,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      });
    } catch {
      // Fallback for emulators or older devices that do not have hardware TEE
      try {
        const service = this.getServiceKey(bankProfileId);
        await Keychain.setGenericPassword('bank_statement_vault', password, {
          service,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch (err: any) {
        console.warn('[statementVaultService] Could not persist password to hardware vault:', err?.message);
      }
    }
  },

  async clearPassword(bankProfileId: string): Promise<void> {
    if (!bankProfileId) return;
    if (Platform.OS === 'web') {
      try {
        sessionStorage.removeItem(`stmt_vault_${bankProfileId}`);
      } catch {
        // ignore
      }
      return;
    }

    try {
      const service = this.getServiceKey(bankProfileId);
      await Keychain.resetGenericPassword({ service });
    } catch {
      // ignore
    }
  },
};
