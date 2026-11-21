# Security Specification — Spike Legends Online

## 1. Data Invariants
- **PII Isolation**: Email addresses and user settings live strictly in `/userAccounts/{userId}`, readable and writable only when `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
- **Identity Integrity**: Every document in `/publicProfiles/{userId}` and `/matchHistory/{matchId}` enforces `uid == request.auth.uid` or `ownerUid == request.auth.uid`.
- **Anti-Tamper Progression**: `publicProfiles` updates validate exact allowed keys, numeric bounds (e.g., `level >= 1 && level <= 500`, `elo >= 0 && elo <= 5000`, single-match increments bounded), and server timestamps (`updatedAt == request.time`).
- **Immutable Match Records**: `/matchHistory/{matchId}` entries cannot be updated or deleted once created (`allow update, delete: if false;`) and enforce `createdAt == request.time`.
- **ID & Size Hardening**: Every path ID matches `^[a-zA-Z0-9_\-]+$` with length `<= 128`, and every string field enforces explicit `.size()` limits.
- **Cloud Audio Persistence Hardening**: `/audioConfig/{configId}`, `/audioTracks/{trackId}`, and `/audioBlobs/{chunkId}` enforce strict schema blueprints (`hasAll`, `hasOnly`), MIME-type allowlists (`.mp3`, `.wav`, `.ogg`), bounded chunk sizes (`<= 750KB`), and server timestamps (`request.time`).

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read on `/userAccounts/user1` -> `PERMISSION_DENIED`
2. Authenticated non-owner read on `/userAccounts/otherUser` -> `PERMISSION_DENIED`
3. Unverified email user writing `/publicProfiles/user1` -> `PERMISSION_DENIED`
4. Shadow update adding ghost field `{ isAdmin: true }` on `/publicProfiles/user1` -> `PERMISSION_DENIED`
5. Identity spoofing creating `/publicProfiles/user1` with `uid: "victim"` -> `PERMISSION_DENIED`
6. Value poisoning setting `displayName` to a 500-char string -> `PERMISSION_DENIED`
7. Client timestamp forgery setting `updatedAt` to a past static timestamp -> `PERMISSION_DENIED`
8. Invalid character enum `avatarCharacterId: "hacker_bot"` -> `PERMISSION_DENIED`
9. Negative or absurd Elo poisoning `elo: 999999` -> `PERMISSION_DENIED`
10. Cross-user `list` query on `/matchHistory` without `ownerUid == request.auth.uid` -> `PERMISSION_DENIED`
11. Attempting to mutate an existing `/matchHistory/m1` record -> `PERMISSION_DENIED`
12. Malformed path ID (`1.5KB` junk string) on `/publicProfiles/{id}` or `/audioTracks/{id}` -> `PERMISSION_DENIED`
