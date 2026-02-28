import { firebaseClient } from './FirebaseClient.js';

export class CloudAuthService {
    constructor() {
        this.initialized = false;
        this.context = null;
        this.user = null;
        this.unsubscribeAuth = null;
        this.listeners = new Set();
    }

    async init() {
        if (this.initialized) {
            return this.getState();
        }

        this.context = await firebaseClient.init();
        if (!this.context?.enabled) {
            this.initialized = true;
            return this.getState();
        }

        const { auth, authMod } = this.context;

        try {
            await authMod.setPersistence(auth, authMod.browserLocalPersistence);
        } catch (error) {
            console.warn('Auth persistence setup failed:', error);
        }

        this.unsubscribeAuth = authMod.onAuthStateChanged(auth, (firebaseUser) => {
            this.user = this.mapUser(firebaseUser);
            this.notify();
        });

        this.initialized = true;
        return this.getState();
    }

    mapUser(firebaseUser) {
        if (!firebaseUser) return null;

        return {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'Player',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || '',
            providerId: firebaseUser.providerData?.[0]?.providerId || 'unknown'
        };
    }

    getState() {
        return {
            enabled: Boolean(this.context?.enabled),
            isSignedIn: Boolean(this.user),
            user: this.user,
            reason: this.context?.reason || null,
            error: this.context?.error || null
        };
    }

    onChange(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        this.listeners.add(listener);
        listener(this.getState());

        return () => {
            this.listeners.delete(listener);
        };
    }

    notify() {
        const state = this.getState();
        this.listeners.forEach((listener) => {
            try {
                listener(state);
            } catch (error) {
                console.warn('Auth state listener failed:', error);
            }
        });
    }

    async signInWithGoogle() {
        return this.signInWithProvider('google');
    }

    async signInWithApple() {
        return this.signInWithProvider('apple');
    }

    async signInWithProvider(providerType) {
        await this.init();
        if (!this.context?.enabled) {
            throw new Error('클라우드 인증이 비활성화되어 있습니다.');
        }

        const { auth, authMod } = this.context;
        const provider = providerType === 'google'
            ? new authMod.GoogleAuthProvider()
            : new authMod.OAuthProvider('apple.com');

        if (providerType === 'apple' && typeof provider.addScope === 'function') {
            provider.addScope('email');
            provider.addScope('name');
        }

        try {
            await authMod.signInWithPopup(auth, provider);
            return { redirect: false };
        } catch (error) {
            const code = String(error?.code || '');
            const shouldUseRedirect = code.includes('popup')
                || code.includes('operation-not-supported-in-this-environment');

            if (!shouldUseRedirect) {
                throw error;
            }

            await authMod.signInWithRedirect(auth, provider);
            return { redirect: true };
        }
    }

    async signOut() {
        await this.init();
        if (!this.context?.enabled) return;
        await this.context.authMod.signOut(this.context.auth);
    }

    async updateDisplayName(displayName) {
        await this.init();
        if (!this.context?.enabled) return null;

        const nextName = String(displayName || '').trim();
        if (!nextName) return this.user;

        const currentUser = this.context.auth.currentUser;
        if (!currentUser) return this.user;

        await this.context.authMod.updateProfile(currentUser, { displayName: nextName });
        this.user = this.mapUser(currentUser);
        this.notify();
        return this.user;
    }

    getUser() {
        return this.user;
    }
}

export const cloudAuth = new CloudAuthService();
