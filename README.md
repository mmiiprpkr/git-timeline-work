# git-timeline-work
Git Commit Timeline Finder
==========================

Find all Git commits authored by you under a root folder that contains many repositories. Outputs commit date, repo, short hash, subject, and description/body, sorted by date.

Requirements
------------
- Bun runtime installed
- Git CLI available in PATH

Quick start
-----------

Default search (uses your details and root from the prompt):

```
bun run index.ts
```

Or via script:

```
bun run timeline
```

Options
-------

- `--root <path>`: Root folder to search for git repositories. Default: `/Users/peerapat.krai/Developer`
- `--email <email>`: Author email to match. Default: `peerapat.kra@skyai.co.th`
- `--name <name>`: Author name (informational; not used for filtering)
- `--sort <asc|desc>`: Sort by commit date (default: `desc`)
- `--max-depth <n>`: Limit folder traversal depth (default: `6`)
- `--since <date>`: Only include commits after/on this date (e.g. `2025-09-01`)
- `--until <date>`: Only include commits before/on this date (e.g. `2025-10-01`)
- `--last-month`: Shortcut to filter to the previous calendar month
- `--format <plain|table|md>`: Output format (default `plain`) — `table` for terminal table, `md` for Markdown table
- `-h, --help`: Show help

Examples
--------

```
# Search a different root and sort ascending
bun run index.ts --root ~/Developer --sort asc

# Specify a different email
bun run index.ts --email someone@example.com

# Only last month
bun run index.ts --last-month

# Custom range: Sept 2025
bun run index.ts --since 2025-09-01 --until 2025-10-01

# Show as table (terminal)
bun run index.ts --last-month --format table

# Show as Markdown table (good for copy to docs)
bun run index.ts --last-month --format md
```

Output format
-------------

Each commit is printed like:

```
2024-11-05T13:47:10+07:00  [some/repo]  a1b2c3d  Fix bug title
	Optional multi-line description body
```
To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
