# Manual Testing Guide

This document provides a guide for manually testing the multi-repo workspace functionality, including node clicking to generate/open graphs and refresh functionality to clear cache.

## Prerequisites

1. VS Code with the Wildest AI extension installed
2. Multiple Git repositories open in a VS Code workspace
3. Some uncommitted changes and/or staged changes in the repositories

## Test Scenarios

### 1. Multi-Repository Workspace Setup

**Setup:**
1. Open VS Code
2. Use `File > Open Workspace...` or create a new workspace
3. Add multiple folders that are Git repositories to the workspace
4. Ensure each repository has some changes (either staged or unstaged)

**Expected Result:**
- The Wildest AI sidebar should show the "Explorer" view
- Under the "Change Selector" section, you should see either:
  - If single repo: Direct "Changes" and "Staged Changes" nodes
  - If multiple repos: Repository nodes, each expandable to show "Changes" and "Staged Changes"

### 2. Node Clicking - Generate/Open Graphs

**Test Steps:**
1. Navigate to the Wildest AI sidebar
2. Expand the "Explorer" view if collapsed
3. Click on a "Changes" node (for unstaged changes)
4. Click on a "Staged Changes" node (for staged changes)

**Expected Results:**
- Clicking a "Changes" node should:
  - Show progress notification "Generating unstaged DiffGraph..."
  - Show loading screen in the DiffGraph webview
  - Generate HTML diff graph
  - Display the graph in the shared DiffGraph webview
  - Cache the result for future quick access

- Clicking a "Staged Changes" node should:
  - Show progress notification "Generating staged DiffGraph..."
  - Show loading screen in the DiffGraph webview
  - Generate HTML diff graph for staged changes
  - Display the graph in the shared DiffGraph webview
  - Cache the result for future quick access

**Multiple Repository Testing:**
- If you have multiple repos, test clicking nodes from different repositories
- Verify that each repository generates its own separate graph
- Confirm that graphs from different repos don't interfere with each other

### 3. Cache Behavior Testing

**First Click (Cache Miss):**
1. Click on a "Changes" node
2. Observe the generation time and progress notification

**Second Click (Cache Hit):**
1. Click on the same "Changes" node again
2. The graph should open immediately without generation delay
3. Check the Output Panel (View > Output > Select "WildestAI") for cache hit messages

**Expected Output Panel Messages:**
- Cache miss: `Executed: wild diff --output /tmp/wildest-...html --no-open`
- Cache hit: `Using cached unstaged diff for [repo-name]`

### 4. Refresh Functionality - Cache Clearing

**Test Steps:**
1. Click on a "Changes" node to generate and cache a graph
2. Right-click on the same "Changes" node
3. Select "Refresh Changes" from the context menu
4. OR use the refresh button in the view title when the node is selected

**Expected Results:**
- Should show progress notification for regeneration
- Cache should be invalidated and new content generated
- Output Panel should show cache invalidation message: `Cache invalidated for unstaged diff in [repo-name]`
- New graph should be generated and displayed

**Testing Staged Changes Refresh:**
1. Repeat the same process with "Staged Changes" nodes
2. Use "Refresh Staged Changes" command
3. Verify similar behavior for staged content

### 5. Global Refresh Testing

**Test Steps:**
1. Generate graphs for multiple repositories/stages
2. Use the "Refresh DiffGraph Explorer" command from the view title
3. This should update the repository list and refresh the tree

**Expected Results:**
- Tree view should refresh
- Repository list should update if repositories were added/removed from workspace
- Existing caches should remain intact unless explicitly refreshed per node

### 6. Multi-Stage Testing

**Test with Both Staged and Unstaged Changes:**
1. Make some changes to files but don't stage them
2. Stage some other changes
3. Test both "Changes" and "Staged Changes" nodes from the same repository
4. Verify that both generate separate cached entries
5. Refresh one and verify the other remains cached

**Expected Results:**
- Both staged and unstaged should generate separate cache entries
- Refreshing one should not affect the cache of the other
- Different content should be shown in each graph

### 7. Edge Cases

**Empty Repository State:**
- Test with repositories that have no changes
- Verify graceful handling and appropriate error messages

**Repository Removal:**
- Remove a repository from the workspace
- Verify that the explorer updates correctly
- Test that old cache entries don't interfere

**Large Repository Testing:**
- Test with repositories containing many files/changes
- Verify progress reporting works correctly
- Check that large graphs are generated and cached properly

## Verification Points

### UI Behavior
- [ ] Nodes are clickable and show appropriate commands
- [ ] Progress notifications appear during generation
- [ ] Loading screen appears before graph generation
- [ ] Generated graphs display in the shared DiffGraph webview
- [ ] Context menus show refresh options
- [ ] Icons are displayed correctly for each node type

### Cache Behavior
- [ ] First click generates new content (slower)
- [ ] Subsequent clicks use cached content (faster)
- [ ] Refresh commands invalidate cache
- [ ] Multi-repo caches are isolated
- [ ] Staged/unstaged caches are separate

### Output Logging
- [ ] CLI commands are logged
- [ ] Cache hit/miss events are logged
- [ ] Cache invalidation events are logged
- [ ] Error messages are clear and helpful

### Performance
- [ ] Initial generation completes in reasonable time
- [ ] Cached content loads immediately
- [ ] UI remains responsive during generation
- [ ] Memory usage is reasonable with multiple cached items

## Troubleshooting

**If graphs don't generate:**
1. Check Output Panel for error messages
2. Verify Git repositories have changes
3. Ensure the binary is present and executable

**If cache doesn't work:**
1. Check Output Panel for cache messages
2. Verify temporary files are being created
3. Test with simple repositories first

**If multi-repo doesn't work:**
1. Ensure workspace has multiple Git folders
2. Verify repositories are detected by VS Code Git extension
3. Check that each repository has the correct structure
