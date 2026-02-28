import { cloudConfig } from '../config/cloud-config.js';

const FIREBASE_CDN_VERSION = '11.0.2';
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}`;

export class FirebaseClient {
    constructor() {
        this.initialized = false;
        this.initPromise = null;
        this.context = {
            enabled: false,
            reason: 'not-initialized'
        };
    }

    resolveConfig() {
        const runtimeConfig = (typeof globalThis !== 'undefined' && globalThis.__MGP_CLOUD_CONFIG__)
            ? globalThis.__MGP_CLOUD_CONFIG__
            : {};

        const mergedFirebase = {
            ...(cloudConfig.firebase || {}),
            ...(runtimeConfig.firebase || {})
        };

        const mergedLeaderboard = {
            ...(cloudConfig.leaderboard || {}),
            ...(runtimeConfig.leaderboard || {}),
            collections: {
                ...((cloudConfig.leaderboard && cloudConfig.leaderboard.collections) || {}),
                ...((runtimeConfig.leaderboard && runtimeConfig.leaderboard.collections) || {})
            }
        };

        const enabled = runtimeConfig.enabled ?? cloudConfig.enabled;
        return {
            ...cloudConfig,
            ...runtimeConfig,
            enabled: Boolean(enabled),
            firebase: mergedFirebase,
            leaderboard: mergedLeaderboard
        };
    }

    hasRequiredFirebaseKeys(firebase = {}) {
        return Boolean(
            firebase.apiKey
            && firebase.authDomain
            && firebase.projectId
        );
    }

    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.bootstrap();
        return this.initPromise;
    }

    async bootstrap() {
        const config = this.resolveConfig();

        if (!config.enabled) {
            this.context = {
                enabled: false,
                config,
                reason: 'disabled'
            };
            this.initialized = true;
            return this.context;
        }

        if (!this.hasRequiredFirebaseKeys(config.firebase)) {
            this.context = {
                enabled: false,
                config,
                reason: 'missing-firebase-keys'
            };
            this.initialized = true;
            return this.context;
        }

        try {
            const [appMod, authMod, fireMod] = await Promise.all([
                import(`${FIREBASE_CDN_BASE}/firebase-app.js`),
                import(`${FIREBASE_CDN_BASE}/firebase-auth.js`),
                import(`${FIREBASE_CDN_BASE}/firebase-firestore.js`)
            ]);

            const app = appMod.initializeApp(config.firebase);
            const auth = authMod.getAuth(app);
            const db = fireMod.getFirestore(app);

            this.context = {
                enabled: true,
                config,
                app,
                auth,
                db,
                appMod,
                authMod,
                fireMod
            };
        } catch (error) {
            console.warn('Firebase bootstrap failed:', error);
            this.context = {
                enabled: false,
                config,
                reason: 'bootstrap-failed',
                error
            };
        }

        this.initialized = true;
        return this.context;
    }

    isEnabled() {
        return Boolean(this.context?.enabled);
    }

    getContext() {
        return this.context;
    }
}

export const firebaseClient = new FirebaseClient();
