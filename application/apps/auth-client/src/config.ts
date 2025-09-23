
export const Config = {
    // Auth0 Configuration
    get auth0ClientId() {
        const clientId = process.env.AUTH0_CLIENT_ID;
        if (!clientId) {
            throw new Error('AUTH0_CLIENT_ID is not set in environment variables');
        }
        return clientId;
    },

    get auth0IssuerBaseUrl() {
        const issuerBaseUrl = process.env.AUTH0_ISSUER_BASE_URL;
        if (!issuerBaseUrl) {
            throw new Error('AUTH0_ISSUER_BASE_URL is not set in environment variables');
        }
        return issuerBaseUrl;
    },

    get auth0ClientSecret() {
        const clientSecret = process.env.AUTH0_CLIENT_SECRET;
        if (!clientSecret) {
            throw new Error('AUTH0_CLIENT_SECRET is not set in environment variables');
        }
        return clientSecret;
    },

    get auth0Secret() {
        const secret = process.env.AUTH0_SECRET;
        if (!secret) {
            throw new Error('AUTH0_SECRET is not set in environment variables');
        }
        return secret;
    },

    get myProviderClientId() {
        const clientId = process.env.MY_PROVIDER_CLIENT_ID;
        if (!clientId) {
            throw new Error('MY_PROVIDER_CLIENT_ID is not set in environment variables');
        }
        return clientId;
    },

    get myProviderIssuerBaseUrl() {
        const issuerBaseUrl = process.env.MY_PROVIDER_ISSUER_BASE_URL;
        if (!issuerBaseUrl) {
            throw new Error('MY_PROVIDER_ISSUER_BASE_URL is not set in environment variables');
        }
        return issuerBaseUrl;
    },

    get myProviderClientSecret() {
        const clientSecret = process.env.MY_PROVIDER_CLIENT_SECRET;
        if (!clientSecret) {
            throw new Error('MY_PROVIDER_CLIENT_SECRET is not set in environment variables');
        }
        return clientSecret;
    }
}