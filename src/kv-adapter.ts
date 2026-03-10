/**
 * Cloudflare Workers KV を使用した oidc-provider 用アダプター
 * oidc-provider が必要とする Adapter インターフェースを実装
 */
export class KvAdapter {
  private name: string;
  private kv: KVNamespace;

  constructor(name: string, kv: KVNamespace) {
    this.name = name;
    this.kv = kv;
  }

  private key(id: string): string {
    return `${this.name}:${id}`;
  }

  private grantKey(grantId: string): string {
    return `grant:${grantId}`;
  }

  private userCodeKey(userCode: string): string {
    return `userCode:${userCode}`;
  }

  private uidKey(uid: string): string {
    return `uid:${uid}`;
  }

  async upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void> {
    const key = this.key(id);
    const opts: KVNamespacePutOptions = {};
    if (expiresIn) {
      opts.expirationTtl = expiresIn;
    }

    await this.kv.put(key, JSON.stringify(payload), opts);

    // grantId でのルックアップ用インデックス
    const grantId = payload.grantId as string | undefined;
    if (grantId) {
      const grantKey = this.grantKey(grantId);
      const existing = await this.kv.get<string[]>(grantKey, "json");
      const grantIds = existing || [];
      grantIds.push(key);
      await this.kv.put(grantKey, JSON.stringify(grantIds), opts);
    }

    // userCode でのルックアップ用インデックス
    const userCode = payload.userCode as string | undefined;
    if (userCode) {
      await this.kv.put(this.userCodeKey(userCode), id, opts);
    }

    // uid でのルックアップ用インデックス
    const uid = payload.uid as string | undefined;
    if (uid) {
      await this.kv.put(this.uidKey(uid), id, opts);
    }
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const data = await this.kv.get<Record<string, unknown>>(this.key(id), "json");
    return data || undefined;
  }

  async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    const id = await this.kv.get(this.uidKey(uid), "text");
    if (!id) return undefined;
    return this.find(id);
  }

  async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
    const id = await this.kv.get(this.userCodeKey(userCode), "text");
    if (!id) return undefined;
    return this.find(id);
  }

  async consume(id: string): Promise<void> {
    const data = await this.find(id);
    if (data) {
      data.consumed = Math.floor(Date.now() / 1000);
      await this.kv.put(this.key(id), JSON.stringify(data));
    }
  }

  async destroy(id: string): Promise<void> {
    await this.kv.delete(this.key(id));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    const grantKey = this.grantKey(grantId);
    const keys = await this.kv.get<string[]>(grantKey, "json");
    if (keys) {
      await Promise.all(keys.map((key) => this.kv.delete(key)));
      await this.kv.delete(grantKey);
    }
  }
}
