// Git commit timeline finder for a specific author within a root folder of many repos.
// Runtime: Bun (works with Node as well for fs/path). Uses `git` CLI.

import { promises as fs } from "fs";
import path from "path";

type Args = {
	root: string;
	name?: string; // currently unused, we filter by email; name kept for future
	email: string;
	sort: "desc" | "asc"; // by commit date
	maxDepth: number; // limit directory traversal
	since?: string; // YYYY-MM-DD or git-compatible date
	until?: string; // YYYY-MM-DD or git-compatible date
	lastMonth?: boolean; // convenience: previous calendar month
	format: "plain" | "table" | "md"; // output style
		generateCompletion?: "zsh" | "bash" | "fish";
		cmdName?: string; // command name for completion; default 'git-timeline'
};

type Commit = {
	repo: string; // absolute repo path
	hash: string;
	date: string; // ISO 8601 string
	subject: string;
	body: string; // may be empty
};

const DEFAULT_ROOT = "/Users/peerapat.krai/Developer";
const DEFAULT_EMAIL = "peerapat.kra@skyai.co.th";
const DEFAULT_NAME = "Peerapat Krairat";

function parseArgs(argv: string[]): Args {
	// Accept:
	// --root <path> | --root=<path>
	// --email <email> | --email=<email>
	// --name <name> | --name=<name>
	// --sort asc|desc
	// --max-depth <n>
	const args: Args = {
		root: DEFAULT_ROOT,
		email: DEFAULT_EMAIL,
		name: DEFAULT_NAME,
		sort: "desc",
		maxDepth: 6,
			since: undefined,
			until: undefined,
			lastMonth: false,
			format: "plain",
				generateCompletion: undefined,
				cmdName: undefined,
	};
	const it = argv[Symbol.iterator]();
	// skip first two entries (bun/node & script)
	it.next();
	it.next();
	for (let cur = it.next(); !cur.done; cur = it.next()) {
		const token = cur.value as string;
		const [key, maybeVal] = token.startsWith("--") && token.includes("=")
			? token.split("=", 2)
			: [token, undefined];

		const takeVal = (fallback?: string) => {
			if (maybeVal !== undefined) return maybeVal;
			const n = it.next();
			if (n.done) return fallback ?? "";
			return n.value as string;
		};

		switch (key) {
			case "--root":
				args.root = path.resolve(takeVal());
				break;
			case "--email":
				args.email = takeVal();
				break;
			case "--name":
				args.name = takeVal();
				break;
			case "--sort": {
				const v = takeVal().toLowerCase();
				args.sort = v === "asc" ? "asc" : "desc";
				break;
			}
			case "--max-depth": {
				const v = Number(takeVal());
				if (!Number.isNaN(v) && v > 0) args.maxDepth = v;
				break;
			}
					case "--format": {
						const v = takeVal().toLowerCase();
						if (v === "table" || v === "md") args.format = v;
						else args.format = "plain";
						break;
					}
							case "--generate-completion": {
								const v = takeVal().toLowerCase();
								if (v === "zsh" || v === "bash" || v === "fish") args.generateCompletion = v;
								break;
							}
							case "--cmd-name":
								args.cmdName = takeVal();
								break;
					case "--since":
						args.since = takeVal();
						break;
					case "--until":
						args.until = takeVal();
						break;
					case "--last-month":
						args.lastMonth = true;
						break;
			case "-h":
			case "--help":
				printHelp();
				process.exit(0);
			default:
				// ignore unknown flags to be tolerant
				break;
		}
	}
	return args;
}

function printHelp() {
	const help = `
Usage: bun index.ts [options]

Options:
	--root <path>         Root folder to search for git repositories (default: ${DEFAULT_ROOT})
	--email <email>       Author email to match (default: ${DEFAULT_EMAIL})
	--name <name>         Author name to match (informational; not used for filtering)
	--sort <asc|desc>     Sort by commit date ascending or descending (default: desc)
	--max-depth <n>       Maximum directory depth to traverse (default: 6)
		--format <plain|table|md>  Output format (default: plain). 'table' for terminal table, 'md' for Markdown table
		--generate-completion <zsh|bash|fish>  Print shell completion script to stdout
		--cmd-name <name>     Command name used inside completion script (default: git-timeline)
	--since <date>        Only include commits after/on this date (git accepts many forms, e.g. 2025-09-01)
	--until <date>        Only include commits before/on this date (e.g. 2025-10-01)
	--last-month          Convenience flag: set --since and --until to the previous calendar month
	-h, --help            Show this help
`;
	console.log(help.trim());
}

const IGNORED_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".next",
	"out",
	"target",
	"vendor",
	".venv",
	".direnv",
]);

async function isDirectory(p: string): Promise<boolean> {
	try {
		const st = await fs.lstat(p);
		return st.isDirectory();
	} catch {
		return false;
	}
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function isGitRepo(dir: string): Promise<boolean> {
	// .git can be a directory or a file pointing to gitdir
	const dotGit = path.join(dir, ".git");
	if (!(await pathExists(dotGit))) return false;
	try {
		const st = await fs.lstat(dotGit);
		if (st.isDirectory()) return true;
		if (st.isFile()) {
			const content = await fs.readFile(dotGit, "utf8");
			return /gitdir:/.test(content);
		}
	} catch {}
	return false;
}

async function findGitRepos(root: string, maxDepth: number): Promise<string[]> {
	const repos: string[] = [];

	async function walk(current: string, depth: number) {
		if (depth > maxDepth) return;
		if (!(await isDirectory(current))) return;

		if (await isGitRepo(current)) {
			repos.push(current);
			return; // don't descend into a repo; treat it as a unit
		}

		let entries: string[] = [];
		try {
			entries = await fs.readdir(current);
		} catch {
			return;
		}

		await Promise.all(
			entries.map(async (name) => {
				if (IGNORED_DIRS.has(name)) return;
				const p = path.join(current, name);
				try {
					const st = await fs.lstat(p);
					if (st.isDirectory()) {
						await walk(p, depth + 1);
					}
				} catch {
					/* ignore */
				}
			})
		);
	}

	await walk(root, 0);
	return repos;
}

function runGitLog(repo: string, authorEmail: string, since?: string, until?: string): string {
	// Use stable machine-parseable separators
	const pretty = "%H%x1f%ad%x1f%s%x1f%b%x1e";
	const cmd = [
		"git",
		"log",
		`--author=${authorEmail}`,
		"--date=iso-strict",
		`--pretty=format:${pretty}`,
	];
	if (since) cmd.push(`--since=${since}`);
	if (until) cmd.push(`--until=${until}`);

	// Prefer Bun.spawnSync when available; fallback to child_process for Node.
	try {
		// @ts-ignore - Bun may not be typed in some environments
		if (typeof (globalThis as any).Bun !== "undefined" && typeof (Bun as any).spawnSync === "function") {
			const proc = (Bun as any).spawnSync({
				cmd,
				cwd: repo,
				stdout: "pipe",
				stderr: "pipe",
			});
			if (proc.exitCode === 0) {
				return new TextDecoder().decode(proc.stdout);
			}
			const err = new TextDecoder().decode(proc.stderr);
			if (err) console.error(`[git log error] ${repo}:`, err.trim());
			return "";
		}
	} catch {
		// fall through to child_process
	}

	// Node fallback
	const { spawnSync } = require("child_process");
	const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: repo, encoding: "utf8" });
	if (proc.status === 0) return proc.stdout as string;
	if (proc.stderr) console.error(`[git log error] ${repo}:`, String(proc.stderr).trim());
	return "";
}

function parseGitLogOutput(repo: string, output: string): Commit[] {
	if (!output) return [];
	const records = output.split("\x1e");
	const commits: Commit[] = [];
	for (const rec of records) {
		if (!rec.trim()) continue;
		const [hash, date, subject, body] = rec.split("\x1f");
		if (!hash || !date) continue;
		commits.push({ repo, hash, date, subject: subject || "", body: body || "" });
	}
	return commits;
}

function formatCommit(c: Commit, root: string): string {
	const relRepo = path.relative(root, c.repo) || c.repo;
	const shortHash = c.hash.slice(0, 7);
	const body = c.body.trim();
	const lines = [
		`${c.date}  [${relRepo}]  ${shortHash}  ${c.subject}`,
	];
	if (body) {
		lines.push(
			...body.split(/\r?\n/).map((l) => (l ? `    ${l}` : ""))
		);
	}
	return lines.join("\n");
}

function toTableRows(commits: Commit[], root: string) {
	return commits.map((c) => {
		const relRepo = path.relative(root, c.repo) || c.repo;
		return {
			Date: c.date,
			Repo: relRepo,
			Hash: c.hash.slice(0, 7),
			Title: c.subject,
			Description: c.body.trim().replace(/\s+/g, " "),
		};
	});
}

function printTable(commits: Commit[], root: string) {
	const rows = toTableRows(commits, root);
	if (rows.length === 0) return console.log("No commits found for the specified author.");

	// Compute column widths
	const headers = ["Date", "Repo", "Hash", "Title", "Description"] as const;
	const widths: Record<typeof headers[number], number> = {
		Date: 10,
		Repo: 10,
		Hash: 7,
		Title: 5,
		Description: 11,
	} as any;

	for (const h of headers) {
		widths[h] = Math.max(widths[h], h.length, ...rows.map((r) => String(r[h]).length));
	}

	const pad = (s: string, w: number) => (s.length >= w ? s : s + " ".repeat(w - s.length));
	const line = (char = "-") => char.repeat(headers.reduce((acc, h) => acc + widths[h] + 3, 1));

	// Print header
	let out = "";
	out += "| " + headers.map((h) => pad(h, widths[h])).join(" | ") + " |\n";
	out += line() + "\n";
	// Print rows
	for (const r of rows) {
		out +=
			"| " + headers.map((h) => pad(String((r as any)[h]), widths[h])).join(" | ") + " |\n";
	}
	console.log(out);
}

function printMarkdownTable(commits: Commit[], root: string) {
	const rows = toTableRows(commits, root);
	if (rows.length === 0) return console.log("No commits found for the specified author.");

	const headers = ["Date", "Repo", "Hash", "Title", "Description"];
	const sep = [":-", ":-", ":-:", ":-", ":-"]; // align center only for hash
	let out = "| " + headers.join(" | ") + " |\n";
	out += "| " + sep.join(" | ") + " |\n";
	for (const r of rows) {
		out += `| ${r.Date} | ${r.Repo} | ${r.Hash} | ${r.Title} | ${r.Description} |\n`;
	}
	console.log(out);
}

function generateCompletion(shell: "zsh" | "bash" | "fish", cmdName = "git-timeline"): string {
	const fn = cmdName.replace(/-/g, "_");
	if (shell === "zsh") {
		const lines = [
			`#compdef ${cmdName}`,
			"",
			`_${fn}() {`,
			"  local -a args",
			"  args=(",
			"    '--root[Root folder to search]:path:_files -/'",
			"    '--email[Author email]'",
			"    '--name[Author name]'",
			"    '--sort[Sort order]: :(asc desc)'",
			"    '--max-depth[Maximum directory depth]:number'",
			"    '--since[Only include commits after/on this date]'",
			"    '--until[Only include commits before/on this date]'",
			"    '--last-month[Previous calendar month]'",
			"    '--format[Output format]: :(plain table md)'",
			"    '--generate-completion[Generate completion script]: :(zsh bash fish)'",
			"    '--cmd-name[Command name for completion script]'",
			"    '--help[Show help]'",
			"  )",
			"  _arguments -s $args",
			"}",
			"",
			`compdef _${fn} ${cmdName}`,
		];
		return lines.join("\n");
	}
	if (shell === "bash") {
		const lines = [
			`_${fn}_complete() {`,
			"  local cur prev opts",
			"  COMPREPLY=()",
			"  cur=\"${COMP_WORDS[COMP_CWORD]}\"",
			"  prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
			"  opts=\"--root --email --name --sort --max-depth --since --until --last-month --format --generate-completion --cmd-name --help\"",
			"  case \"$prev\" in",
			"    --sort)",
			"      COMPREPLY=( $(compgen -W \"asc desc\" -- \"$cur\") ); return 0 ;;",
			"    --format)",
			"      COMPREPLY=( $(compgen -W \"plain table md\" -- \"$cur\") ); return 0 ;;",
			"    --generate-completion)",
			"      COMPREPLY=( $(compgen -W \"zsh bash fish\" -- \"$cur\") ); return 0 ;;",
			"  esac",
			"  COMPREPLY=( $(compgen -W \"$opts\" -- \"$cur\") )",
			"}",
			`complete -F _${fn}_complete ${cmdName}`,
		];
		return lines.join("\n");
	}
	// fish
	const lines = [
		`complete -c ${cmdName} -l root -d "Root folder to search" -r`,
		`complete -c ${cmdName} -l email -d "Author email" -r`,
		`complete -c ${cmdName} -l name -d "Author name" -r`,
		`complete -c ${cmdName} -l sort -d "Sort order" -r -a "asc desc"`,
		`complete -c ${cmdName} -l max-depth -d "Maximum directory depth" -r`,
		`complete -c ${cmdName} -l since -d "Only include commits after/on this date" -r`,
		`complete -c ${cmdName} -l until -d "Only include commits before/on this date" -r`,
		`complete -c ${cmdName} -l last-month -d "Previous calendar month"`,
		`complete -c ${cmdName} -l format -d "Output format" -r -a "plain table md"`,
		`complete -c ${cmdName} -l generate-completion -d "Generate completion script" -r -a "zsh bash fish"`,
		`complete -c ${cmdName} -l cmd-name -d "Command name for completion script" -r`,
		`complete -c ${cmdName} -l help -d "Show help"`,
	];
	return lines.join("\n");
}

async function main() {
	const args = parseArgs(typeof Bun !== "undefined" ? Bun.argv : process.argv);
	const { root, email, sort, maxDepth } = args;

	// If user requested completion script, print and exit
	if (args.generateCompletion) {
		const cmdName = args.cmdName || "git-timeline";
		const script = generateCompletion(args.generateCompletion, cmdName);
		console.log(script);
		return;
	}

	// Resolve last-month convenience into since/until if requested
	if (args.lastMonth) {
		const now = new Date();
		const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		// Use YYYY-MM-DD format which git accepts. We use until as first day of this month (exclusive end).
		const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		args.since = fmt(firstOfLastMonth);
		args.until = fmt(firstOfThisMonth);
	}

	console.error(`Scanning for git repos under: ${root}`);
	const repos = await findGitRepos(root, maxDepth);
		const rangeDesc = args.since || args.until ? ` (range: ${args.since ?? "-"} .. ${args.until ?? "-"})` : "";
		console.error(`Found ${repos.length} repos. Collecting commits for ${email}${rangeDesc}...`);

	let all: Commit[] = [];
		for (const repo of repos) {
			const out = runGitLog(repo, email, args.since, args.until);
		const commits = parseGitLogOutput(repo, out);
		all.push(...commits);
	}

	all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	if (sort === "desc") all.reverse();

		if (args.format === "table") {
			printTable(all, root);
		} else if (args.format === "md") {
			printMarkdownTable(all, root);
		} else {
			if (all.length === 0) {
				console.log("No commits found for the specified author.");
				return;
			}
			const formatted = all.map((c) => formatCommit(c, root)).join("\n\n");
			console.log(formatted);
		}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
