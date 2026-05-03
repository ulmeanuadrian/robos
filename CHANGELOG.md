# Changelog

All notable changes to RobOS will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-04

### Added
- Command Centre dashboard with real-time skill status and session metrics
- Skills system with catalog, install/remove lifecycle, and auto-registration
- Brand context framework (voice, audience, positioning, samples, assets)
- Cron scheduling daemon with job templates and per-client schedules
- Multi-client workspace support with isolated brand/context/projects per client
- Session memory with daily journal format and auto-tracking
- Setup, start, stop, and update scripts
- Skill management scripts (add, remove, list)
- Graceful degradation across all context levels (zero-config to full brand)
