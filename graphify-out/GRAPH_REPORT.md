# Graph Report - .  (2026-11-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 132 nodes · 225 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7400049f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7

## God Nodes (most connected - your core abstractions)
1. `AttendanceEngine` - 23 edges
2. `AnvizProtocolEngine` - 18 edges
3. `Sanitizer` - 9 edges
4. `writeJson()` - 8 edges
5. `CrossChexCloudEngine` - 7 edges
6. `switchTab()` - 7 edges
7. `toArgentinaLocal()` - 6 edges
8. `scripts` - 6 edges
9. `fetchRecordsFromClock()` - 5 edges
10. `readJson()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.22
Nodes (5): AttendanceEngine, readJson(), toArgentinaLocal(), writeJson(), seedDemoDataIfEmpty()

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (4): AnvizNetworkScanner, AnvizProtocolEngine, socket, socket

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (16): DATA_DIR, DEVICES_FILE, __dirname, EMPLOYEES_FILE, __filename, LOGS_FILE, TOMBSTONES_FILE, DATA_DIR (+8 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (18): author, description, keywords, license, main, name, scripts, agent (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.21
Nodes (15): applyLogsFilters(), currentDevices, currentEmployees, currentLogs, loadDashboard(), loadDevices(), loadEmployees(), loadLiveStatus() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (10): __dirname, __filename, major, minor, parts, patch, pkg, pkgPath (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (9): CACHE_FILE, CONFIG, __dirname, fetchRecordsFromClock(), __filename, loadOfflineQueue(), pollCycle(), saveOfflineQueue() (+1 more)

## Knowledge Gaps
- **52 isolated node(s):** `__filename`, `__dirname`, `CACHE_FILE`, `CONFIG`, `__filename` (+47 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AnvizProtocolEngine` connect `Community 1` to `Community 2`, `Community 6`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `AttendanceEngine` connect `Community 0` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `CrossChexCloudEngine` connect `Community 7` to `Community 2`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `__filename`, `__dirname`, `CACHE_FILE` to the rest of the system?**
  _52 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1471861471861472 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._