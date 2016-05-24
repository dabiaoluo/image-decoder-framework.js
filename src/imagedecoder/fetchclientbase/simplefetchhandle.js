'use strict';

module.exports = SimpleFetchHandle;

/* global Promise: false */

function SimpleFetchHandle(fetchClient, dataCallback, queryIsKeyNeedFetch, options) {
    this._fetchClient = fetchClient;
	this._dataCallback = dataCallback;
    this._queryIsKeyNeedFetch = queryIsKeyNeedFetch;
    this._fetchLimit = (options || {}).fetchLimitPerFetcher || 2;
    this._keysToFetch = null;
    this._nextKeyToFetch = 0;
    this._activeFetches = {};
    this._activeFetchesCount = 0;
    this._isAborted = false;
    this._isStoppedCalled = false;
    this._resolveAbort = null;
}

SimpleFetchHandle.prototype.fetch = function fetch(keys) {
    if (this._keysToFetch !== null) {
        throw 'SimpleFetchHandle error: Request fetcher can fetch only one region';
    }
    
    this._keysToFetch = keys;
    this._nextKeyToFetch = 0;
    while (this._activeFetchesCount < this._fetchLimit) {
        if (!this._fetchSingleKey()) {
            break;
        }
    }
};

SimpleFetchHandle.prototype.abortAsync = function abortAsync() {
    var self = this;
    return new Promise(function(resolve, reject) {
        if (self._activeFetchesCount === 0) {
            resolve();
        } else {
            this._resolveAbort = resolve;
        }
    });
};

SimpleFetchHandle.prototype._fetchSingleKey = function fetchSingleKey() {
    var key;
    do {
        if (this._nextKeyToFetch >= this._keysToFetch.length) {
            return false;
        }
        key = this._keysToFetch[this._nextKeyToFetch++];
    } while (!this._queryIsKeyNeedFetch(key));
    
    var self = this;
    this._activeFetches[key] = true;
    ++this._activeFetchesCount;
    
    this._fetchClient.fetchInternal(key)
        .then(function resolved(result) {
            self._dataCallback(key, result, /*fetchEnded=*/true);
            self._fetchEnded(null, key, result);
        }).catch(function failed(reason) {
            self._fetchClient._onError(reason);
            self._fetchEnded(reason, key);
        });
    
    return true;
};

SimpleFetchHandle.prototype._fetchEnded = function fetchEnded(error, key, result) {
    delete this._activeFetches[key];
    --this._activeFetchesCount;
    
    if (!this._resolveAbort) {
        this._fetchSingleKey();
    } else if (this._activeFetchesCount === 0) {
        this._resolveAbort();
        this._resolveAbort = null;
    }
};