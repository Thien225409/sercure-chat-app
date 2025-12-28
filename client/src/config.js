export const CA_PUBLIC_KEY = {
    // Placeholder CA Key (ECDSA P-384)
    // In a real app, this is hardcoded from the build or fetched.
    // I will use a dummy one for now, or we can generate one on first use (not persistent though).
    // For now, let's assume valid JWK.
    "crv": "P-384",
    "ext": true,
    "kty": "EC",
    "x": "StartChatting", // Invalid, but needs to be replaced.
    "y": "StartChatting"
};

export const GOV_PUBLIC_KEY = {
    // Placeholder Gov Key (ECDH P-384)
    "crv": "P-384",
    "ext": true,
    "kty": "EC",
    "x": "ImWatchingYou",
    "y": "ImWatchingYou"
};
