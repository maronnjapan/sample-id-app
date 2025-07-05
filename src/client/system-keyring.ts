import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * クロスプラットフォーム対応システムキーリング
 * Windows: Windows Credential Manager
 * macOS: Keychain
 * Linux/WSL: gnome-keyring (secret-tool)
 */
export class SystemKeyring {
  private readonly serviceName = 'sample-id-app';
  private readonly accountName = 'auth_code';
  private readonly platform = os.platform();

  async store(code: string): Promise<void> {
    try {
      switch (this.platform) {
        case 'win32':
          await this.storeWindows(code);
          break;
        case 'darwin':
          await this.storeMacOS(code);
          break;
        case 'linux':
        default:
          await this.storeLinux(code);
          break;
      }
      console.log('Code stored securely in system keyring');
    } catch (error) {
      console.error('Failed to store in keyring:', error);
      throw new Error('Keyring storage failed');
    }
  }

  async retrieve(): Promise<string | null> {
    try {
      let result: string | null = null;
      
      switch (this.platform) {
        case 'win32':
          result = await this.retrieveWindows();
          break;
        case 'darwin':
          result = await this.retrieveMacOS();
          break;
        case 'linux':
        default:
          result = await this.retrieveLinux();
          break;
      }
      
      // 取得後に削除（ワンタイム使用）
      if (result) {
        await this.delete();
      }
      
      return result;
    } catch (error) {
      console.log('No code found in keyring or keyring unavailable');
      return null;
    }
  }

  private async delete(): Promise<void> {
    try {
      switch (this.platform) {
        case 'win32':
          await this.deleteWindows();
          break;
        case 'darwin':
          await this.deleteMacOS();
          break;
        case 'linux':
        default:
          await this.deleteLinux();
          break;
      }
    } catch (error) {
      console.error('Failed to clear keyring entry:', error);
    }
  }

  // Windows Implementation
  private async storeWindows(code: string): Promise<void> {
    const target = `${this.serviceName}:${this.accountName}`;
    await execAsync(`cmdkey /generic:"${target}" /user:"${this.accountName}" /pass:"${code}"`);
  }

  private async retrieveWindows(): Promise<string | null> {
    const target = `${this.serviceName}:${this.accountName}`;
    try {
      const { stdout } = await execAsync(`cmdkey /list:"${target}"`);
      // Windows credential manager doesn't directly return password, 
      // need to use PowerShell or Windows API
      const { stdout: password } = await execAsync(`powershell -Command "
        $cred = Get-StoredCredential -Target '${target}' -ErrorAction SilentlyContinue;
        if ($cred) { $cred.GetNetworkCredential().Password }
      "`);
      return password.trim() || null;
    } catch {
      return null;
    }
  }

  private async deleteWindows(): Promise<void> {
    const target = `${this.serviceName}:${this.accountName}`;
    await execAsync(`cmdkey /delete:"${target}"`);
  }

  // macOS Implementation
  private async storeMacOS(code: string): Promise<void> {
    await execAsync(`security add-generic-password -s "${this.serviceName}" -a "${this.accountName}" -w "${code}" -U`);
  }

  private async retrieveMacOS(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`security find-generic-password -s "${this.serviceName}" -a "${this.accountName}" -w`);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  private async deleteMacOS(): Promise<void> {
    await execAsync(`security delete-generic-password -s "${this.serviceName}" -a "${this.accountName}"`);
  }

  // Linux Implementation - フォールバック機能付き
  private async storeLinux(code: string): Promise<void> {
    try {
      // gnome-keyringを試行
      await execAsync(`echo "${code}" | secret-tool store --label="Sample ID App Auth Code" service "${this.serviceName}" account "${this.accountName}"`, { timeout: 5000 });
    } catch (error) {
      console.warn('secret-tool failed, falling back to file storage:', error);
      // フォールバック: 暗号化ファイルストレージ
      await this.storeLinuxFallback(code);
    }
  }

  private async retrieveLinux(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`secret-tool lookup service "${this.serviceName}" account "${this.accountName}"`, { timeout: 3000 });
      return stdout.trim();
    } catch {
      // フォールバック: ファイルストレージから取得
      return await this.retrieveLinuxFallback();
    }
  }

  private async deleteLinux(): Promise<void> {
    try {
      await execAsync(`secret-tool clear service "${this.serviceName}" account "${this.accountName}"`, { timeout: 3000 });
    } catch {
      // フォールバック: ファイル削除
      await this.deleteLinuxFallback();
    }
  }

  // Linux フォールバック実装（暗号化ファイル）
  private async storeLinuxFallback(code: string): Promise<void> {
    const crypto = require('crypto');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const storageDir = path.join(os.homedir(), '.sample-id-app');
    const keyFile = path.join(storageDir, 'storage.key');
    const codeFile = path.join(storageDir, 'auth_code.enc');

    // ディレクトリ作成
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { mode: 0o700 });
    }

    // キー取得または生成
    let key: Buffer;
    if (fs.existsSync(keyFile)) {
      key = fs.readFileSync(keyFile);
    } else {
      key = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, key, { mode: 0o600 });
    }

    // 暗号化
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(code, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const data = { iv: iv.toString('hex'), encrypted };
    fs.writeFileSync(codeFile, JSON.stringify(data), { mode: 0o600 });
  }

  private async retrieveLinuxFallback(): Promise<string | null> {
    const crypto = require('crypto');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const storageDir = path.join(os.homedir(), '.sample-id-app');
    const keyFile = path.join(storageDir, 'storage.key');
    const codeFile = path.join(storageDir, 'auth_code.enc');

    if (!fs.existsSync(codeFile) || !fs.existsSync(keyFile)) {
      return null;
    }

    try {
      const key = fs.readFileSync(keyFile);
      const data = JSON.parse(fs.readFileSync(codeFile, 'utf8'));
      
      const decipher = crypto.createDecipher('aes-256-cbc', key);
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return null;
    }
  }

  private async deleteLinuxFallback(): Promise<void> {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const storageDir = path.join(os.homedir(), '.sample-id-app');
    const codeFile = path.join(storageDir, 'auth_code.enc');

    try {
      if (fs.existsSync(codeFile)) {
        fs.unlinkSync(codeFile);
      }
    } catch (error) {
      console.warn('Failed to delete fallback file:', error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      switch (this.platform) {
        case 'win32':
          await execAsync('where cmdkey');
          return true;
        case 'darwin':
          await execAsync('which security');
          return true;
        case 'linux':
        default:
          await execAsync('which secret-tool');
          return true;
      }
    } catch {
      return false;
    }
  }
}