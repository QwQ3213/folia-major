# Playlist shuffle

Collection pages bind their current resource and playback port in
`src/library/app/PlaylistShuffleButton.tsx`. Buttons beside Play All and the
`playlist-shuffle` command call the same action. Its pending state survives library
renderer changes. No source-specific playback API is introduced.

## Preparation

- Retain the collection resource until preparation settles, including after navigation.
- Online resources explicitly opt into a fresh occurrence-preserving read on first use.
  Normal collection readers retain their original merge rules.
- Wait for an explicit complete snapshot. A stalled upstream or interrupted sync must
  not commit a partial queue. Reuse later complete live snapshots of that resource.
- Cancel when a newer play/preparation, queue replacement, context change, clear or
  provider drop overtakes the request. Release listeners and retention on settlement.
- Exclude only known unavailable songs before creating the initial queue. Do not fetch
  audio addresses for every track.

## Queue identity and rounds

Each new occurrence carries `playlistShuffle: { session, occurrence }`. Media identity
still uses the original provider/media key; queue position uses the occurrence where
available. Metadata replacement, video-to-song mapping, local rebuilds, and restore
must preserve the occurrence. These fields follow existing `last_song` / `last_queue`
persistence without adding or renaming storage keys.

List-loop rounds shuffle the current edited queue, retaining temporarily unavailable
rows. They start at a playable item and avoid immediately repeating the previous last
playable song when an alternative exists. The ordinary end-of-track path owns this
boundary; Automix must not prepare the old first song across a shuffle-round boundary.
Normal queue shuffle, single-track looping and radio behavior retain their existing
contracts.

## Validation

Pure shuffle, full-page completion, preparation cancellation, duplicate occurrence
refresh, actual online-page merging and round boundaries have targeted unit coverage.
Real account/network/DRM verification is separate from these simulated tests and must
be recorded per provider and operating system. Task documents are local only.
