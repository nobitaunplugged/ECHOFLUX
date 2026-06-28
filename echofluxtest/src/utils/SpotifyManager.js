const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }

    if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_ID.includes("here")) {
        throw new Error("Spotify credentials are not configured in your .env file.");
    }

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    if (!response.ok) {
        throw new Error(`Failed to authenticate with Spotify API: ${response.statusText}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // Buffer by 60 seconds

    return accessToken;
}

function parseSpotifyUrl(url) {
    if (typeof url !== 'string') return null;
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes("spotify.com")) return null;
        
        const paths = parsed.pathname.split("/").filter(Boolean);
        if (paths.length >= 2 && paths[0] === "user") {
            return {
                type: "user",
                id: paths[1]
            };
        }
        if (paths.length >= 2 && paths[0] === "playlist") {
            return {
                type: "playlist",
                id: paths[1]
            };
        }
    } catch (e) {}
    return null;
}

async function fetchUserData(url) {
    const parsed = parseSpotifyUrl(url);
    if (!parsed || parsed.type !== "user") return null;

    const token = await getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/users/${parsed.id}`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Spotify User API returned code ${response.status}`);

    const data = await response.json();
    return {
        id: data.id,
        displayName: data.display_name,
        images: data.images,
        profileUrl: data.external_urls?.spotify || url
    };
}

async function fetchUserPlaylists(url) {
    const parsed = parseSpotifyUrl(url);
    if (!parsed || parsed.type !== "user") return [];

    const token = await getAccessToken();
    let playlists = [];
    let nextUrl = `https://api.spotify.com/v1/users/${parsed.id}/playlists?limit=50`;

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error(`Spotify Playlists API returned code ${response.status}`);

        const data = await response.json();
        const items = data.items || [];
        
        for (const item of items) {
            if (!item) continue;
            playlists.push({
                id: item.id,
                name: item.name,
                trackCount: item.tracks?.total || 0,
                owner: item.owner?.display_name || item.owner?.id || "Unknown",
                coverUrl: item.images?.[0]?.url || null,
                playlistUrl: item.external_urls?.spotify || ""
            });
        }
        nextUrl = data.next;
    }

    return playlists;
}

async function fetchPlaylistTracks(playlistId) {
    const token = await getAccessToken();
    let tracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error(`Spotify Playlist Tracks API returned code ${response.status}`);

        const data = await response.json();
        const items = data.items || [];

        for (const item of items) {
            if (!item || !item.track) continue;
            const t = item.track;
            tracks.push({
                name: t.name,
                artists: t.artists?.map(a => a.name).join(", ") || "Unknown Artist",
                duration: t.duration_ms || 0,
                uri: t.external_urls?.spotify || "",
                isrc: t.external_ids?.isrc || null
            });
        }
        nextUrl = data.next;
    }

    return tracks;
}

module.exports = {
    parseSpotifyUrl,
    fetchUserData,
    fetchUserPlaylists,
    fetchPlaylistTracks
};
