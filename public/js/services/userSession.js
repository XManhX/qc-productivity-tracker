import { fetchMe } from './api.js';

const CACHE_KEY = 'qc_user_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 phút

class UserSessionManager {
    constructor() {
        this._listeners = [];
        this._user = null;
        this._loadingPromise = null;
    }

    // Lấy user từ cache hoặc fetch mới
    getUser() {
        const cached = this._getFromCache();
        if (cached) {
            this._user = cached;
            return Promise.resolve(cached);
        }

        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = fetchMe()
            .then(user => {
                this._user = user;
                this._saveToCache(user);
                this._notifyListeners(user);
                this._loadingPromise = null;
                return user;
            })
            .catch(err => {
                this._loadingPromise = null;
                if (err.message.includes('401') || err.message.includes('token')) {
                    this.clear();
                    window.location.href = '/login.html';
                }
                throw err;
            });

        return this._loadingPromise;
    }

    // Đăng ký callback khi user được tải (cho component khác)
    onUserLoaded(callback) {
        this._listeners.push(callback);
        if (this._user) callback(this._user);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    }

    clear() {
        this._user = null;
        this._loadingPromise = null;
        sessionStorage.removeItem(CACHE_KEY);
    }

    _getFromCache() {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { data, timestamp } = JSON.parse(raw);
            if (Date.now() - timestamp > CACHE_DURATION) {
                sessionStorage.removeItem(CACHE_KEY);
                return null;
            }
            return data;
        } catch { return null; }
    }

    _saveToCache(user) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                data: user,
                timestamp: Date.now()
            }));
        } catch { }
    }

    _notifyListeners(user) {
        this._listeners.forEach(cb => cb(user));
    }
}

const userSession = new UserSessionManager();
export default userSession;