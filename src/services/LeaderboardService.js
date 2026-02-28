import { storage } from '../systems/StorageManager.js';
import { cloudAuth } from './CloudAuthService.js';
import { firebaseClient } from './FirebaseClient.js';

function toSafeScore(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

export class LeaderboardService {
    constructor() {
        this.initialized = false;
        this.context = null;
    }

    async init() {
        if (this.initialized) return this.context;

        await cloudAuth.init();
        this.context = await firebaseClient.init();
        this.initialized = true;
        return this.context;
    }

    isEnabled() {
        return Boolean(this.context?.enabled);
    }

    getCollections() {
        const config = this.context?.config?.leaderboard || {};
        const collections = config.collections || {};
        return {
            overall: collections.overall || 'leaderboardOverall',
            gameRoot: collections.gameRoot || 'leaderboardByGame',
            gameEntrySubcollection: collections.gameEntrySubcollection || 'entries'
        };
    }

    getTopLimit() {
        const limit = Number(this.context?.config?.leaderboard?.topLimit);
        if (!Number.isFinite(limit) || limit <= 0) return 10;
        return Math.max(1, Math.min(50, Math.floor(limit)));
    }

    buildGameHighScoresMap() {
        const allGameStats = storage.getAllGameStats() || {};
        const highScores = {};

        Object.entries(allGameStats).forEach(([gameId, gameData]) => {
            const highScore = toSafeScore(gameData?.highScore);
            if (!gameId || highScore <= 0) return;
            highScores[gameId] = highScore;
        });

        return highScores;
    }

    calculateOverallRankingScore(gameHighScores) {
        return Object.values(gameHighScores).reduce((sum, score) => sum + toSafeScore(score), 0);
    }

    resolvePlayerProfile() {
        const profile = storage.getProfile();
        const authUser = cloudAuth.getUser();

        return {
            uid: authUser?.uid || null,
            nickname: profile?.nickname || authUser?.displayName || 'Player',
            avatar: profile?.avatar || 'default',
            email: authUser?.email || '',
            providerId: authUser?.providerId || profile?.provider || 'guest'
        };
    }

    async syncFromLocal(gameId = null) {
        await this.init();
        if (!this.context?.enabled) {
            return { enabled: false, reason: this.context?.reason || 'disabled' };
        }

        const player = this.resolvePlayerProfile();
        if (!player.uid) {
            return { enabled: true, signedIn: false };
        }

        const { db, fireMod } = this.context;
        const collections = this.getCollections();
        const gameScores = this.buildGameHighScoresMap();
        const overallScore = this.calculateOverallRankingScore(gameScores);

        const writeTasks = [];
        const highScoreByGame = gameScores;

        if (gameId) {
            const selectedScore = toSafeScore(highScoreByGame[gameId]);
            if (selectedScore > 0) {
                writeTasks.push(
                    this.upsertGameEntry({
                        db,
                        fireMod,
                        collections,
                        uid: player.uid,
                        gameId,
                        score: selectedScore,
                        player
                    })
                );
            }
        } else {
            Object.entries(highScoreByGame).forEach(([targetGameId, score]) => {
                if (toSafeScore(score) <= 0) return;
                writeTasks.push(
                    this.upsertGameEntry({
                        db,
                        fireMod,
                        collections,
                        uid: player.uid,
                        gameId: targetGameId,
                        score,
                        player
                    })
                );
            });
        }

        writeTasks.push(
            this.upsertOverallEntry({
                db,
                fireMod,
                collections,
                uid: player.uid,
                overallScore,
                gameHighScores: highScoreByGame,
                player
            })
        );

        await Promise.all(writeTasks);

        return {
            enabled: true,
            signedIn: true,
            uid: player.uid,
            overallScore
        };
    }

    async upsertGameEntry({ db, fireMod, collections, uid, gameId, score, player }) {
        const scoreValue = toSafeScore(score);
        const entryRef = fireMod.doc(
            db,
            collections.gameRoot,
            gameId,
            collections.gameEntrySubcollection,
            uid
        );

        const existing = await fireMod.getDoc(entryRef);
        const previousScore = existing.exists() ? toSafeScore(existing.data()?.score) : 0;
        const finalScore = Math.max(previousScore, scoreValue);

        await fireMod.setDoc(entryRef, {
            uid,
            gameId,
            score: finalScore,
            nickname: player.nickname,
            avatar: player.avatar,
            email: player.email,
            providerId: player.providerId,
            updatedAt: fireMod.serverTimestamp()
        }, { merge: true });
    }

    async upsertOverallEntry({ db, fireMod, collections, uid, overallScore, gameHighScores, player }) {
        const overallRef = fireMod.doc(db, collections.overall, uid);
        await fireMod.setDoc(overallRef, {
            uid,
            overallScore: toSafeScore(overallScore),
            gameHighScores,
            nickname: player.nickname,
            avatar: player.avatar,
            email: player.email,
            providerId: player.providerId,
            updatedAt: fireMod.serverTimestamp()
        }, { merge: true });
    }

    async fetchTopOverall(limitCount) {
        await this.init();
        if (!this.context?.enabled) return [];

        const { db, fireMod } = this.context;
        const collections = this.getCollections();
        const maxCount = Number.isFinite(limitCount) ? Math.floor(limitCount) : this.getTopLimit();
        const finalLimit = Math.max(1, Math.min(50, maxCount));

        const rankingQuery = fireMod.query(
            fireMod.collection(db, collections.overall),
            fireMod.orderBy('overallScore', 'desc'),
            fireMod.limit(finalLimit)
        );

        const snapshot = await fireMod.getDocs(rankingQuery);
        return snapshot.docs.map((doc, index) => {
            const data = doc.data() || {};
            return {
                rank: index + 1,
                uid: data.uid || doc.id,
                nickname: data.nickname || 'Player',
                avatar: data.avatar || 'default',
                score: toSafeScore(data.overallScore)
            };
        });
    }

    async fetchTopForGame(gameId, limitCount) {
        if (!gameId) return [];

        await this.init();
        if (!this.context?.enabled) return [];

        const { db, fireMod } = this.context;
        const collections = this.getCollections();
        const maxCount = Number.isFinite(limitCount) ? Math.floor(limitCount) : this.getTopLimit();
        const finalLimit = Math.max(1, Math.min(50, maxCount));

        const rankingQuery = fireMod.query(
            fireMod.collection(db, collections.gameRoot, gameId, collections.gameEntrySubcollection),
            fireMod.orderBy('score', 'desc'),
            fireMod.limit(finalLimit)
        );

        const snapshot = await fireMod.getDocs(rankingQuery);
        return snapshot.docs.map((doc, index) => {
            const data = doc.data() || {};
            return {
                rank: index + 1,
                uid: data.uid || doc.id,
                nickname: data.nickname || 'Player',
                avatar: data.avatar || 'default',
                score: toSafeScore(data.score)
            };
        });
    }

    async fetchMyOverallRank(uid) {
        await this.init();
        if (!this.context?.enabled || !uid) return null;

        const { db, fireMod } = this.context;
        const collections = this.getCollections();
        const myRef = fireMod.doc(db, collections.overall, uid);
        const mySnapshot = await fireMod.getDoc(myRef);
        if (!mySnapshot.exists()) return null;

        const myData = mySnapshot.data() || {};
        const myScore = toSafeScore(myData.overallScore);

        const higherScoreQuery = fireMod.query(
            fireMod.collection(db, collections.overall),
            fireMod.where('overallScore', '>', myScore)
        );

        const countSnapshot = await fireMod.getCountFromServer(higherScoreQuery);
        const higherCount = Number(countSnapshot.data()?.count || 0);

        return {
            uid,
            nickname: myData.nickname || 'Player',
            avatar: myData.avatar || 'default',
            score: myScore,
            rank: higherCount + 1
        };
    }

    async fetchMyGameRank(uid, gameId) {
        if (!uid || !gameId) return null;

        await this.init();
        if (!this.context?.enabled) return null;

        const { db, fireMod } = this.context;
        const collections = this.getCollections();
        const myRef = fireMod.doc(
            db,
            collections.gameRoot,
            gameId,
            collections.gameEntrySubcollection,
            uid
        );
        const mySnapshot = await fireMod.getDoc(myRef);
        if (!mySnapshot.exists()) return null;

        const myData = mySnapshot.data() || {};
        const myScore = toSafeScore(myData.score);

        const higherScoreQuery = fireMod.query(
            fireMod.collection(db, collections.gameRoot, gameId, collections.gameEntrySubcollection),
            fireMod.where('score', '>', myScore)
        );
        const countSnapshot = await fireMod.getCountFromServer(higherScoreQuery);
        const higherCount = Number(countSnapshot.data()?.count || 0);

        return {
            uid,
            nickname: myData.nickname || 'Player',
            avatar: myData.avatar || 'default',
            score: myScore,
            rank: higherCount + 1
        };
    }

    async getLeaderboardSnapshot({ gameId, topLimit }) {
        await this.init();
        if (!this.context?.enabled) {
            return {
                enabled: false,
                reason: this.context?.reason || 'disabled',
                overallTop: [],
                gameTop: [],
                myOverall: null,
                myGame: null
            };
        }

        const user = cloudAuth.getUser();
        const uid = user?.uid || null;
        const limitCount = Number.isFinite(topLimit) ? Math.floor(topLimit) : this.getTopLimit();

        const [overallTop, gameTop, myOverall, myGame] = await Promise.all([
            this.fetchTopOverall(limitCount),
            this.fetchTopForGame(gameId, limitCount),
            uid ? this.fetchMyOverallRank(uid) : Promise.resolve(null),
            uid && gameId ? this.fetchMyGameRank(uid, gameId) : Promise.resolve(null)
        ]);

        return {
            enabled: true,
            overallTop,
            gameTop,
            myOverall,
            myGame
        };
    }

    async getAllGameLeaderboardSnapshot({ gameIds = [], topLimit } = {}) {
        await this.init();
        if (!this.context?.enabled) {
            return {
                enabled: false,
                reason: this.context?.reason || 'disabled',
                overallTop: [],
                myOverall: null,
                games: {}
            };
        }

        const normalizedGameIds = Array.from(new Set((gameIds || []).filter(Boolean)));
        const user = cloudAuth.getUser();
        const uid = user?.uid || null;
        const limitCount = Number.isFinite(topLimit) ? Math.floor(topLimit) : this.getTopLimit();

        const [overallTop, myOverall, perGameEntries] = await Promise.all([
            this.fetchTopOverall(limitCount),
            uid ? this.fetchMyOverallRank(uid) : Promise.resolve(null),
            Promise.all(normalizedGameIds.map(async (gameId) => {
                const [top, my] = await Promise.all([
                    this.fetchTopForGame(gameId, limitCount),
                    uid ? this.fetchMyGameRank(uid, gameId) : Promise.resolve(null)
                ]);
                return [gameId, { top, my }];
            }))
        ]);

        return {
            enabled: true,
            overallTop,
            myOverall,
            games: Object.fromEntries(perGameEntries)
        };
    }
}

export const leaderboardService = new LeaderboardService();
