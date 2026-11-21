# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-11-21

First public release.

### Added
- Query-driven search over ~460 company boards and keyword aggregators.
- Two-tier filtering (deterministic L1, Claude L2) with semantic rescue.
- Local web UI.

### Changed
- Runs on Node 22+ and npm (was Bun).
- Upgraded to zod 4 and transformers.js 4.3.

### Fixed
- Embeddings failing in the server.
- Remote listings restricted to other countries slipping past the location filter.

### Removed
- 10 dead boards.
- The Muse is off by default (Cloudflare 403).
