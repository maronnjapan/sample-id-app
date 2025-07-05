import crypto from 'crypto';

/**
 * インメモリ共有鍵暗号化ストレージ
 * - プロセス起動時にランダム共有鍵を生成
 * - アクセストークンを暗号化してメモリに保存
 * - プロセス終了時に自動削除（再認証が必要）
 */
export class MemoryStorage {
  private static instance: MemoryStorage;
  private sharedKey: Buffer;
  private encryptedAccessToken: string | null = null;

  private constructor() {
    // プロセス起動時にランダム共有鍵を生成
    this.sharedKey = crypto.randomBytes(32);
    console.log('Generated new shared key for this session');
  }

  static getInstance(): MemoryStorage {
    if (!MemoryStorage.instance) {
      MemoryStorage.instance = new MemoryStorage();
    }
    return MemoryStorage.instance;
  }

  // 認可コード関連のメソッドは不要になったため削除

  /**
   * アクセストークンを暗号化してメモリに保存
   */
  storeAccessToken(token: string): void {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.sharedKey, iv);
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      this.encryptedAccessToken = iv.toString('hex') + ':' + encrypted;
      console.log('Access token encrypted and stored in memory');
    } catch (error) {
      console.error('Access token encryption failed:', error);
      throw new Error('Failed to encrypt access token');
    }
  }

  /**
   * 暗号化されたアクセストークンを復号化して取得
   */
  getAccessToken(): string | null {
    if (!this.encryptedAccessToken) {
      return null;
    }

    try {
      const [ivHex, encryptedHex] = this.encryptedAccessToken.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.sharedKey, iv);
      
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Access token decryption failed:', error);
      this.encryptedAccessToken = null; // エラー時は削除
      return null;
    }
  }

  // hasCode() メソッドは不要になったため削除

  /**
   * 保存されているアクセストークンがあるかチェック
   */
  hasAccessToken(): boolean {
    return this.encryptedAccessToken !== null;
  }

  /**
   * メモリからすべてのデータを削除
   */
  clear(): void {
    this.encryptedAccessToken = null;
    console.log('Memory storage cleared');
  }

  /**
   * 新しい共有鍵を生成（セッションリセット）
   */
  regenerateKey(): void {
    this.sharedKey = crypto.randomBytes(32);
    this.encryptedAccessToken = null;
    console.log('Shared key regenerated, storage cleared');
  }
}