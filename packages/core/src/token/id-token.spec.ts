import { generateIdToken } from "./id-token";

describe('generateIdToken', () => {
    it('should generate a valid ID token', async () => {
        // テストケースの実装例
        const result = await generateIdToken({
            urlIssuedToken: 'https://example.com/token',
            userId: 'user123',
            audience: ['clientId123'],
            expirationSeconds: 3600,
            authTime: new Date()
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(typeof result.value).toBe('string');
            // 追加の検証ロジックをここに記述
        }
    });
});