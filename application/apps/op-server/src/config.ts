require('dotenv').config();
const initConfig = () => {
    if (!process.env.FRONTEND_URL) {
        throw new Error('FRONTEND_URL is not defined');
    }

    return {
        frontendUrl: process.env.FRONTEND_URL,
        serverUrl: '',
        setServerUrl(url: string) {
            this.serverUrl = url;
        }
    }
}

export const Config = initConfig()
