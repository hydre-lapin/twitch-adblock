twitch-videoad.js application/javascript
(function () {
    if (!/(^|\.)twitch\.tv$/.test(window.location.hostname)) {
        return;
    }
    'use strict';

    const ourTwitchAdSolutionsVersion = 26;
    const globalContext = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (typeof globalContext.twitchAdSolutionsVersion !== 'undefined' && globalContext.twitchAdSolutionsVersion >= ourTwitchAdSolutionsVersion) {
        console.log(`[VAFT] Skipping as another version is already active (${globalContext.twitchAdSolutionsVersion})`);
        return;
    }
    window.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion;
    if (typeof unsafeWindow !== 'undefined') {
        try { unsafeWindow.twitchAdSolutionsVersion = ourTwitchAdSolutionsVersion; } catch {}
    }

    function declareOptions(scope) {
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.BackupPlayerTypes = [
            'embed',
            'popout',
            'autoplay'
        ];
        scope.FallbackPlayerType = 'embed';
        scope.ForceAccessTokenPlayerType = 'popout';
        scope.SkipPlayerReloadOnHevc = false;
        scope.AlwaysReloadPlayerOnAd = false;
        scope.ReloadPlayerAfterAd = false; // Smooth transition without black screen reload
        scope.PlayerReloadMinimalRequestsTime = 1500;
        scope.PlayerReloadMinimalRequestsPlayerIndex = 2; // autoplay
        scope.HasTriggeredPlayerReload = false;
        scope.StreamInfos = new Map();
        scope.StreamInfosByUrl = new Map();
        scope.GQLDeviceID = null;
        scope.ClientVersion = null;
        scope.ClientSession = null;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = undefined;
        scope.SimulatedAdsDepth = 0;
        scope.PlayerBufferingFix = true;
        scope.PlayerBufferingDelay = 1000;
        scope.PlayerBufferingSameStateCount = 4;
        scope.PlayerBufferingDangerZone = 0.3;
        scope.PlayerBufferingDoPlayerReload = false;
        scope.PlayerBufferingMinRepeatDelay = 12000;
        scope.PlayerBufferingPrerollCheckEnabled = true;
        scope.PlayerBufferingPrerollCheckOffset = 3;
        scope.V2API = false;
        scope.PlaybackAccessTokenSha256 = '0828119ded1c13477966434e15800ff57ddace7ba0e7726cbf5094f8116c41b';
        scope.IsAdStrippingEnabled = true;
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
    }

    let isActivelyStrippingAds = false;
    let localStorageHookFailed = false;
    const twitchWorkers = [];
    const workerStringConflicts = [
        'twitch',
        'isVariantA'
    ];
    const workerStringAllow = [];
    const workerStringReinsert = [
        'isVariantA',
        'besuper/',
        '${patch_url}'
    ];

    function getCleanWorker(worker) {
        let root = null;
        let parent = null;
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root || worker;
    }

    function getWorkersForReinsert(worker) {
        const result = [];
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                result.push(proto);
            }
            proto = Object.getPrototypeOf(proto);
        }
        return result;
    }

    function reinsertWorkers(worker, reinsert) {
        let parent = worker;
        for (let i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }

    function isValidWorker(worker) {
        if (!worker || typeof worker.toString !== 'function') return false;
        const workerString = worker.toString();
        return !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
    }

    function hookWindowWorker() {
        const reinsert = getWorkersForReinsert(window.Worker);
        const CleanWorker = getCleanWorker(window.Worker) || window.Worker;

        const newWorker = class Worker extends CleanWorker {
            constructor(twitchBlobUrl, options) {
                let isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv') || twitchBlobUrl.startsWith('blob:');
                } catch { }

                if (!isTwitchWorker) {
                    super(twitchBlobUrl, options);
                    return;
                }

                const newBlobStr = `
                    const pendingFetchRequests = new Map();
                    ${stripAdSegments.toString()}
                    ${getStreamUrlForResolution.toString()}
                    ${processM3U8.toString()}
                    ${hookWorkerFetch.toString()}
                    ${declareOptions.toString()}
                    ${getAccessToken.toString()}
                    ${gqlRequest.toString()}
                    ${parseAttributes.toString()}
                    ${getWasmWorkerJs.toString()}
                    ${getServerTimeFromM3u8.toString()}
                    ${replaceServerTimeInM3u8.toString()}

                    const workerString = getWasmWorkerJs(${JSON.stringify(twitchBlobUrl)});
                    declareOptions(self);
                    GQLDeviceID = ${JSON.stringify(GQLDeviceID || null)};
                    AuthorizationHeader = ${JSON.stringify(AuthorizationHeader || null)};
                    ClientIntegrityHeader = ${JSON.stringify(ClientIntegrityHeader || null)};
                    ClientVersion = ${JSON.stringify(ClientVersion || null)};
                    ClientSession = ${JSON.stringify(ClientSession || null)};
                    PlaybackAccessTokenSha256 = ${JSON.stringify(PlaybackAccessTokenSha256 || '0828119ded1c13477966434e15800ff57ddace7ba0e7726cbf5094f8116c41b')};

                    self.addEventListener('message', function(e) {
                        if (!e || !e.data) return;
                        const { key, value } = e.data;
                        if (key === 'UpdateClientVersion') {
                            ClientVersion = value;
                        } else if (key === 'UpdateClientSession') {
                            ClientSession = value;
                        } else if (key === 'UpdateClientId') {
                            ClientID = value;
                        } else if (key === 'UpdateDeviceId') {
                            GQLDeviceID = value;
                        } else if (key === 'UpdateClientIntegrityHeader') {
                            ClientIntegrityHeader = value;
                        } else if (key === 'UpdateAuthorizationHeader') {
                            AuthorizationHeader = value;
                        } else if (key === 'UpdatePlaybackAccessTokenSha256') {
                            PlaybackAccessTokenSha256 = value;
                        } else if (key === 'FetchResponse') {
                            const responseData = value;
                            if (responseData && pendingFetchRequests.has(responseData.id)) {
                                const { resolve, reject } = pendingFetchRequests.get(responseData.id);
                                pendingFetchRequests.delete(responseData.id);
                                if (responseData.error) {
                                    reject(new Error(responseData.error));
                                } else {
                                    const response = new Response(responseData.body, {
                                        status: responseData.status,
                                        statusText: responseData.statusText,
                                        headers: responseData.headers
                                    });
                                    resolve(response);
                                }
                            }
                        } else if (key === 'TriggeredPlayerReload') {
                            HasTriggeredPlayerReload = true;
                        } else if (key === 'SimulateAds') {
                            SimulatedAdsDepth = value;
                            console.log('[VAFT] SimulatedAdsDepth: ' + SimulatedAdsDepth);
                        } else if (key === 'AllSegmentsAreAdSegments') {
                            AllSegmentsAreAdSegments = !AllSegmentsAreAdSegments;
                            console.log('[VAFT] AllSegmentsAreAdSegments: ' + AllSegmentsAreAdSegments);
                        }
                    });

                    hookWorkerFetch();
                    try {
                        (0, eval)(workerString);
                    } catch (err) {
                        console.error('[VAFT] Failed to execute worker script:', err);
                    }
                `;

                super(URL.createObjectURL(new Blob([newBlobStr], { type: 'application/javascript' })), options);
                twitchWorkers.push(this);

                this.addEventListener('message', (e) => {
                    if (!e || !e.data) return;
                    if (e.data.key === 'UpdateAdBlockBanner') {
                        updateAdblockBanner(e.data);
                    } else if (e.data.key === 'PauseResumePlayer') {
                        doTwitchPlayerTask(true, false);
                    } else if (e.data.key === 'ReloadPlayer') {
                        doTwitchPlayerTask(false, true);
                    }
                });

                this.addEventListener('message', async (event) => {
                    if (event?.data?.key === 'FetchRequest') {
                        const fetchRequest = event.data.value;
                        const responseData = await handleWorkerFetchRequest(fetchRequest);
                        this.postMessage({
                            key: 'FetchResponse',
                            value: responseData
                        });
                    }
                });
            }
        };

        let workerInstance = reinsertWorkers(newWorker, reinsert);
        try {
            Object.defineProperty(window, 'Worker', {
                get: function () {
                    return workerInstance;
                },
                set: function (value) {
                    if (isValidWorker(value)) {
                        workerInstance = value;
                    } else {
                        console.log('[VAFT] Attempt to override Worker with untrusted instance denied');
                    }
                },
                configurable: true
            });
        } catch (e) {
            window.Worker = workerInstance;
        }
    }

    function getWasmWorkerJs(twitchBlobUrl) {
        try {
            const req = new XMLHttpRequest();
            req.open('GET', twitchBlobUrl, false);
            req.overrideMimeType('text/javascript');
            req.send();
            return req.responseText;
        } catch (err) {
            console.error('[VAFT] Failed to fetch wasm worker:', err);
            return '';
        }
    }

    function hookWorkerFetch() {
        const realFetch = fetch;
        const blankSegmentDataUrl = 'data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA';

        function isAdSegmentUrl(targetUrl) {
            if (!targetUrl || typeof targetUrl !== 'string') return false;
            if (AdSegmentCache.has(targetUrl)) return true;
            for (const cachedUrl of AdSegmentCache.keys()) {
                if (targetUrl.includes(cachedUrl) || cachedUrl.includes(targetUrl)) return true;
            }
            return false;
        }

        fetch = async function (url, options) {
            if (typeof url === 'string') {
                if (isAdSegmentUrl(url)) {
                    return realFetch(blankSegmentDataUrl, options);
                }

                const cleanUrl = url.trimEnd();
                if (cleanUrl.endsWith('.m3u8') || cleanUrl.includes('.m3u8?')) {
                    try {
                        const response = await realFetch(url, options);
                        if (response && response.status === 200) {
                            const text = await response.text();
                            const modified = await processM3U8(cleanUrl, text, realFetch);
                            return new Response(modified, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }
                        return response;
                    } catch (err) {
                        return realFetch(url, options);
                    }
                } else if (cleanUrl.includes('/channel/hls/') && !cleanUrl.includes('picture-by-picture')) {
                    V2API = cleanUrl.includes('/api/v2/');

                    let channelName = null;
                    try {
                        const pathSegments = new URL(cleanUrl).pathname.split('/');
                        const lastSeg = pathSegments[pathSegments.length - 1];
                        if (lastSeg) {
                            channelName = lastSeg.replace(/\.m3u8.*$/, '');
                        }
                    } catch {}
                    if (!channelName) {
                        const m = cleanUrl.match(/channel\/hls\/([^.\/?#]+)/i);
                        channelName = m ? m[1] : 'unknown';
                    }

                    let effectiveUrl = cleanUrl;
                    if (ForceAccessTokenPlayerType) {
                        try {
                            const tempUrl = new URL(cleanUrl);
                            tempUrl.searchParams.delete('parent_domains');
                            effectiveUrl = tempUrl.toString();
                        } catch {}
                    }

                    try {
                        const response = await realFetch(effectiveUrl, options);
                        if (response.status === 200) {
                            const encodingsM3u8 = await response.text();
                            const serverTime = getServerTimeFromM3u8(encodingsM3u8);

                            let streamInfo = StreamInfos instanceof Map ? StreamInfos.get(channelName) : StreamInfos[channelName];
                            if (streamInfo?.EncodingsM3U8) {
                                const m3u8Match = streamInfo.EncodingsM3U8.match(/^https?:.*\.m3u8/m);
                                if (m3u8Match) {
                                    try {
                                        const testResp = await realFetch(m3u8Match[0]);
                                        if (testResp.status !== 200) {
                                            streamInfo = null;
                                        }
                                    } catch {
                                        streamInfo = null;
                                    }
                                }
                            }

                            if (!streamInfo || !streamInfo.EncodingsM3U8) {
                                streamInfo = {
                                    ChannelName: channelName,
                                    IsShowingAd: false,
                                    LastPlayerReload: 0,
                                    EncodingsM3U8: encodingsM3u8,
                                    ModifiedM3U8: null,
                                    IsUsingModifiedM3U8: false,
                                    UsherParams: (new URL(cleanUrl)).search,
                                    RequestedAds: new Set(),
                                    Urls: {},
                                    ResolutionList: [],
                                    BackupEncodingsM3U8Cache: {},
                                    ActiveBackupPlayerType: null,
                                    IsMidroll: false,
                                    IsStrippingAdSegments: false,
                                    NumStrippedAdSegments: 0
                                };

                                if (StreamInfos instanceof Map) {
                                    StreamInfos.set(channelName, streamInfo);
                                } else {
                                    StreamInfos[channelName] = streamInfo;
                                }

                                const lines = encodingsM3u8.replace(/\r/g, '').split('\n');
                                for (let i = 0; i < lines.length - 1; i++) {
                                    if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                                        const attributes = parseAttributes(lines[i]);
                                        const resolution = attributes['RESOLUTION'];
                                        if (resolution) {
                                            const streamUrl = lines[i + 1].trim();
                                            const resolutionInfo = {
                                                Resolution: resolution,
                                                FrameRate: attributes['FRAME-RATE'] || 30,
                                                Codecs: attributes['CODECS'] || 'avc1',
                                                Url: streamUrl
                                            };
                                            streamInfo.Urls[streamUrl] = resolutionInfo;
                                            streamInfo.ResolutionList.push(resolutionInfo);

                                            if (StreamInfosByUrl instanceof Map) {
                                                StreamInfosByUrl.set(streamUrl, streamInfo);
                                            } else {
                                                StreamInfosByUrl[streamUrl] = streamInfo;
                                            }
                                        }
                                    }
                                }

                                const nonHevcResolutionList = streamInfo.ResolutionList.filter((el) => el.Codecs.startsWith('avc') || el.Codecs.startsWith('av0'));
                                if (AlwaysReloadPlayerOnAd || (nonHevcResolutionList.length > 0 && streamInfo.ResolutionList.some((el) => el.Codecs.startsWith('hev') || el.Codecs.startsWith('hvc')) && !SkipPlayerReloadOnHevc)) {
                                    if (nonHevcResolutionList.length > 0) {
                                        for (let i = 0; i < lines.length - 1; i++) {
                                            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                                                const resSettings = parseAttributes(lines[i].substring(lines[i].indexOf(':') + 1));
                                                const codecsKey = 'CODECS';
                                                if (resSettings[codecsKey] && (resSettings[codecsKey].startsWith('hev') || resSettings[codecsKey].startsWith('hvc'))) {
                                                    const oldResolution = resSettings['RESOLUTION'] || '1920x1080';
                                                    const [targetWidth, targetHeight] = oldResolution.split('x').map(Number);
                                                    const newResolutionInfo = [...nonHevcResolutionList].sort((a, b) => {
                                                        const [streamWidthA, streamHeightA] = a.Resolution.split('x').map(Number);
                                                        const [streamWidthB, streamHeightB] = b.Resolution.split('x').map(Number);
                                                        return Math.abs((streamWidthA * streamHeightA) - (targetWidth * targetHeight)) - Math.abs((streamWidthB * streamHeightB) - (targetWidth * targetHeight));
                                                    })[0];

                                                    if (newResolutionInfo) {
                                                        lines[i] = lines[i].replace(/CODECS="[^"]+"/, `CODECS="${newResolutionInfo.Codecs}"`);
                                                        lines[i + 1] = newResolutionInfo.Url + ' '.repeat(i + 1);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if (nonHevcResolutionList.length > 0 || AlwaysReloadPlayerOnAd) {
                                        streamInfo.ModifiedM3U8 = lines.join('\n');
                                    }
                                }
                            }

                            streamInfo.LastPlayerReload = Date.now();
                            const targetM3u8 = streamInfo.IsUsingModifiedM3U8 ? streamInfo.ModifiedM3U8 : streamInfo.EncodingsM3U8;
                            return new Response(replaceServerTimeInM3u8(targetM3u8, serverTime), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }
                        return response;
                    } catch (err) {
                        return realFetch(url, options);
                    }
                }
            }
            return realFetch.apply(this, arguments);
        };
    }

    function getServerTimeFromM3u8(encodingsM3u8) {
        if (!encodingsM3u8 || typeof encodingsM3u8 !== 'string') return null;
        if (V2API) {
            const matches = encodingsM3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
            return matches && matches[1] ? matches[1] : null;
        }
        const matches = encodingsM3u8.match(/SERVER-TIME="([0-9.]+)"/);
        return matches && matches[1] ? matches[1] : null;
    }

    function replaceServerTimeInM3u8(encodingsM3u8, newServerTime) {
        if (!encodingsM3u8 || typeof encodingsM3u8 !== 'string' || !newServerTime) return encodingsM3u8;
        if (V2API) {
            return encodingsM3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${newServerTime}$2`);
        }
        return encodingsM3u8.replace(/(SERVER-TIME=")[0-9.]+"/, `SERVER-TIME="${newServerTime}"`);
    }

    function stripAdSegments(textStr, stripAllSegments, streamInfo) {
        if (!textStr || typeof textStr !== 'string') return textStr;
        let hasStrippedAdSegments = false;
        const lines = textStr.replace(/\r/g, '').split('\n');
        const newAdUrl = 'https://twitch.tv';

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            line = line
                .replace(/(X-TV-TWITCH-AD-URL=")[^"]*(")/g, `$1${newAdUrl}$2`)
                .replace(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")[^"]*(")/g, `$1${newAdUrl}$2`);

            if (i < lines.length - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAllSegments || AllSegmentsAreAdSegments)) {
                const segmentUrl = lines[i + 1]?.trim();
                if (segmentUrl && !AdSegmentCache.has(segmentUrl)) {
                    if (streamInfo) streamInfo.NumStrippedAdSegments++;
                }
                if (segmentUrl) {
                    AdSegmentCache.set(segmentUrl, Date.now());
                }
                hasStrippedAdSegments = true;
            }

            if (line.includes(AdSignifier)) {
                hasStrippedAdSegments = true;
            }
            lines[i] = line;
        }

        if (hasStrippedAdSegments) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                    lines[i] = '';
                }
            }
        } else if (streamInfo) {
            streamInfo.NumStrippedAdSegments = 0;
        }

        if (streamInfo) {
            streamInfo.IsStrippingAdSegments = hasStrippedAdSegments;
        }

        const expiryTime = Date.now() - 120000;
        AdSegmentCache.forEach((timestamp, key, map) => {
            if (timestamp < expiryTime) {
                map.delete(key);
            }
        });

        return lines.join('\n');
    }

    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo) {
        if (!encodingsM3u8 || !resolutionInfo?.Resolution) return null;
        const encodingsLines = encodingsM3u8.replace(/\r/g, '').split('\n');
        const [targetWidth, targetHeight] = resolutionInfo.Resolution.split('x').map(Number);
        let matchedResolutionUrl = null;
        let matchedFrameRate = false;
        let closestResolutionUrl = null;
        let closestResolutionDifference = Infinity;

        for (let i = 0; i < encodingsLines.length - 1; i++) {
            if (encodingsLines[i].startsWith('#EXT-X-STREAM-INF') && encodingsLines[i + 1].includes('.m3u8')) {
                const attributes = parseAttributes(encodingsLines[i]);
                const resolution = attributes['RESOLUTION'];
                const frameRate = attributes['FRAME-RATE'];
                if (resolution) {
                    if (resolution === resolutionInfo.Resolution && (!matchedResolutionUrl || (!matchedFrameRate && frameRate === resolutionInfo.FrameRate))) {
                        matchedResolutionUrl = encodingsLines[i + 1].trim();
                        matchedFrameRate = frameRate === resolutionInfo.FrameRate;
                        if (matchedFrameRate) {
                            return matchedResolutionUrl;
                        }
                    }
                    const [width, height] = resolution.split('x').map(Number);
                    const difference = Math.abs((width * height) - (targetWidth * targetHeight));
                    if (difference < closestResolutionDifference) {
                        closestResolutionUrl = encodingsLines[i + 1].trim();
                        closestResolutionDifference = difference;
                    }
                }
            }
        }
        return matchedResolutionUrl || closestResolutionUrl;
    }

    async function processM3U8(url, textStr, realFetch) {
        const streamInfo = StreamInfosByUrl instanceof Map ? StreamInfosByUrl.get(url) : StreamInfosByUrl[url];
        if (!streamInfo) {
            return textStr;
        }

        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            streamInfo.LastPlayerReload = Date.now();
        }

        const haveAdTags = textStr.includes(AdSignifier) || SimulatedAdsDepth > 0;
        if (haveAdTags) {
            streamInfo.IsMidroll = textStr.includes('"MIDROLL"') || textStr.includes('"midroll"');
            if (!streamInfo.IsShowingAd) {
                streamInfo.IsShowingAd = true;
                postMessage({
                    key: 'UpdateAdBlockBanner',
                    isMidroll: streamInfo.IsMidroll,
                    hasAds: streamInfo.IsShowingAd,
                    isStrippingAdSegments: false
                });
            }

            if (!streamInfo.IsMidroll) {
                const lines = textStr.replace(/\r/g, '').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                        const nextLine = lines[i + 1]?.trim();
                        if (nextLine && !line.includes(',live') && !streamInfo.RequestedAds.has(nextLine)) {
                            streamInfo.RequestedAds.add(nextLine);
                            realFetch(nextLine).catch(() => {});
                            break;
                        }
                    }
                }
            }

            const currentResolution = streamInfo.Urls[url];
            if (!currentResolution) {
                return textStr;
            }

            const isHevc = currentResolution.Codecs?.startsWith('hev') || currentResolution.Codecs?.startsWith('hvc');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && streamInfo.ModifiedM3U8 && !streamInfo.IsUsingModifiedM3U8) {
                streamInfo.IsUsingModifiedM3U8 = true;
                streamInfo.LastPlayerReload = Date.now();
                postMessage({
                    key: 'ReloadPlayer'
                });
            }

            let backupPlayerType = null;
            let backupM3u8 = null;
            let fallbackM3u8 = null;
            let startIndex = 0;
            let isDoingMinimalRequests = false;

            if (streamInfo.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
                startIndex = PlayerReloadMinimalRequestsPlayerIndex;
                isDoingMinimalRequests = true;
            }

            for (let playerTypeIndex = startIndex; !backupM3u8 && playerTypeIndex < BackupPlayerTypes.length; playerTypeIndex++) {
                const playerType = BackupPlayerTypes[playerTypeIndex];
                const realPlayerType = playerType.replace('-CACHED', '');
                const isFullyCachedPlayerType = playerType !== realPlayerType;

                for (let i = 0; i < 2; i++) {
                    let isFreshM3u8 = false;
                    let encodingsM3u8 = streamInfo.BackupEncodingsM3U8Cache[playerType];
                    if (!encodingsM3u8) {
                        isFreshM3u8 = true;
                        try {
                            const accessTokenResponse = await getAccessToken(streamInfo.ChannelName, realPlayerType);
                            if (accessTokenResponse && accessTokenResponse.status === 200) {
                                const accessToken = await accessTokenResponse.json();
                                if (accessToken?.data?.streamPlaybackAccessToken) {
                                    const urlInfo = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + streamInfo.ChannelName + '.m3u8' + streamInfo.UsherParams);
                                    urlInfo.searchParams.set('sig', accessToken.data.streamPlaybackAccessToken.signature);
                                    urlInfo.searchParams.set('token', accessToken.data.streamPlaybackAccessToken.value);
                                    const encodingsM3u8Response = await realFetch(urlInfo.href);
                                    if (encodingsM3u8Response.status === 200) {
                                        encodingsM3u8 = streamInfo.BackupEncodingsM3U8Cache[playerType] = await encodingsM3u8Response.text();
                                    }
                                }
                            }
                        } catch (err) { }
                    }

                    if (encodingsM3u8) {
                        try {
                            const streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, currentResolution);
                            if (streamM3u8Url) {
                                const streamM3u8Response = await realFetch(streamM3u8Url);
                                if (streamM3u8Response.status === 200) {
                                    const m3u8Text = await streamM3u8Response.text();
                                    if (m3u8Text) {
                                        if (playerType === FallbackPlayerType) {
                                            fallbackM3u8 = m3u8Text;
                                        }
                                        if ((!m3u8Text.includes(AdSignifier) && (SimulatedAdsDepth === 0 || playerTypeIndex >= SimulatedAdsDepth - 1)) || (!fallbackM3u8 && playerTypeIndex >= BackupPlayerTypes.length - 1)) {
                                            backupPlayerType = playerType;
                                            backupM3u8 = m3u8Text;
                                            break;
                                        }
                                        if (isFullyCachedPlayerType || isDoingMinimalRequests) {
                                            backupPlayerType = playerType;
                                            backupM3u8 = m3u8Text;
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch (err) { }
                    }

                    streamInfo.BackupEncodingsM3U8Cache[playerType] = null;
                    if (isFreshM3u8) {
                        break;
                    }
                }
            }

            if (!backupM3u8 && fallbackM3u8) {
                backupPlayerType = FallbackPlayerType;
                backupM3u8 = fallbackM3u8;
            }

            if (backupM3u8) {
                textStr = backupM3u8;
                if (streamInfo.ActiveBackupPlayerType !== backupPlayerType) {
                    streamInfo.ActiveBackupPlayerType = backupPlayerType;
                    console.log(`[VAFT] Blocking ${(streamInfo.IsMidroll ? 'midroll ' : '')}ads with clean stream (${backupPlayerType})`);
                }
            }

            const stripHevc = Boolean(isHevc && streamInfo.ModifiedM3U8);
            if (IsAdStrippingEnabled || stripHevc) {
                textStr = stripAdSegments(textStr, stripHevc, streamInfo);
            }
        } else if (streamInfo.IsShowingAd) {
            console.log('[VAFT] Finished ad block sequence');
            streamInfo.IsShowingAd = false;
            streamInfo.IsStrippingAdSegments = false;
            streamInfo.NumStrippedAdSegments = 0;
            streamInfo.ActiveBackupPlayerType = null;

            if (streamInfo.IsUsingModifiedM3U8 || ReloadPlayerAfterAd) {
                streamInfo.IsUsingModifiedM3U8 = false;
                streamInfo.LastPlayerReload = Date.now();
                postMessage({
                    key: 'ReloadPlayer'
                });
            }
        }

        postMessage({
            key: 'UpdateAdBlockBanner',
            isMidroll: streamInfo.IsMidroll,
            hasAds: streamInfo.IsShowingAd,
            isStrippingAdSegments: streamInfo.IsStrippingAdSegments,
            numStrippedAdSegments: streamInfo.NumStrippedAdSegments
        });

        return textStr;
    }

    function parseAttributes(str) {
        if (!str || typeof str !== 'string') return {};
        const result = {};
        const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]+))/g;
        let match;
        while ((match = regex.exec(str)) !== null) {
            const key = match[1];
            const rawVal = match[2] !== undefined ? match[2] : match[3];
            const num = Number(rawVal);
            result[key] = !isNaN(num) && rawVal.trim() !== '' ? num : rawVal;
        }
        return result;
    }

    function getAccessToken(channelName, playerType) {
        const body = {
            operationName: 'PlaybackAccessToken',
            variables: {
                isLive: true,
                login: channelName,
                isVod: false,
                vodID: '',
                playerType: playerType,
                platform: playerType === 'autoplay' ? 'android' : 'web'
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: PlaybackAccessTokenSha256 || '0828119ded1c13477966434e15800ff57ddace7ba0e7726cbf5094f8116c41b'
                }
            }
        };
        return gqlRequest(body, playerType);
    }

    function gqlRequest(body, playerType) {
        if (!GQLDeviceID) {
            GQLDeviceID = '';
            const dcharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';
            for (let i = 0; i < 32; i++) {
                GQLDeviceID += dcharacters.charAt(Math.floor(Math.random() * dcharacters.length));
            }
        }

        const headers = {
            'Client-ID': ClientID,
            'X-Device-Id': GQLDeviceID,
            'Content-Type': 'text/plain;charset=UTF-8'
        };

        if (AuthorizationHeader) headers['Authorization'] = AuthorizationHeader;
        if (ClientIntegrityHeader) headers['Client-Integrity'] = ClientIntegrityHeader;
        if (ClientVersion) headers['Client-Version'] = ClientVersion;
        if (ClientSession) headers['Client-Session-Id'] = ClientSession;

        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(2, 15);
            const fetchRequest = {
                id: requestId,
                url: 'https://gql.twitch.tv/gql',
                options: {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers
                }
            };
            pendingFetchRequests.set(requestId, { resolve, reject });
            postMessage({
                key: 'FetchRequest',
                value: fetchRequest
            });
        });
    }

    let playerForMonitoringBuffering = null;
    const playerBufferState = {
        channelName: null,
        hasStreamStarted: false,
        position: 0,
        bufferedPosition: 0,
        bufferDuration: 0,
        numSame: 0,
        lastFixTime: 0,
        isLive: true
    };

    function monitorPlayerBuffering() {
        if (playerForMonitoringBuffering) {
            try {
                const player = playerForMonitoringBuffering.player;
                const state = playerForMonitoringBuffering.state;
                const videoEl = player?.getHTMLVideoElement?.() || document.querySelector('video');

                if (!player?.core) {
                    playerForMonitoringBuffering = null;
                } else if (state?.props?.content?.type === 'live' && !player.isPaused() && videoEl && !videoEl.ended && playerBufferState.lastFixTime <= Date.now() - PlayerBufferingMinRepeatDelay && !isActivelyStrippingAds) {
                    const m3u8Url = player.core?.state?.path;
                    if (m3u8Url) {
                        try {
                            const fileName = new URL(m3u8Url).pathname.split('/').pop();
                            if (fileName?.endsWith('.m3u8')) {
                                const channelName = fileName.slice(0, -5);
                                if (playerBufferState.channelName !== channelName) {
                                    playerBufferState.channelName = channelName;
                                    playerBufferState.hasStreamStarted = false;
                                    playerBufferState.numSame = 0;
                                }
                            }
                        } catch {}
                    }

                    if (player.getState() === 'Playing' || (videoEl && !videoEl.paused && videoEl.readyState >= 3)) {
                        playerBufferState.hasStreamStarted = true;
                    }

                    const position = player.core?.state?.position ?? videoEl?.currentTime;
                    const bufferedPosition = player.core?.state?.bufferedPosition ?? (videoEl?.buffered?.length ? videoEl.buffered.end(videoEl.buffered.length - 1) : 0);
                    const bufferDuration = player.getBufferDuration ? player.getBufferDuration() : (bufferedPosition - position);

                    if (position !== undefined && bufferedPosition !== undefined) {
                        const isStalled = videoEl.readyState < 3 || player.core?.state?.state === 'Buffering';
                        const isPositionStuck = playerBufferState.position === position && position > 0;

                        if (playerBufferState.hasStreamStarted &&
                            (!PlayerBufferingPrerollCheckEnabled || position > PlayerBufferingPrerollCheckOffset) &&
                            isPositionStuck &&
                            isStalled &&
                            bufferDuration < PlayerBufferingDangerZone
                        ) {
                            playerBufferState.numSame++;
                            if (playerBufferState.numSame >= PlayerBufferingSameStateCount) {
                                console.log('[VAFT] Resolving real buffering stall pos:' + position + ' buffer:' + bufferDuration);
                                doTwitchPlayerTask(!PlayerBufferingDoPlayerReload, PlayerBufferingDoPlayerReload);
                                playerBufferState.lastFixTime = Date.now();
                                playerBufferState.numSame = 0;
                            }
                        } else {
                            playerBufferState.numSame = 0;
                        }

                        playerBufferState.position = position;
                        playerBufferState.bufferedPosition = bufferedPosition;
                        playerBufferState.bufferDuration = bufferDuration;
                    }
                }
            } catch (err) {
                playerForMonitoringBuffering = null;
            }
        }

        if (!playerForMonitoringBuffering) {
            const playerAndState = getPlayerAndState();
            if (playerAndState?.player && playerAndState?.state) {
                playerForMonitoringBuffering = {
                    player: playerAndState.player,
                    state: playerAndState.state
                };
            }
        }

        const isLive = playerForMonitoringBuffering?.state?.props?.content?.type === 'live';
        if (playerBufferState.isLive && !isLive) {
            updateAdblockBanner({ hasAds: false });
        }
        playerBufferState.isLive = isLive;

        setTimeout(monitorPlayerBuffering, PlayerBufferingDelay);
    }

    function updateAdblockBanner(data) {
        const playerRootDiv = document.querySelector('.video-player') ||
                              document.querySelector('[data-a-target="video-player"]') ||
                              document.querySelector('.video-player__container') ||
                              document.querySelector('.highwinds-player');
        if (!playerRootDiv) return;

        let adBlockDiv = playerRootDiv.querySelector('.adblock-overlay');
        if (!adBlockDiv) {
            adBlockDiv = document.createElement('div');
            adBlockDiv.className = 'adblock-overlay';
            adBlockDiv.innerHTML = '<div class="player-adblock-notice" style="color: #00f0ff; background-color: rgba(10, 10, 20, 0.85); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 4px; position: absolute; top: 12px; left: 12px; padding: 6px 12px; font-family: sans-serif; font-size: 13px; font-weight: 500; pointer-events: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"><p style="margin: 0;"></p></div>';
            adBlockDiv.style.display = 'none';
            playerRootDiv.appendChild(adBlockDiv);
        }

        const pElem = adBlockDiv.querySelector('p');
        if (pElem && data) {
            isActivelyStrippingAds = Boolean(data.isStrippingAdSegments);
            pElem.textContent = '🛡️ Blocage des pubs' + (data.isMidroll ? ' midroll' : '') + (data.isStrippingAdSegments ? ' (flux assaini)' : ' (flux direct)');
            adBlockDiv.style.display = data.hasAds && playerBufferState.isLive ? 'block' : 'none';
        }
    }

    function getPlayerAndState() {
        function findReactNode(root, constraint) {
            if (!root) return null;
            if (root.stateNode && constraint(root.stateNode)) {
                return root.stateNode;
            }
            let node = root.child;
            while (node) {
                const result = findReactNode(node, constraint);
                if (result) return result;
                node = node.sibling;
            }
            return null;
        }

        function findReactRootNode() {
            const rootNode = document.querySelector('#root');
            if (rootNode?._reactRootContainer?._internalRoot?.current) {
                return rootNode._reactRootContainer._internalRoot.current;
            }
            if (rootNode) {
                const containerKey = Object.keys(rootNode).find(x => x.startsWith('__reactContainer'));
                if (containerKey) {
                    return rootNode[containerKey];
                }
            }
            return null;
        }

        const reactRootNode = findReactRootNode();
        if (!reactRootNode) return null;

        let player = findReactNode(reactRootNode, node => node.setPlayerActive && node.props?.mediaPlayerInstance);
        player = player?.props?.mediaPlayerInstance ? player.props.mediaPlayerInstance : null;
        if (player?.playerInstance) {
            player = player.playerInstance;
        }
        const playerState = findReactNode(reactRootNode, node => node.setSrc && node.setInitialPlaybackSettings);

        return {
            player: player,
            state: playerState
        };
    }

    function doTwitchPlayerTask(isPausePlay, isReload) {
        const playerAndState = getPlayerAndState();
        if (!playerAndState?.player || !playerAndState?.state) return;

        const { player, state: playerState } = playerAndState;
        if (player.isPaused() || player.core?.paused) return;

        playerBufferState.lastFixTime = Date.now();
        playerBufferState.numSame = 0;

        if (isPausePlay) {
            player.pause();
            setTimeout(() => {
                try { player.play(); } catch {}
            }, 50);
            return;
        }

        if (isReload) {
            const lsKeyQuality = 'video-quality';
            const lsKeyMuted = 'video-muted';
            const lsKeyVolume = 'volume';
            let currentQualityLS = null;
            let currentMutedLS = null;
            let currentVolumeLS = null;

            try {
                currentQualityLS = localStorage.getItem(lsKeyQuality);
                currentMutedLS = localStorage.getItem(lsKeyMuted);
                currentVolumeLS = localStorage.getItem(lsKeyVolume);

                if (localStorageHookFailed && player?.core?.state) {
                    localStorage.setItem(lsKeyMuted, JSON.stringify({ default: player.core.state.muted }));
                    localStorage.setItem(lsKeyVolume, String(player.core.state.volume));
                    if (player.core.state.quality?.group) {
                        localStorage.setItem(lsKeyQuality, JSON.stringify({ default: player.core.state.quality.group }));
                    }
                }
            } catch {}

            console.log('[VAFT] Reloading Twitch player stream source');
            try {
                playerState.setSrc({ isNewMediaPlayerInstance: true, refreshAccessToken: true });
                postTwitchWorkerMessage('TriggeredPlayerReload');
                player.play();
            } catch {}

            if (localStorageHookFailed && (currentQualityLS || currentMutedLS || currentVolumeLS)) {
                setTimeout(() => {
                    try {
                        if (currentQualityLS) localStorage.setItem(lsKeyQuality, currentQualityLS);
                        if (currentMutedLS) localStorage.setItem(lsKeyMuted, currentMutedLS);
                        if (currentVolumeLS) localStorage.setItem(lsKeyVolume, currentVolumeLS);
                    } catch {}
                }, 3000);
            }
        }
    }

    window.reloadTwitchPlayer = () => {
        doTwitchPlayerTask(false, true);
    };

    function postTwitchWorkerMessage(key, value) {
        twitchWorkers.forEach((worker) => {
            try {
                worker.postMessage({ key, value });
            } catch {}
        });
    }

    async function handleWorkerFetchRequest(fetchRequest) {
        try {
            const response = await window.realFetch(fetchRequest.url, fetchRequest.options);
            const responseBody = await response.text();
            return {
                id: fetchRequest.id,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseBody
            };
        } catch (error) {
            return {
                id: fetchRequest.id,
                error: error.message
            };
        }
    }

    function getHeaderValue(headers, headerName) {
        if (!headers) return null;
        if (typeof headers.get === 'function') {
            return headers.get(headerName);
        }
        if (Array.isArray(headers)) {
            const entry = headers.find(([k]) => k.toLowerCase() === headerName.toLowerCase());
            return entry ? entry[1] : null;
        }
        if (typeof headers === 'object') {
            const lower = headerName.toLowerCase();
            for (const k of Object.keys(headers)) {
                if (k.toLowerCase() === lower) return headers[k];
            }
        }
        return null;
    }

    function hookFetch() {
        const realFetch = window.fetch;
        window.realFetch = realFetch;

        window.fetch = function (url, init, ...args) {
            if (typeof url === 'string' && url.includes('gql')) {
                const headers = init?.headers;
                if (headers) {
                    const deviceId = getHeaderValue(headers, 'X-Device-Id') || getHeaderValue(headers, 'Device-ID');
                    if (deviceId && GQLDeviceID !== deviceId) {
                        GQLDeviceID = deviceId;
                        postTwitchWorkerMessage('UpdateDeviceId', GQLDeviceID);
                    }

                    const clientVer = getHeaderValue(headers, 'Client-Version');
                    if (clientVer && clientVer !== ClientVersion) {
                        ClientVersion = clientVer;
                        postTwitchWorkerMessage('UpdateClientVersion', ClientVersion);
                    }

                    const clientSess = getHeaderValue(headers, 'Client-Session-Id');
                    if (clientSess && clientSess !== ClientSession) {
                        ClientSession = clientSess;
                        postTwitchWorkerMessage('UpdateClientSession', ClientSession);
                    }

                    const clientInteg = getHeaderValue(headers, 'Client-Integrity');
                    if (clientInteg && clientInteg !== ClientIntegrityHeader) {
                        ClientIntegrityHeader = clientInteg;
                        postTwitchWorkerMessage('UpdateClientIntegrityHeader', ClientIntegrityHeader);
                    }

                    const auth = getHeaderValue(headers, 'Authorization');
                    if (auth && auth !== AuthorizationHeader) {
                        AuthorizationHeader = auth;
                        postTwitchWorkerMessage('UpdateAuthorizationHeader', AuthorizationHeader);
                    }
                }

                if (init && typeof init.body === 'string' && init.body.includes('PlaybackAccessToken')) {
                    try {
                        let replaced = false;
                        const parsedBody = JSON.parse(init.body);
                        const items = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

                        for (const item of items) {
                            const hash = item?.extensions?.persistedQuery?.sha256Hash;
                            if (hash && hash !== PlaybackAccessTokenSha256) {
                                PlaybackAccessTokenSha256 = hash;
                                postTwitchWorkerMessage('UpdatePlaybackAccessTokenSha256', PlaybackAccessTokenSha256);
                            }
                            if (ForceAccessTokenPlayerType && item?.variables?.playerType && item.variables.playerType !== ForceAccessTokenPlayerType) {
                                item.variables.playerType = ForceAccessTokenPlayerType;
                                replaced = true;
                            }
                        }

                        if (replaced) {
                            init.body = JSON.stringify(Array.isArray(parsedBody) ? items : items[0]);
                        }
                    } catch {}
                }
            }
            return realFetch.apply(this, arguments);
        };
    }

    function onContentLoaded() {
        try {
            Object.defineProperty(document, 'visibilityState', {
                get: () => 'visible',
                configurable: true
            });
        } catch {}

        try {
            Object.defineProperty(document, 'hidden', {
                get: () => false,
                configurable: true
            });
        } catch {}

        const blockEvent = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        const onVisibilityChange = e => {
            const videos = document.getElementsByTagName('video');
            if (videos.length > 0) {
                if (!playerBufferState.hasStreamStarted) {
                    playerBufferState.hasStreamStarted = true;
                }
                if (videos[0].paused && !videos[0].ended) {
                    try { videos[0].play(); } catch {}
                }
            }
            blockEvent(e);
        };

        document.addEventListener('visibilitychange', onVisibilityChange, true);
        document.addEventListener('webkitvisibilitychange', onVisibilityChange, true);
        document.addEventListener('mozvisibilitychange', onVisibilityChange, true);
        document.addEventListener('hasFocus', blockEvent, true);

        try {
            const keysToCache = [
                'video-quality',
                'video-muted',
                'volume',
                'lowLatencyModeEnabled',
                'persistenceEnabled'
            ];
            const cachedValues = new Map();
            for (const key of keysToCache) {
                try {
                    cachedValues.set(key, localStorage.getItem(key));
                } catch {}
            }

            const realSetItem = localStorage.setItem.bind(localStorage);
            localStorage.setItem = function (key, value) {
                if (cachedValues.has(key)) {
                    cachedValues.set(key, value);
                }
                return realSetItem(key, value);
            };

            const realGetItem = localStorage.getItem.bind(localStorage);
            localStorage.getItem = function (key) {
                if (cachedValues.has(key)) {
                    const v = cachedValues.get(key);
                    if (v !== null && v !== undefined) return v;
                }
                return realGetItem(key);
            };
        } catch (err) {
            localStorageHookFailed = true;
        }
    }

    declareOptions(window);
    hookWindowWorker();
    hookFetch();

    if (PlayerBufferingFix) {
        monitorPlayerBuffering();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        onContentLoaded();
    } else {
        window.addEventListener('DOMContentLoaded', onContentLoaded, { once: true });
    }

    window.simulateAds = (depth) => {
        if (depth === undefined || depth < 0) {
            console.log('[VAFT] Ad depth required (0 = no simulated ad, 1+ = use backup player for given depth)');
            return;
        }
        postTwitchWorkerMessage('SimulateAds', depth);
    };

    window.allSegmentsAreAdSegments = () => {
        postTwitchWorkerMessage('AllSegmentsAreAdSegments');
    };

    if (typeof unsafeWindow !== 'undefined') {
        try {
            unsafeWindow.simulateAds = window.simulateAds;
            unsafeWindow.allSegmentsAreAdSegments = window.allSegmentsAreAdSegments;
            unsafeWindow.reloadTwitchPlayer = window.reloadTwitchPlayer;
        } catch {}
    }
})();
