/**
 * Cloud feature config.
 * - Keep enabled=false for local-only mode.
 * - Fill firebase fields and set enabled=true to activate auth/leaderboard.
 */
export const cloudConfig = {
    enabled: false,
    firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: '',
        storageBucket: '',
        messagingSenderId: ''
    },
    leaderboard: {
        topLimit: 10,
        collections: {
            overall: 'leaderboardOverall',
            gameRoot: 'leaderboardByGame',
            gameEntrySubcollection: 'entries'
        }
    }
};
